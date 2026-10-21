"""Job 8 review: SELECT/GET only; no secret output or lifecycle API calls."""
import importlib.util,json,time
from pathlib import Path
from contextlib import closing
from datetime import datetime,timezone
ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('watch',ROOT/'tmp/watch-one-approved-ui-job.py')
w=importlib.util.module_from_spec(spec);spec.loader.exec_module(w)
m=w.m;p=m.backend();config=m.settings(p.environ(),'spring.datasource')
row=w.query(config,"""SELECT id,execution_token,credit_state,accepted_count,
 charged_monthly,charged_extra,reserved_monthly,reserved_extra,
 credit_payload::jsonb->'selectedClos' AS selected_clos
 FROM ai_generation_requests WHERE id=8""")[0]
with m.httpx.Client(timeout=15,trust_env=False) as client:
 r=client.get('http://127.0.0.1:8002/credits/jobs/'+str(row['execution_token']),headers={'X-AI-Internal-Key':m.ai_env()['AI_INTERNAL_KEY']})
 r.raise_for_status();remote=r.json()
report=dict(inspected_utc=datetime.now(timezone.utc).isoformat(),job=row,
 upstream_http=r.status_code,upstream_state=remote.get('status'),questions=remote.get('questions',[]),worker_samples=[])
report['ledger']=w.query(config,'SELECT event_type,monthly_used_delta,monthly_reserved_delta FROM ai_credit_transactions WHERE job_id=8 ORDER BY id')
with closing(m.connection(config,transaction=True)) as conn:
 with conn.cursor() as q:
  for i in range(4):
   q.execute("""SELECT pid,application_name,backend_start,query_start,client_addr::text
    FROM pg_stat_activity WHERE backend_type='client backend'
    AND query ILIKE '%SELECT * FROM public.ai_generation_requests WHERE credit_state IN%'
    AND query ILIKE '%ORDER BY id LIMIT 100%' AND query NOT ILIKE '%requested_by%'
    AND pid<>pg_backend_pid() ORDER BY pid""")
   report['worker_samples'].append([dict(zip([d[0] for d in q.description],r)) for r in q.fetchall()]);time.sleep(1)
processes=[]
for process in m.psutil.process_iter(['pid','name','create_time']):
 try:
  args=process.cmdline()
  if 'com.examflow.backend.BackendApplication' in args:
   processes.append(dict(pid=process.pid,started_utc=datetime.fromtimestamp(process.create_time(),timezone.utc).isoformat(),cwd=process.cwd()))
 except (m.psutil.NoSuchProcess,m.psutil.AccessDenied):pass
report['local_backends']=processes
(ROOT/'tmp/job8-quality-review.json').write_text(json.dumps(report,ensure_ascii=False,indent=2,default=str),encoding='utf-8')
m.emit('job8_quality_review',**report)
