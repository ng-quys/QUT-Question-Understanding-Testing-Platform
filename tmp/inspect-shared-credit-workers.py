import importlib.util,json,time
from pathlib import Path
from contextlib import closing
ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('deploy',ROOT/'tmp/approved-ai-deploy.py')
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
config=m.settings(m.backend().environ(),'spring.datasource')
samples=[]
owners={c.pid for c in m.psutil.net_connections(kind='tcp') if c.raddr and c.raddr.port in (5432,6543) and c.status==m.psutil.CONN_ESTABLISHED}
local=[]
for pid in owners:
 try:
  process=m.psutil.Process(pid)
  argv=process.cmdline()
  local.append(dict(pid=pid,name=process.name(),cwd=process.cwd(),
   application_classes=[a for a in argv if a.startswith('com.examflow.')],jar_names=[Path(a).name for a in argv if a.endswith('.jar')]))
 except (m.psutil.NoSuchProcess,m.psutil.AccessDenied):pass
m.emit('local_postgres_clients',rows=local)
with closing(m.connection(config,transaction=True)) as conn:
 with conn.cursor() as q:
  for n in range(4):
   q.execute("""SELECT pid,application_name,state,backend_start,query_start,
    CASE WHEN query ILIKE '%SELECT * FROM public.ai_generation_requests WHERE credit_state IN%' AND query ILIKE '%ORDER BY id LIMIT 100%' AND query NOT ILIKE '%requested_by%' THEN 'global_credit_worker_poll'
         WHEN query ILIKE '%ai_generation_requests%' AND query ILIKE '%unknown%' THEN 'credit_unknown_related'
         WHEN query ILIKE '%ai_credit_months%' THEN 'credit_month_query'
         WHEN query ILIKE '%ai_credit_accounts%' THEN 'credit_account_query'
         WHEN query ILIKE '%ai_generation_requests%' THEN 'credit_job_query'
         ELSE 'other' END AS query_class
    FROM pg_stat_activity WHERE backend_type='client backend'
      AND application_name IN ('PostgreSQL JDBC Driver','ExamFlow-Main') ORDER BY pid""")
   rows=[dict(zip([c[0] for c in q.description],r)) for r in q.fetchall()]
   relevant=[r for r in rows if r['query_class']=='global_credit_worker_poll']
   samples.append(dict(sample=n+1,rows=relevant))
   m.emit('shared_db_worker_snapshot',sample=n+1,rows=relevant)
   time.sleep(1)
(ROOT/'tmp/approved-ai-shared-worker-evidence.json').write_text(json.dumps(dict(local_clients=local,samples=samples),indent=2,default=str),encoding='utf-8')
