#!/usr/bin/env python3
"""Fail-closed deployment runner for Question Bank migration 001.

The runner never prints connection strings or credentials.  ``preflight`` is
read-only.  ``apply`` repeats the preflight, writes and verifies a local
logical backup of the two existing embedding tables, then executes the exact
migration file once and verifies the resulting schema.
"""

from __future__ import annotations

import argparse
import datetime as dt
import gzip
import hashlib
import json
import os
import re
import shlex
import sys
from pathlib import Path
from typing import Any
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

import psycopg2
from psycopg2.extensions import parse_dsn
from psycopg2.extras import RealDictCursor


ROOT = Path(__file__).resolve().parents[2]
MIGRATION = ROOT / "database/questionbank/migrations/001_ai_rag_documents.sql"
BACKUP_DIR = ROOT / "ai-service/.runtime/backups"
TARGET_TABLES = ("ai_source_documents", "ai_document_indexes", "ai_document_chunks")
BASELINE_TABLES = ("question_embeddings", "question_embedding_queue")


def load_env(path: Path) -> dict[str, str]:
    values: dict[str, str] = {}
    if not path.exists():
        return values
    for raw in path.read_text(encoding="utf-8-sig").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        value = value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
            value = value[1:-1]
        values[key.strip()] = value
    return values


def resolve(value: str, env: dict[str, str]) -> str:
    pattern = re.compile(r"\$\{([^}:]+)(?::([^}]*))?}")
    return pattern.sub(lambda m: os.environ.get(m.group(1), env.get(m.group(1), m.group(2) or "")), value)


def properties(path: Path, env: dict[str, str]) -> dict[str, str]:
    result: dict[str, str] = {}
    for raw in path.read_text(encoding="utf-8-sig").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        result[key.strip()] = resolve(value.strip(), env)
    return result


def jdbc_to_dsn(url: str, user: str, password: str) -> str:
    if not url.startswith("jdbc:postgresql://"):
        raise RuntimeError("Unsupported main datasource URL")
    parsed = urlsplit(url[5:])
    query = dict(parse_qsl(parsed.query, keep_blank_values=True))
    query.update({"user": user, "password": password})
    return urlunsplit((parsed.scheme, parsed.netloc, parsed.path, urlencode(query), parsed.fragment))


def connection_sources() -> tuple[str, str]:
    env = {**load_env(ROOT / ".env"), **load_env(ROOT / "ai-service/.env")}
    env.update({k: v for k, v in os.environ.items()})
    qb = env.get("EXAMFLOW_QUESTIONBANK_DSN", "").strip()
    if not qb:
        raise RuntimeError("EXAMFLOW_QUESTIONBANK_DSN is not configured")
    props = properties(ROOT / "backend/src/main/resources/application.properties", env)
    main = jdbc_to_dsn(
        props.get("spring.datasource.url", ""),
        props.get("spring.datasource.username", ""),
        props.get("spring.datasource.password", ""),
    )
    return qb, main


def safe_identity(dsn: str) -> dict[str, str]:
    params = dsn_params(dsn)
    host = params.get("host", "").lower()
    port = params.get("port", "5432")
    database = params.get("dbname", "")
    user = params.get("user", "")
    if not host or not user or not database:
        raise RuntimeError("Invalid PostgreSQL datasource format")
    raw = f"{host}:{port}/{database}|{user}"
    return {"fingerprint": hashlib.sha256(raw.encode()).hexdigest(), "database": database}


def dsn_params(dsn: str) -> dict[str, str]:
    # The application DSN also carries a project-specific safety marker named
    # default_transaction_read_only.  It is not a libpq keyword; the actual
    # libpq enforcement lives in options=-c default_transaction_read_only=on.
    if "://" not in dsn:
        parsed: dict[str, str] = {}
        for token in shlex.split(dsn, posix=True):
            if "=" not in token:
                raise RuntimeError("Invalid PostgreSQL datasource format")
            key, value = token.split("=", 1)
            parsed[key] = value
        parsed.pop("default_transaction_read_only", None)
        return parsed
    try:
        return parse_dsn(dsn)
    except psycopg2.Error as exc:
        raise RuntimeError("Invalid PostgreSQL datasource format") from exc


def connect(dsn: str, app: str, *, allow_write: bool = False):
    params = dsn_params(dsn)
    if allow_write:
        params.pop("options", None)
    params.update({"application_name": app, "connect_timeout": "12"})
    return psycopg2.connect(**params)


def scalar(cur, sql: str, params=()):
    cur.execute(sql, params)
    return cur.fetchone()[0]


