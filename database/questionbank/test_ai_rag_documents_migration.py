"""Disposable Docker integration test for the prepared Question Bank migration."""
import hashlib
import json
import os
import socket
import subprocess
import sys
import time
import uuid
from pathlib import Path

import psycopg2
from psycopg2 import errors

ROOT = Path(__file__).resolve().parents[2]
MIGRATION = ROOT / "database/questionbank/migrations/001_ai_rag_documents.sql"
ROLLBACK = ROOT / "database/questionbank/rollback/001_ai_rag_documents.rollback.sql"
IMAGE = os.getenv("EXAMFLOW_PGVECTOR_TEST_IMAGE", "pgvector/pgvector:pg17")
NAME = "examflow-rag-migration-" + uuid.uuid4().hex[:10]
PASSWORD = "synthetic-rag-test-only"


def docker(*args, timeout=90):
    result = subprocess.run(["docker", *args], capture_output=True, text=True,
                            timeout=timeout, check=False)
    if result.returncode:
        raise RuntimeError((result.stdout + result.stderr).strip())
    return result.stdout.strip()


def free_port():
    with socket.socket() as listener:
        listener.bind(("127.0.0.1", 0))
        return listener.getsockname()[1]


def connect(port):
    return psycopg2.connect(host="127.0.0.1", port=port, dbname="postgres",
                            user="postgres", password=PASSWORD, connect_timeout=5)


def wait_ready(port):
    for _ in range(60):
        try:
            connection = connect(port)
            connection.close()
            return
        except psycopg2.Error:
            time.sleep(0.5)
    raise RuntimeError("Disposable pgvector PostgreSQL did not become ready")


def baseline(connection):
    vector = "[" + ",".join(["0"] * 768) + "]"
    with connection.cursor() as cursor:
        cursor.execute("CREATE TABLE public.questions(id bigint PRIMARY KEY, content text)")
        cursor.execute("""
            CREATE TABLE public.question_embeddings(
              question_id bigint PRIMARY KEY REFERENCES public.questions(id),
              embedding extensions.vector(768) NOT NULL,
              model_name text NOT NULL, updated_at timestamptz NOT NULL)
        """)
        cursor.execute("""
            CREATE TABLE public.question_embedding_queue(
              question_id bigint PRIMARY KEY REFERENCES public.questions(id),
              queued_at timestamptz NOT NULL, attempts integer NOT NULL,
              next_retry_at timestamptz NOT NULL, last_error text)
        """)
        cursor.execute("INSERT INTO questions VALUES(1,'sentinel')")
        cursor.execute("INSERT INTO question_embeddings VALUES(1,%s::extensions.vector,'nomic-embed-text',now())", (vector,))
        cursor.execute("INSERT INTO question_embedding_queue VALUES(1,now(),0,now(),NULL)")
    connection.commit()


def verify_target_guards(connection):
    with connection.cursor() as cursor:
        cursor.execute("CREATE SCHEMA extensions")
        cursor.execute("CREATE EXTENSION vector WITH SCHEMA extensions")
    connection.commit()
    try:
        execute_file(connection, MIGRATION)
    except errors.RaiseException:
        connection.rollback()
    else:
        raise AssertionError("Migration must reject a database without Question Bank baseline tables")
    with connection.cursor() as cursor:
        cursor.execute("CREATE TABLE questions(id bigint PRIMARY KEY)")
        cursor.execute("CREATE TABLE question_embeddings(question_id bigint PRIMARY KEY,embedding extensions.vector(3))")
    connection.commit()
    try:
        execute_file(connection, MIGRATION)
    except errors.RaiseException:
        connection.rollback()
    else:
        raise AssertionError("Migration must reject a non-768 question embedding schema")
    with connection.cursor() as cursor:
        cursor.execute("DROP TABLE question_embeddings,questions")
    connection.commit()


def embedding_fingerprint(connection):
    with connection.cursor() as cursor:
        cursor.execute("""
            SELECT c.relname,a.attname,format_type(a.atttypid,a.atttypmod),a.attnotnull
            FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
            JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped
            WHERE n.nspname='public' AND c.relname IN ('question_embeddings','question_embedding_queue')
            ORDER BY c.relname,a.attnum
        """)
        schema = cursor.fetchall()
        cursor.execute("SELECT question_id,model_name,extensions.vector_dims(embedding) FROM question_embeddings ORDER BY question_id")
        embeddings = cursor.fetchall()
        cursor.execute("SELECT question_id,attempts,last_error FROM question_embedding_queue ORDER BY question_id")
        queue = cursor.fetchall()
    return hashlib.sha256(repr((schema, embeddings, queue)).encode()).hexdigest()


def execute_file(connection, path):
    with connection.cursor() as cursor:
        cursor.execute(path.read_text(encoding="utf-8"))


