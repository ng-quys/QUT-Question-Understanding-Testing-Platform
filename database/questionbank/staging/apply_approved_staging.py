"""Explicit staging-only apply. No dotenv, DSN, host override or Production runner."""
import argparse
import datetime
import hashlib
import json
import re
import socket
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
HERE = Path(__file__).resolve().parent
REPORT = HERE / 'schema-result.json'
DB = 'examflow_rag_staging'
PROJECT = 'examflow-saved-documents-staging'
BASELINE = ['questions', 'question_embeddings', 'question_embedding_queue']
RAG = ['ai_source_documents', 'ai_document_indexes', 'ai_document_chunks']


def docker(*args, stdin=None):
    result = subprocess.run(['docker', *args], input=stdin, capture_output=True,
                            text=True, encoding='utf-8', timeout=40)
    if result.returncode:
        raise RuntimeError('Docker/SQL command failed; stopped without automatic repair')
    return result.stdout.strip()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--apply-approved-staging', action='store_true', required=True)
    parser.parse_args()
    report = {'time_utc': datetime.datetime.now(datetime.timezone.utc).isoformat(),
              'database': DB, 'endpoint': '127.0.0.1:55441', 'steps': []}
    def save():
        REPORT.write_text(json.dumps(report, indent=2), encoding='utf-8')
    try:
        ids = docker('ps', '-q', '--filter', 'label=com.docker.compose.project='+PROJECT,
                     '--filter', 'label=com.docker.compose.service=questionbank').splitlines()
        assert len(ids) == 1, 'Expected exactly one running staging container'
        cid = ids[0]
        def identity():
            x = json.loads(docker('inspect', cid))[0]
            assert x['State']['Running']
            assert x['Config']['Image'] == 'pgvector/pgvector:pg17'
            assert x['Config']['Labels']['com.docker.compose.project'] == PROJECT
            assert x['Config']['Labels']['com.docker.compose.service'] == 'questionbank'
            assert x['HostConfig']['PortBindings'] == {'5432/tcp':[{'HostIp':'127.0.0.1','HostPort':'55441'}]}
            assert len(x['Mounts']) == 1
            assert all(m['Type']=='volume' and m['Name'].startswith(PROJECT+'_') for m in x['Mounts'])
        identity()
        with socket.create_connection(('127.0.0.1', 55441), timeout=5): pass
        def sql(value):
            return docker('exec', '-i', cid, 'psql', '-X', '-U', DB, '-d', DB,
                          '-At', '-v', 'ON_ERROR_STOP=1', stdin=value)
        def read(query):
            return sql('BEGIN READ ONLY;\n'+query+'\nROLLBACK;').removeprefix('BEGIN\n').removesuffix('\nROLLBACK')
        assert read('SELECT current_database();') == DB
        assert read("SELECT count(*) FROM pg_tables WHERE schemaname='public';") == '0'
        assert read("SELECT count(*) FROM pg_namespace WHERE nspname='extensions';") == '0'
        report['isolation_verified'] = True
        report['initial_public_tables'] = 0
        report['container_id'] = cid
        baseline = (HERE/'000_baseline.proposed.sql').read_bytes()
        migration_path = ROOT/'database/questionbank/migrations/001_ai_rag_documents.sql'
        migration = migration_path.read_bytes()
        report['baseline_sha256'] = hashlib.sha256(baseline).hexdigest()
        report['migration_sha256'] = hashlib.sha256(migration).hexdigest()
        save()
        identity()
        sql(baseline.decode('utf-8-sig'))
        report['steps'].append('baseline committed'); save()
        def fingerprint():
            args = ['exec', cid, 'pg_dump', '-U', DB, '-d', DB, '--no-owner', '--no-privileges']
            for table in BASELINE: args += ['--table=public.'+table]
            dump = docker(*args)
            normalized = '\n'.join(line for line in dump.splitlines()
                                   if not line.startswith(('\\restrict ', '\\unrestrict ')))
            return hashlib.sha256(normalized.encode()).hexdigest()
        before = fingerprint()
        report['baseline_fingerprint_before'] = before; save()
        identity()
        assert migration_path.read_bytes() == migration, 'Migration changed during execution'
        sql(migration.decode('utf-8-sig'))
        report['steps'].append('migration 001 committed'); save()
        after = fingerprint()
        report['baseline_fingerprint_after'] = after
        assert before == after, 'Baseline schema/data changed'
        report['baseline_unchanged'] = True
        tables = read("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename;").splitlines()
        assert tables == sorted(BASELINE+RAG)
        report['tables'] = tables
        vector = read("SELECT format_type(a.atttypid,a.atttypmod) FROM pg_attribute a WHERE a.attrelid='public.ai_document_chunks'::regclass AND a.attname='embedding';")
        assert vector == 'extensions.vector(768)'
        report['chunk_embedding_type'] = vector
        report['vector_extension'] = read("SELECT extnamespace::regnamespace::text||':'||extversion FROM pg_extension WHERE extname='vector';")
        counts = {t:int(read('SELECT count(*) FROM public.'+t+';')) for t in BASELINE+RAG}
        assert all(n == 0 for n in counts.values())
        report['row_counts'] = counts
        report['constraints'] = read("SELECT conrelid::regclass::text||'|'||conname||'|'||contype::text||'|'||pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid IN ('public.ai_source_documents'::regclass,'public.ai_document_indexes'::regclass,'public.ai_document_chunks'::regclass) ORDER BY conrelid::regclass::text,conname;").splitlines()
        assert len(report['constraints']) >= 20
        assert sum('|f|' in x for x in report['constraints']) == 2
        assert all('FOREIGN KEY' not in x for x in report['constraints'] if x.startswith('ai_source_documents|'))
        report['triggers'] = read("SELECT c.relname||'|'||t.tgname||'|'||t.tgenabled::text||'|'||pg_get_triggerdef(t.oid) FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND NOT t.tgisinternal ORDER BY c.relname,t.tgname;").splitlines()
        expected_triggers = {'ai_source_documents_identity_guard','ai_document_indexes_immutable_guard','ai_document_chunks_immutable_guard'}
        assert {x.split('|')[1] for x in report['triggers']} == expected_triggers
        assert all(x.split('|')[2] == 'O' for x in report['triggers'])
        report['indexes'] = read("SELECT indexname||'|'||indexdef FROM pg_indexes WHERE schemaname='public' AND tablename IN ('ai_source_documents','ai_document_indexes','ai_document_chunks') ORDER BY indexname;").splitlines()
        expected_indexes = {'ai_source_documents_pkey','ai_source_documents_revision_key','ai_source_documents_storage_key','ai_source_documents_active_sha_uq','ai_source_documents_library_idx','ai_document_indexes_pkey','ai_document_indexes_cache_key','ai_document_indexes_lookup_idx','ai_document_chunks_pkey'}
        assert {x.split('|')[0] for x in report['indexes']} == expected_indexes
        assert not any(re.search(r'\b(hnsw|ivfflat)\b', x, re.I) for x in report['indexes'])
        report['functions'] = read("SELECT proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' ORDER BY proname;").splitlines()
        assert set(report['functions']) == {'examflow_guard_ai_document_identity','examflow_guard_ai_document_index','examflow_guard_ai_document_chunk'}
        report['migration_file_unchanged'] = migration_path.read_bytes() == migration
        report['status'] = 'passed'; save()
        print(json.dumps({k:report[k] for k in ['status','database','endpoint','baseline_unchanged','chunk_embedding_type','vector_extension','row_counts','migration_file_unchanged']}))
        print('constraints='+str(len(report['constraints']))+' triggers='+str(len(report['triggers']))+' indexes='+str(len(report['indexes'])))
    except Exception as exc:
        report['status'] = 'failed; stopped'
        report['error_type'] = type(exc).__name__
        save()
        print('Staging operation failed and stopped; inspect schema-result.json. No automatic repair or rollback.')
        raise SystemExit(1)


if __name__ == '__main__': main()