def relation_set(cur) -> set[str]:
    cur.execute("SELECT tablename FROM pg_catalog.pg_tables WHERE schemaname='public'")
    return {row[0] for row in cur.fetchall()}


def table_schema(cur, table: str) -> dict[str, Any]:
    cur.execute(
        """SELECT column_name,data_type,udt_schema,udt_name,is_nullable,column_default,
                  character_maximum_length,numeric_precision,numeric_scale
             FROM information_schema.columns
            WHERE table_schema='public' AND table_name=%s ORDER BY ordinal_position""",
        (table,),
    )
    columns = cur.fetchall()
    cur.execute(
        """SELECT indexname,indexdef FROM pg_indexes
            WHERE schemaname='public' AND tablename=%s ORDER BY indexname""",
        (table,),
    )
    indexes = cur.fetchall()
    cur.execute(
        """SELECT c.conname,pg_get_constraintdef(c.oid,true)
             FROM pg_constraint c JOIN pg_class r ON r.oid=c.conrelid
             JOIN pg_namespace n ON n.oid=r.relnamespace
            WHERE n.nspname='public' AND r.relname=%s ORDER BY c.conname""",
        (table,),
    )
    constraints = cur.fetchall()
    return {"columns": columns, "indexes": indexes, "constraints": constraints}


def json_value(value: Any) -> Any:
    if isinstance(value, (dt.datetime, dt.date, dt.time)):
        return value.isoformat()
    if isinstance(value, memoryview):
        return bytes(value).hex()
    if isinstance(value, bytes):
        return value.hex()
    return value


def table_rows(cur, table: str) -> list[dict[str, Any]]:
    cur.execute(
        "SELECT column_name FROM information_schema.columns "
        "WHERE table_schema='public' AND table_name=%s ORDER BY ordinal_position",
        (table,),
    )
    cols = [r[0] for r in cur.fetchall()]
    if not cols:
        raise RuntimeError(f"Missing baseline table public.{table}")
    select = ",".join(f'\"{c}\"::text AS \"{c}\"' for c in cols)
    order = ",".join(f'\"{c}\"::text' for c in cols)
    with cur.connection.cursor(cursor_factory=RealDictCursor) as rows_cur:
        rows_cur.execute(f'SELECT {select} FROM public.\"{table}\" ORDER BY {order}')
        return [{k: json_value(v) for k, v in row.items()} for row in rows_cur.fetchall()]


def canonical_hash(value: Any) -> str:
    raw = json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"), default=json_value)
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def snapshot(cur, include_rows: bool) -> dict[str, Any]:
    result: dict[str, Any] = {}
    for table in BASELINE_TABLES:
        schema = table_schema(cur, table)
        rows = table_rows(cur, table) if include_rows else []
        count = scalar(cur, f'SELECT count(*) FROM public."{table}"')
        result[table] = {
            "schema": schema,
            "schema_sha256": canonical_hash(schema),
            "row_count": count,
            "rows": rows,
            "rows_sha256": canonical_hash(rows) if include_rows else None,
        }
    return result