def expect_violation(connection, statement, args=()):
    if connection.get_transaction_status() == psycopg2.extensions.TRANSACTION_STATUS_IDLE:
        with connection.cursor() as cursor:
            cursor.execute("BEGIN")
    try:
        with connection.cursor() as cursor:
            cursor.execute("SAVEPOINT expected_failure")
            cursor.execute(statement, args)
    except psycopg2.Error:
        with connection.cursor() as cursor:
            cursor.execute("ROLLBACK TO SAVEPOINT expected_failure")
        return
    raise AssertionError("Expected constraint/trigger violation")


def insert_fixture(connection):
    document_id, index_id = str(uuid.uuid4()), str(uuid.uuid4())
    sha_file, sha_text, sha_chunk, config = ("a" * 64, "b" * 64, "c" * 64, "d" * 64)
    vector = "[" + ",".join(["0.001"] * 768) + "]"
    text = "Synthetic extracted document text for migration integration testing. " * 2
    with connection.cursor() as cursor:
        cursor.execute("""
          INSERT INTO ai_source_documents
          (id,revision,owner_user_id,course_id,original_name,mime_type,byte_size,file_sha256,storage_object_key)
          VALUES(%s,1,10,20,'fixture.pdf','application/pdf',100,%s,'10/20/fixture.pdf')
        """, (document_id, sha_file))
        cursor.execute("""
          INSERT INTO ai_document_indexes
          (id,document_id,document_revision,extracted_text,extracted_text_sha256,extractor_version,
           embedding_model,embedding_model_digest,embedding_dimensions,chunker_version,chunk_size,
           chunk_overlap,config_hash,chunk_count,status,ready_at)
          VALUES(%s,%s,1,%s,%s,'extract-v1','nomic-embed-text','digest-v1',768,
                 'recursive-v1',800,150,%s,1,'indexing',NULL)
        """, (index_id, document_id, text, sha_text, config))
        cursor.execute("""
          INSERT INTO ai_document_chunks(index_id,chunk_order,content,content_sha256,embedding)
          VALUES(%s,0,'synthetic chunk',%s,%s::extensions.vector)
        """, (index_id, sha_chunk, vector))
        cursor.execute("UPDATE ai_document_indexes SET status='ready',ready_at=now() WHERE id=%s", (index_id,))
    connection.commit()
    return document_id, index_id, config


def verify_schema_and_guards(connection):
    with connection.cursor() as cursor:
        cursor.execute("""
          SELECT table_name FROM information_schema.tables WHERE table_schema='public'
          AND table_name IN ('ai_source_documents','ai_document_indexes','ai_document_chunks') ORDER BY 1
        """)
        assert [row[0] for row in cursor.fetchall()] == [
            "ai_document_chunks", "ai_document_indexes", "ai_source_documents"]
        cursor.execute("SELECT format_type(a.atttypid,a.atttypmod) FROM pg_attribute a WHERE a.attrelid='ai_document_chunks'::regclass AND a.attname='embedding'")
        assert cursor.fetchone()[0] == "extensions.vector(768)"
        cursor.execute("SELECT indexname,indexdef FROM pg_indexes WHERE tablename LIKE 'ai_%' ORDER BY indexname")
        indexes = cursor.fetchall()
        assert not any("hnsw" in definition.lower() or "ivfflat" in definition.lower() for _, definition in indexes)
        assert any(name == "ai_source_documents_active_sha_uq" for name, _ in indexes)
        cursor.execute("SELECT count(*) FROM pg_constraint WHERE conrelid IN ('ai_source_documents'::regclass,'ai_document_indexes'::regclass,'ai_document_chunks'::regclass)")
        assert cursor.fetchone()[0] >= 20
        cursor.execute("""
          SELECT count(*) FROM pg_constraint
          WHERE contype='f' AND conrelid='ai_source_documents'::regclass
        """)
        assert cursor.fetchone()[0] == 0  # no cross-database user/course foreign keys

    document_id, index_id, config = insert_fixture(connection)
    with connection.cursor() as cursor:
        cursor.execute("SELECT status,file_sha256 FROM ai_source_documents WHERE id=%s", (document_id,))
        populated_before = cursor.fetchone()
        cursor.execute("SELECT status,config_hash,chunk_count FROM ai_document_indexes WHERE id=%s", (index_id,))
        populated_before += cursor.fetchone()
    execute_file(connection, MIGRATION)  # repeatability with populated ready data
    with connection.cursor() as cursor:
        cursor.execute("SELECT status,file_sha256 FROM ai_source_documents WHERE id=%s", (document_id,))
        populated_after = cursor.fetchone()
        cursor.execute("SELECT status,config_hash,chunk_count FROM ai_document_indexes WHERE id=%s", (index_id,))
        populated_after += cursor.fetchone()
    assert populated_after == populated_before
    expect_violation(connection, "UPDATE ai_source_documents SET revision=2 WHERE id=%s", (document_id,))
    expect_violation(connection, "UPDATE ai_document_indexes SET chunk_size=900 WHERE id=%s", (index_id,))
    expect_violation(connection, "UPDATE ai_document_chunks SET content='changed' WHERE index_id=%s", (index_id,))
    expect_violation(connection, "DELETE FROM ai_document_indexes WHERE id=%s", (index_id,))
    expect_violation(connection, """
      INSERT INTO ai_source_documents
      (id,owner_user_id,course_id,original_name,mime_type,byte_size,file_sha256,storage_object_key)
      VALUES(%s,10,20,'duplicate.pdf','application/pdf',100,%s,'duplicate.pdf')
    """, (str(uuid.uuid4()), "a" * 64))
    expect_violation(connection, """
      INSERT INTO ai_document_indexes
      (id,document_id,document_revision,extractor_version,embedding_model,embedding_model_digest,
       embedding_dimensions,chunker_version,chunk_size,chunk_overlap,config_hash,status)
      VALUES(%s,%s,1,'v1','nomic-embed-text','digest',768,'v1',800,150,%s,'ready')
    """, (str(uuid.uuid4()), document_id, "e" * 64))
    expect_violation(connection, """
      INSERT INTO ai_document_indexes
      (id,document_id,document_revision,extractor_version,embedding_model,embedding_model_digest,
       embedding_dimensions,chunker_version,chunk_size,chunk_overlap,config_hash,status)
      VALUES(%s,%s,99,'v1','nomic-embed-text','digest',768,'v1',800,150,%s,'extracting')
    """, (str(uuid.uuid4()), document_id, "f" * 64))
    expect_violation(connection, "UPDATE ai_source_documents SET status='deleted' WHERE id=%s", (document_id,))
    connection.commit()

    # A pinned ready index remains searchable after the document is soft-deleted.
    with connection.cursor() as cursor:
        cursor.execute("UPDATE ai_source_documents SET status='deleted',deleted_at=now() WHERE id=%s", (document_id,))
        cursor.execute("SELECT content FROM ai_document_chunks WHERE index_id=%s ORDER BY embedding OPERATOR(extensions.<=>) embedding LIMIT 1", (index_id,))
        assert cursor.fetchone()[0] == "synthetic chunk"
        cursor.execute("SET SESSION examflow.allow_ai_index_purge=on")
        cursor.execute("DELETE FROM ai_document_indexes WHERE id=%s", (index_id,))
        cursor.execute("DELETE FROM ai_source_documents WHERE id=%s", (document_id,))
    connection.commit()


