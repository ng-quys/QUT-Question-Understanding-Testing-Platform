"""Observe shared PostgreSQL sessions over many worker intervals. SELECT only."""
import importlib.util,json,time
from pathlib import Path
from datetime import datetime,timezone
from contextlib import closing
ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('watch',ROOT/'tmp/watch-one-approved-ui-job.py')
w=importlib.util.module_from_spec(spec);spec.loader.exec_module(w);m=w.m
env=m.backend().environ();config=m.settings(env,'spring.datasource')
started=datetime.now(timezone.utc);samples=[];previous={};advances=[]
m.emit('legacy_stop_observation_started',backend_pid=m.backend().pid,samples_planned=16,interval_seconds=3)
with closing(m.connection(config,transaction=True)) as conn:
 with conn.cursor() as q:
  for n in range(16):
   q.execute("""SELECT pid,application_name,state,backend_start,query_start,
    query ILIKE %s AND query ILIKE %s AS global_worker_poll
    FROM pg_stat_activity WHERE datname=current_database() AND backend_type='client backend'
    AND pid<>pg_backend_pid() ORDER BY pid""",
    ('SELECT * FROM public.ai_generation_requests WHERE credit_state IN%','%ORDER BY id LIMIT 100%'))
   rows=[dict(zip([d[0] for d in q.description],r)) for r in q.fetchall()]
   legacy=[r for r in rows if r['global_worker_poll'] and not r['application_name'].startswith('ExamFlow-Main/ai-worker-v1')]
   samples.append(dict(number=n+1,observed_utc=datetime.now(timezone.utc).isoformat(),connections=rows,legacy_polls=legacy))
   for r in legacy:
    old=previous.get(r['pid'])
    if old is not None and r['query_start']>old:
     advances.append(dict(pid=r['pid'],previous=old,current=r['query_start']))
    previous[r['pid']]=r['query_start']
   if n==0 or legacy or n==15:m.emit('legacy_stop_sample',number=n+1,legacy=legacy,total_main_connections=len(rows))
   if advances:break
   if n<15:time.sleep(3)
report=dict(started_utc=started.isoformat(),finished_utc=datetime.now(timezone.utc).isoformat(),
 samples=samples,legacy_poll_advances=advances,legacy_rows_observed=any(s['legacy_polls'] for s in samples),
 legacy_polling_confirmed=bool(advances),clear_for_activation=not any(s['legacy_polls'] for s in samples))
with closing(m.connection(m.settings(env,'questionbank.datasource'))) as conn:
 with conn.cursor() as q:
  q.execute("SELECT application_name,state,count(*) FROM pg_stat_activity WHERE datname=current_database() AND backend_type='client backend' GROUP BY 1,2 ORDER BY 1,2")
  report['question_bank_connections']=[dict(application_name=r[0],state=r[1],count=r[2]) for r in q.fetchall()]
(ROOT/'tmp/legacy-worker-stop-check.json').write_text(json.dumps(report,indent=2,default=str),encoding='utf-8')
m.emit('legacy_stop_check_finished',**{k:v for k,v in report.items() if k!='samples'})