def preflight(qb_dsn: str, main_dsn: str) -> dict[str, Any]:
    qb_id, main_id = safe_identity(qb_dsn), safe_identity(main_dsn)
    if qb_id["fingerprint"] == main_id["fingerprint"]:
        raise RuntimeError("Question Bank datasource resolves to the main datasource")
    with connect(qb_dsn, "examflow-ai-rag-preflight") as qb, connect(main_dsn, "examflow-main-identity-check") as main:
        qb.set_session(readonly=True, autocommit=False)
        main.set_session(readonly=True, autocommit=False)
        with qb.cursor() as qcur, main.cursor() as mcur:
            qrels, mrels = relation_set(qcur), relation_set(mcur)
            required_qb = {"questions", "question_embeddings", "question_embedding_queue"}
            required_main = {"users", "ai_generation_requests", "ai_credit_transactions"}
            if not required_qb.issubset(qrels):
                raise RuntimeError("Question Bank baseline relations are missing")
            if not required_main.issubset(mrels):
                raise RuntimeError("Main database identity markers are missing")
            if required_main.intersection(qrels):
                raise RuntimeError("Question Bank unexpectedly contains main database identity markers")
            existing = sorted(set(TARGET_TABLES).intersection(qrels))
            if existing:
                raise RuntimeError("Migration target objects already exist: " + ", ".join(existing))
            qcur.execute(
                "SELECT proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace "
                "WHERE n.nspname='public' AND proname LIKE 'examflow_guard_ai_document_%'"
            )
            funcs = [r[0] for r in qcur.fetchall()]
            if funcs:
                raise RuntimeError("Migration functions already exist")
            qcur.execute(
                """SELECT n.nspname,t.typname,a.atttypmod
                     FROM pg_attribute a JOIN pg_type t ON t.oid=a.atttypid
                     JOIN pg_namespace n ON n.oid=t.typnamespace
                    WHERE a.attrelid='public.question_embeddings'::regclass
                      AND a.attname='embedding' AND NOT a.attisdropped"""
            )
            vector_schema, vector_name, vector_dimensions = qcur.fetchone()
            if (vector_schema, vector_name, vector_dimensions) != ("extensions", "vector", 768):
                raise RuntimeError("Unexpected Question Bank vector type identity or dimensions")
            qcur.execute("SET LOCAL search_path=pg_catalog,public")
            vector_type = scalar(qcur, "SELECT format_type(atttypid,atttypmod) FROM pg_attribute WHERE attrelid='public.question_embeddings'::regclass AND attname='embedding' AND NOT attisdropped")
            if vector_type != "extensions.vector(768)":
                raise RuntimeError(f"Migration guard would reject vector type: {vector_type}")
            can_create = scalar(qcur, "SELECT has_schema_privilege(current_user,'public','CREATE')")
            if not can_create:
                raise RuntimeError("Question Bank role lacks CREATE privilege on public schema")
            baseline = snapshot(qcur, include_rows=False)
            return {
                "question_bank_identity": qb_id,
                "main_identity": main_id,
                "question_bank_markers": sorted(required_qb),
                "main_markers": sorted(required_main),
                "vector_type": vector_type,
                "create_privilege": True,
                "target_objects_absent": True,
                "baseline": baseline,
            }