def test_empty_rollback(connection):
    execute_file(connection, ROLLBACK)
    with connection.cursor() as cursor:
        cursor.execute("SELECT to_regclass('public.ai_source_documents'),to_regclass('public.ai_document_indexes'),to_regclass('public.ai_document_chunks')")
        assert cursor.fetchone() == (None, None, None)


def test_populated_rollback(connection):
    execute_file(connection, MIGRATION)
    insert_fixture(connection)
    try:
        execute_file(connection, ROLLBACK)
    except errors.RaiseException:
        connection.rollback()
    else:
        raise AssertionError("Populated rollback must fail without explicit session flag")
    with connection.cursor() as cursor:
        cursor.execute("SELECT count(*) FROM ai_source_documents")
        assert cursor.fetchone()[0] == 1
        cursor.execute("SET SESSION examflow.allow_ai_document_drop=on")
    connection.commit()
    execute_file(connection, ROLLBACK)


def main():
    port = free_port()
    report = {"image": IMAGE, "productionDsnUsed": False}
    try:
        docker("run", "--rm", "-d", "--name", NAME,
               "-p", f"127.0.0.1:{port}:5432",
               "-e", f"POSTGRES_PASSWORD={PASSWORD}", IMAGE, timeout=180)
        wait_ready(port)
        connection = connect(port)
        verify_target_guards(connection)
        baseline(connection)
        before = embedding_fingerprint(connection)
        execute_file(connection, MIGRATION)
        execute_file(connection, MIGRATION)  # repeatability/idempotency
        verify_schema_and_guards(connection)
        after = embedding_fingerprint(connection)
        assert before == after
        # Clean the fixture using the explicit purge guard, then test empty rollback.
        with connection.cursor() as cursor:
            cursor.execute("DELETE FROM ai_source_documents WHERE deleted_at IS NOT NULL")
        connection.commit()
        test_empty_rollback(connection)
        assert embedding_fingerprint(connection) == before
        test_populated_rollback(connection)
        assert embedding_fingerprint(connection) == before
        connection.close()
        report.update({
            "migrationRepeatable": True, "threeTablesVerified": True,
            "wrongDatabaseGuard": True, "wrongVectorDimensionGuard": True,
            "questionEmbeddingFingerprintUnchanged": True,
            "emptyRollback": "passed", "populatedRollbackRefused": True,
            "explicitPopulatedRollback": "passed", "immutabilityGuards": "passed",
            "exactSearchAfterSoftDelete": "passed", "annIndexes": 0
        })
        print(json.dumps(report, ensure_ascii=True))
    finally:
        try:
            docker("rm", "-f", NAME, timeout=30)
        except Exception:
            pass


if __name__ == "__main__":
    main()
