"""Explicitly approved main-only migration. No retries and no Question Bank connection."""
from pathlib import Path
import hashlib
import json
import re
import sys

# Reuse only the configuration parser, before either datasource is printed/connected.
parser_path = Path(__file__).with_name('verify_ai_credits_target.py')
exec(compile(parser_path.read_text(encoding='utf-8').split('for prefix in')[0], str(parser_path), 'exec'))

url = urlparse(prop('spring.datasource.url').removeprefix('jdbc:'))
target = (url.hostname, url.port or 5432, url.path.lstrip('/'), prop('spring.datasource.username'))
assert target == ('aws-0-ap-northeast-1.pooler.supabase.com', 5432, 'postgres', 'postgres.kbplrzkjnyphsbdmscgq'), 'Unexpected MAIN target'
assert values.get('AI_CREDITS_ENABLED', 'false').lower() == 'false', 'Quota must remain disabled'
assert prop('ai.credits.enabled').lower() == 'false', 'Quota configuration must remain disabled'
sql_path = root / 'database/migrations/006_ai_credits.sql'
raw = sql_path.read_bytes()
sql = raw.decode('utf-8')
assert "IS DISTINCT FROM 'main'" in sql and 'kbplrzkjnyphsbdmscgq/postgres/public' in sql
assert not re.search(r'^\s*(DROP|TRUNCATE|DELETE|UPDATE|INSERT|MERGE)\b', sql, re.M | re.I)
columns = re.findall(r'ADD COLUMN (\w+)', sql)
assert len(columns) == 20
tables = ['ai_credit_accounts', 'ai_credit_months', 'ai_credit_transactions']
print('TARGET', json.dumps(target), flush=True)
print('SQL_SHA256', hashlib.sha256(raw).hexdigest(), flush=True)
connection = psycopg2.connect(host=target[0], port=target[1], dbname=target[2], user=target[3],
    password=prop('spring.datasource.password'), sslmode='require', connect_timeout=10)
connection.autocommit = True
attempted = False
committed = False
try:
    with connection.cursor() as cursor:
        def select(query, params=None):
            assert query.lstrip().upper().startswith('SELECT')
            cursor.execute(query, params)
            return cursor.fetchall()
        identity = select('SELECT current_database(), current_schema(), current_user')
        assert identity[0][:2] == ('postgres', 'public'), identity
        print('IDENTITY', identity, flush=True)
        existing = select("SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name = ANY(%s)", (tables,))
        assert not existing, 'Already installed/partial installation: stop without executing'
        old_columns = [r[0] for r in select("SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='ai_generation_requests' ORDER BY ordinal_position")]
        assert not set(columns).intersection(old_columns), 'Credit columns already present'
        baseline = select('SELECT id, to_jsonb(r) FROM public.ai_generation_requests r ORDER BY id')
        assert len(baseline) == 3, 'Expected exactly three reviewed legacy requests'
        assert all(r[1]['status'] == 'completed' and r[1]['requested_question_count'] == 20 and r[1]['requested_by'] is not None for r in baseline), 'Legacy baseline differs'
        constraints = select("SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid='public.ai_generation_requests'::regclass ORDER BY conname")
        print('BASELINE_CONSTRAINTS', json.dumps(constraints), flush=True)
        print('BASELINE_LEGACY', len(baseline), flush=True)
        select("SELECT set_config('examflow.migration_environment','main',false), set_config('examflow.expected_database','postgres',false), set_config('examflow.main_target_confirmation','kbplrzkjnyphsbdmscgq/postgres/public',false)")
        attempted = True
        cursor.execute(sql)  # Exactly one execution; approved SQL includes BEGIN and COMMIT.
        committed = True
        print('MIGRATION_COMMITTED', flush=True)
        # From this point onward, SELECT statements only.
        actual = select("SELECT table_name,column_name,data_type,is_nullable,column_default FROM information_schema.columns WHERE table_schema='public' AND ((table_name=ANY(%s)) OR (table_name='ai_generation_requests' AND column_name=ANY(%s))) ORDER BY table_name,ordinal_position", (tables, columns))
        print('ACTUAL_SCHEMA', json.dumps(actual, default=str), flush=True)
        assert len([r for r in actual if r[0] == 'ai_generation_requests']) == 20
        assert {r[0] for r in actual} == set(tables + ['ai_generation_requests'])
        for table in tables:
            count = select('SELECT count(*) FROM public.' + table)[0][0]
            assert count == 0, 'Unexpected credit rows'
            print('EMPTY_TABLE', table, count, flush=True)
        after = select('SELECT id, to_jsonb(r) FROM public.ai_generation_requests r ORDER BY id')
        projected = [(row_id, {k: data[k] for k in old_columns}) for row_id, data in after]
        assert projected == baseline, 'Legacy original values differ'
        neutral = select("SELECT count(*) FROM public.ai_generation_requests WHERE credit_state='legacy' AND credit_month IS NULL AND idempotency_key IS NULL AND credit_payload IS NULL AND credit_result='[]'::jsonb AND reserved_monthly=0 AND reserved_extra=0 AND accepted_count=0 AND charged_monthly=0 AND charged_extra=0 AND retry_count=0 AND execution_token IS NULL AND credit_created_at IS NULL AND credit_completed_at IS NULL")
        assert neutral == [(3,)]
        print('LEGACY_UNCHANGED', 3, flush=True)
        print('CREDIT_CONSTRAINTS', json.dumps(select("SELECT conrelid::regclass::text, conname, convalidated FROM pg_constraint WHERE connamespace='public'::regnamespace AND (conrelid=ANY(ARRAY['public.ai_credit_accounts'::regclass,'public.ai_credit_months'::regclass,'public.ai_credit_transactions'::regclass]) OR (conrelid='public.ai_generation_requests'::regclass AND conname LIKE 'ai_request_%')) ORDER BY 1,2")), flush=True)
        print('CREDIT_INDEXES', json.dumps(select("SELECT tablename,indexname,indexdef FROM pg_indexes WHERE schemaname='public' AND (tablename=ANY(%s) OR (tablename='ai_generation_requests' AND (indexname LIKE 'uq_ai_request_%%' OR indexname LIKE 'idx_ai_request_credit_%%'))) ORDER BY tablename,indexname", (tables,))), flush=True)
        print('SUCCESS_QUOTA_DISABLED', flush=True)
except Exception as exc:
    if attempted and not committed:
        connection.rollback()
    print('STOP_NO_RETRY', 'attempted=' + str(attempted), 'committed=' + str(committed), type(exc).__name__, str(exc), flush=True)
    sys.exit(1)
finally:
    connection.close()