def write_backup(qb_dsn: str, migration_sha: str, qb_identity: dict[str, str]) -> tuple[Path, dict[str, Any]]:
    with connect(qb_dsn, "examflow-ai-rag-backup") as conn:
        conn.set_session(readonly=True, autocommit=False)
        with conn.cursor() as cur:
            content = {
                "format": "examflow-questionbank-logical-backup-v1",
                "created_at": dt.datetime.now(dt.timezone.utc).isoformat(),
                "target_identity": qb_identity,
                "migration_sha256": migration_sha,
                "tables": snapshot(cur, include_rows=True),
            }
    BACKUP_DIR.mkdir(parents=True, exist_ok=True)
    stamp = dt.datetime.now(dt.timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    path = BACKUP_DIR / f"questionbank-before-001-ai-rag-documents-{stamp}.json.gz"
    temp = path.with_suffix(path.suffix + ".tmp")
    raw = json.dumps(content, ensure_ascii=False, sort_keys=True, default=json_value).encode("utf-8")
    with gzip.open(temp, "wb", compresslevel=9) as handle:
        handle.write(raw)
    os.replace(temp, path)
    file_sha = hashlib.sha256(path.read_bytes()).hexdigest()
    checksum_path = Path(str(path) + ".sha256")
    checksum_path.write_text(f"{file_sha}  {path.name}\n", encoding="ascii")
    with gzip.open(path, "rb") as handle:
        verified = json.loads(handle.read().decode("utf-8"))
    if canonical_hash(verified) != canonical_hash(content):
        raise RuntimeError("Backup content verification failed")
    if hashlib.sha256(path.read_bytes()).hexdigest() != file_sha:
        raise RuntimeError("Backup checksum verification failed")
    return path, {"sha256": file_sha, "tables": {k: {"row_count": v["row_count"], "schema_sha256": v["schema_sha256"], "rows_sha256": v["rows_sha256"]} for k, v in content["tables"].items()}}


def verify_created(cur) -> dict[str, Any]:
    relations = relation_set(cur)
    if not set(TARGET_TABLES).issubset(relations):
        raise RuntimeError("Not all migration tables were created")
    counts = {table: scalar(cur, f'SELECT count(*) FROM public."{table}"') for table in TARGET_TABLES}
    if any(counts.values()):
        raise RuntimeError("New document tables are not empty")
    cur.execute(
        """SELECT event_object_table,trigger_name
             FROM information_schema.triggers
            WHERE trigger_schema='public' AND event_object_table=ANY(%s)
            ORDER BY event_object_table,trigger_name""",
        (list(TARGET_TABLES),),
    )
    triggers = cur.fetchall()
    cur.execute(
        "SELECT tablename,indexname,indexdef FROM pg_indexes WHERE schemaname='public' AND tablename=ANY(%s) ORDER BY tablename,indexname",
        (list(TARGET_TABLES),),
    )
    indexes = cur.fetchall()
    ann = [row for row in indexes if "USING hnsw" in row[2] or "USING ivfflat" in row[2]]
    if ann:
        raise RuntimeError("Unexpected ANN index found")
    schemas = {table: table_schema(cur, table) for table in TARGET_TABLES}
    return {"row_counts": counts, "triggers": triggers, "indexes": indexes, "schemas": schemas, "ann_indexes": 0}


def apply(qb_dsn: str, main_dsn: str, pre: dict[str, Any]) -> dict[str, Any]:
    migration_bytes = MIGRATION.read_bytes()
    migration_sha = hashlib.sha256(migration_bytes).hexdigest()
    backup_path, backup = write_backup(qb_dsn, migration_sha, pre["question_bank_identity"])
    with connect(qb_dsn, "examflow-ai-rag-migration-001", allow_write=True) as conn:
        conn.autocommit = True
        with conn.cursor() as cur:
            # Keep extensions out of search_path so format_type() produces the
            # schema-qualified value required by the reviewed migration guard.
            cur.execute("SET search_path=pg_catalog,public")
            cur.execute(migration_bytes.decode("utf-8-sig"))
    with connect(qb_dsn, "examflow-ai-rag-postverify") as conn:
        conn.set_session(readonly=True, autocommit=False)
        with conn.cursor() as cur:
            after_baseline = snapshot(cur, include_rows=True)
            created = verify_created(cur)
    for table in BASELINE_TABLES:
        expected = backup["tables"][table]
        actual = after_baseline[table]
        for field in ("row_count", "schema_sha256", "rows_sha256"):
            if expected[field] != actual[field]:
                raise RuntimeError(f"Baseline fingerprint changed for {table}.{field}")
    # Recheck main markers read-only after migration.
    with connect(main_dsn, "examflow-main-postcheck") as main:
        main.set_session(readonly=True, autocommit=False)
        with main.cursor() as cur:
            if not {"users", "ai_generation_requests", "ai_credit_transactions"}.issubset(relation_set(cur)):
                raise RuntimeError("Main database postcheck failed")
    report = {
        "status": "applied_and_verified",
        "applied_at": dt.datetime.now(dt.timezone.utc).isoformat(),
        "migration_sha256": migration_sha,
        "backup": {"path": str(backup_path), **backup},
        "baseline_tables_unchanged": True,
        "created": created,
        "main_database_write_performed": False,
    }
    report_path = BACKUP_DIR / f"001-ai-rag-documents-report-{dt.datetime.now(dt.timezone.utc).strftime('%Y%m%dT%H%M%SZ')}.json"
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2, default=json_value), encoding="utf-8")
    report["report_path"] = str(report_path)
    return report


def public_summary(mode: str, result: dict[str, Any]) -> dict[str, Any]:
    if mode == "preflight":
        return {
            "status": "preflight_passed",
            "question_bank_identity_fingerprint": result["question_bank_identity"]["fingerprint"][:16],
            "main_identity_fingerprint": result["main_identity"]["fingerprint"][:16],
            "datasources_distinct": True,
            "vector_type": result["vector_type"],
            "create_privilege": result["create_privilege"],
            "target_objects_absent": result["target_objects_absent"],
            "baseline_counts": {k: v["row_count"] for k, v in result["baseline"].items()},
        }
    return {
        "status": result["status"],
        "migration_sha256": result["migration_sha256"],
        "backup_path": result["backup"]["path"],
        "backup_sha256": result["backup"]["sha256"],
        "backup_counts": {k: v["row_count"] for k, v in result["backup"]["tables"].items()},
        "new_table_counts": result["created"]["row_counts"],
        "trigger_count": len(result["created"]["triggers"]),
        "index_count": len(result["created"]["indexes"]),
        "ann_indexes": result["created"]["ann_indexes"],
        "baseline_tables_unchanged": result["baseline_tables_unchanged"],
        "report_path": result["report_path"],
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("mode", choices=("preflight", "apply"))
    args = parser.parse_args()
    try:
        qb_dsn, main_dsn = connection_sources()
        pre = preflight(qb_dsn, main_dsn)
        result = pre if args.mode == "preflight" else apply(qb_dsn, main_dsn, pre)
        print(json.dumps(public_summary(args.mode, result), indent=2))
        return 0
    except Exception as exc:
        print(json.dumps({"status": "stopped", "error": str(exc)}, ensure_ascii=False), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
