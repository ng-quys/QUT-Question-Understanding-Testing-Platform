"""Read-only main schema and GET-only AI readiness checks. Never generates or writes."""
from pathlib import Path
import json
import os
import urllib.request

parser_path = Path(__file__).with_name('verify_ai_credits_target.py')
exec(compile(parser_path.read_text(encoding='utf-8').split('for prefix in')[0], str(parser_path), 'exec'))
url = urlparse(prop('spring.datasource.url').removeprefix('jdbc:'))
assert (url.hostname, url.port or 5432, url.path.lstrip('/'), prop('spring.datasource.username')) == (
    'aws-0-ap-northeast-1.pooler.supabase.com', 5432, 'postgres', 'postgres.kbplrzkjnyphsbdmscgq')
assert prop('ai.credits.enabled').lower() == 'false'
connection = psycopg2.connect(host=url.hostname, port=url.port or 5432, dbname='postgres',
    user=prop('spring.datasource.username'), password=prop('spring.datasource.password'), sslmode='require', connect_timeout=10)
connection.autocommit = True
try:
    with connection.cursor() as cur:
        cur.execute('BEGIN READ ONLY')
        cur.execute('SET LOCAL statement_timeout=10000')
        for name, query in {
            'identity': 'SELECT current_database(),current_schema(),current_user',
            'schema': "SELECT table_name,column_name,udt_name,is_nullable FROM information_schema.columns WHERE table_schema='public' AND table_name IN ('ai_credit_accounts','ai_credit_months','ai_credit_transactions','ai_generation_requests','users','courses','course_faculties','chapters','clos') ORDER BY table_name,ordinal_position",
            'constraints': "SELECT conrelid::regclass::text,conname,convalidated FROM pg_constraint WHERE connamespace='public'::regnamespace AND (conrelid::regclass::text LIKE 'ai_credit_%' OR conname LIKE 'ai_request_%') ORDER BY 1,2",
            'legacy': "SELECT credit_state,status,count(*),sum(charged_monthly+charged_extra) FROM public.ai_generation_requests GROUP BY credit_state,status",
            'credits_rows': 'SELECT (SELECT count(*) FROM public.ai_credit_accounts),(SELECT count(*) FROM public.ai_credit_months),(SELECT count(*) FROM public.ai_credit_transactions)',
        }.items():
            cur.execute(query)
            print(name, json.dumps(cur.fetchall(), default=str), flush=True)
        cur.execute('ROLLBACK')
finally:
    connection.close()

ai_values = {}
ai_env = root / 'ai-service/.env'
if ai_env.exists():
    for line in ai_env.read_text(encoding='utf-8').splitlines():
        if '=' in line and not line.lstrip().startswith('#'):
            key, value = line.split('=', 1)
            ai_values[key.strip()] = value.strip().strip('\"').strip("'")
ai_values.update(os.environ)
be_key = prop('ai.internal.key')
ai_key = ai_values.get('AI_INTERNAL_KEY', '')
print('internal_key', json.dumps({'be_configured':len(be_key)>=32,'ai_configured':len(ai_key)>=32,
    'match':len(be_key)>=32 and be_key==ai_key}), flush=True)
print('quota_enabled', prop('ai.credits.enabled'), flush=True)
print('worker_environment', json.dumps({k:ai_values.get(k,'unset') for k in ('WEB_CONCURRENCY','UVICORN_WORKERS','AI_CREDITS_MAX_QUESTIONS')}), flush=True)
opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
ai_url = prop('ai.rag.url') or 'http://127.0.0.1:8002'
ollama = ai_values.get('OLLAMA_URL','http://127.0.0.1:11434')
for label, endpoint in [('fastapi_health',ai_url.rstrip('/')+'/health'),('ollama_tags',ollama.rstrip('/')+'/api/tags')]:
    try:
        with opener.open(endpoint,timeout=8) as response:
            payload=json.load(response)
            if label=='ollama_tags': payload={'models':[m.get('name') for m in payload.get('models',[])]}
            print(label,json.dumps(payload),flush=True)
    except Exception as exc:
        print(label,type(exc).__name__,str(exc),flush=True)
