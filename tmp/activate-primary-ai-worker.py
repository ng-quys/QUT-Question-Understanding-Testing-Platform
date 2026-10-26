"""Activate only the verified local BE after legacy-stop observation; no job POST/DML."""
import importlib.util,json,time,subprocess,uuid
from pathlib import Path
from datetime import datetime,timezone
from contextlib import closing
ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('watch',ROOT/'tmp/watch-one-approved-ui-job.py')
w=importlib.util.module_from_spec(spec);spec.loader.exec_module(w);m=w.m
report={};stage='preflight'
def legacy(config):
 return w.query(config,"""SELECT pid,application_name,query_start FROM pg_stat_activity
 WHERE datname=current_database() AND pid<>pg_backend_pid()
 AND application_name NOT LIKE %s AND query ILIKE %s AND query ILIKE %s""",
 ('ExamFlow-Main/ai-worker-v1%','SELECT * FROM public.ai_generation_requests WHERE credit_state IN%','%ORDER BY id LIMIT 100%'))
try:
 proof=json.loads((ROOT/'tmp/legacy-worker-stop-check.json').read_text(encoding='utf-8'))
 age=(datetime.now(timezone.utc)-datetime.fromisoformat(proof['finished_utc'])).total_seconds()
 if not proof['clear_for_activation'] or len(proof['samples'])<16 or age>600:raise RuntimeError('No recent clear observation')
 be=m.backend();env=be.environ();config=m.settings(env,'spring.datasource')
 if config['port']==6543:raise RuntimeError('Session endpoint required')
 if legacy(config):raise RuntimeError('Legacy polling returned; no restart')
 for i in range(10):
  if m.preflight(env):break
  time.sleep(1)
 else:raise RuntimeError('No idle window')
 # Include the current coordinated application label in the JDBC-busy guard.
 busy=w.query(config,"""SELECT count(*) AS count FROM pg_stat_activity WHERE datname=current_database()
 AND application_name LIKE %s AND state IN ('active','idle in transaction')""",('ExamFlow-Main%',))[0]['count']
 if busy:raise RuntimeError('Current Backend has important database work')
 job=w.query(config,"SELECT credit_state,accepted_count,charged_monthly,charged_extra,jsonb_array_length(credit_result) AS result_count FROM ai_generation_requests WHERE id=8")[0]
 if job!=dict(credit_state='succeeded',accepted_count=1,charged_monthly=1,charged_extra=0,result_count=1):raise RuntimeError('Job8 changed')
 ledger=w.query(config,'SELECT event_type,monthly_used_delta,monthly_reserved_delta FROM ai_credit_transactions WHERE job_id=8 ORDER BY id')
 if [r['event_type'] for r in ledger]!=['reserve','settle'] or ledger[-1]['monthly_used_delta']!=1 or ledger[-1]['monthly_reserved_delta']!=-1:raise RuntimeError('Job8 ledger changed')
 with m.httpx.Client(timeout=8,trust_env=False) as client:
  ai_before=client.get('http://127.0.0.1:8002/health');ai_before.raise_for_status()
  registry=ai_before.json()['registryId']
 ai_pid=next(c.pid for c in m.psutil.net_connections(kind='tcp') if c.status=='LISTEN' and c.laddr.port==8002)
 cmd=be.cmdline();cwd=be.cwd()
 if '-cp' not in cmd or cmd[cmd.index('-cp')+1].startswith('@'):raise RuntimeError('Unverified classpath')
 env['AI_CREDITS_WORKER_ENABLED']='true';env['AI_CREDITS_WORKER_CLUSTER_READY']='true'
 if legacy(config):raise RuntimeError('Legacy polling returned before restart')
 stage='backend_restart';old_pid=be.pid;be.terminate();be.wait(timeout=15)
 logfile=ROOT/'.env.examflow.runtime/logs'/('Backend-primary-'+time.strftime('%Y%m%d-%H%M%S')+'.log')
 with logfile.open('ab',buffering=0) as output:
  child=subprocess.Popen(cmd,cwd=cwd,env=env,stdin=subprocess.DEVNULL,stdout=output,stderr=output,creationflags=subprocess.CREATE_NO_WINDOW|subprocess.CREATE_NEW_PROCESS_GROUP)
 report.update(old_backend_pid=old_pid,backend_pid=child.pid,backend_log=str(logfile),ai_pid=ai_pid,registry_id=registry)
 with m.httpx.Client(timeout=5,trust_env=False) as client:
  for i in range(90):
   if child.poll() is not None:raise RuntimeError('Backend exited; stop')
   try:
    r=client.get('http://127.0.0.1:8080/api/health')
    if r.status_code==200:break
   except m.httpx.HTTPError:pass
   time.sleep(1)
  else:raise RuntimeError('Backend health timeout')
  report['backend_health_http']=r.status_code
  report['internal_key_http']=client.get('http://127.0.0.1:8080/api/internal/ai-credits/verify-key',headers={'X-AI-Internal-Key':m.ai_env()['AI_INTERNAL_KEY']}).status_code
  ai_after=client.get('http://127.0.0.1:8002/health');ai_after.raise_for_status()
  if ai_after.json()['registryId']!=registry:raise RuntimeError('FastAPI registry changed unexpectedly')
  if report['internal_key_http']!=204:raise RuntimeError('Internal key mismatch')
 if next(c.pid for c in m.psutil.net_connections(kind='tcp') if c.status=='LISTEN' and c.laddr.port==8002)!=ai_pid:raise RuntimeError('FastAPI PID changed')
 m.emit('primary_backend_loaded',**report)
 stage='polling_verification';samples=[]
 for n in range(12):
  old=legacy(config)
  if old:raise RuntimeError('Legacy poller returned; do not invite UI test')
  rows=w.query(config,"""SELECT pid,application_name,query_start FROM pg_stat_activity
    WHERE datname=current_database() AND application_name LIKE %s
    AND query ILIKE %s AND query ILIKE %s""",
   ('ExamFlow-Main/ai-worker-v1%','SELECT * FROM public.ai_generation_requests WHERE credit_state IN%','%ORDER BY id LIMIT 100%'))
  samples.append(rows);time.sleep(2)
 stamps={str(r['query_start']) for rows in samples for r in rows}
 if len(stamps)<2:raise RuntimeError('No repeated coordinated worker polling observed')
 report['primary_poll_samples']=samples;report['legacy_poller_observed']=False
 # Test PostgreSQL coordination primitives with isolated NEGATIVE lock key, never a job ID.
 # Both connections are read-only. No rows, balances, schema or production jobs are touched.
 stage='advisory_smoke';key=-(uuid.uuid4().int%((1<<62)-1)+1)
 with closing(m.connection(config)) as first,closing(m.connection(config)) as second:
  with first.cursor() as a,second.cursor() as b:
   try:
    a.execute('SELECT pg_try_advisory_lock(%s)',(key,));acquired=a.fetchone()[0]
    b.execute('SELECT pg_try_advisory_lock(%s)',(key,));blocked=not b.fetchone()[0]
    a.execute('SELECT pg_advisory_unlock(%s)',(key,));released=a.fetchone()[0]
    b.execute('SELECT pg_try_advisory_lock(%s)',(key,));handover=b.fetchone()[0]
    report['advisory_lock_smoke']=dict(first_acquired=acquired,second_blocked=blocked,first_released=released,second_acquired_after_release=handover)
    if not all(report['advisory_lock_smoke'].values()):raise RuntimeError('PostgreSQL coordination smoke failed')
   finally:
    for cursor in (a,b):
     try:cursor.execute('SELECT pg_advisory_unlock(%s)',(key,))
     except Exception:pass
 report.update(worker_enabled=True,cluster_ready=True,fastapi_unchanged=True,job8_verified=True,production_job_posts=0,production_sql_mutations=0)
 # Persist only the two non-secret flags for this machine's existing one-click launcher.
 local=ROOT/'.env.examflow.local.json'
 settings=json.loads(local.read_text(encoding='utf-8-sig')) if local.exists() else {}
 settings.setdefault('Environment',{}).update(AI_CREDITS_WORKER_ENABLED='true',AI_CREDITS_WORKER_CLUSTER_READY='true')
 local.write_text(json.dumps(settings,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
 report['local_flags_persisted']=True;report['finished_utc']=datetime.now(timezone.utc).isoformat()
 (ROOT/'tmp/primary-worker-activation.json').write_text(json.dumps(report,indent=2,default=str),encoding='utf-8')
 m.emit('primary_activation_verified',**{k:v for k,v in report.items() if k!='primary_poll_samples'})
except Exception as error:
 report.update(stopped_stage=stage,error=type(error).__name__,production_test_ready=False)
 (ROOT/'tmp/primary-worker-activation-stopped.json').write_text(json.dumps(report,indent=2,default=str),encoding='utf-8')
 m.emit('activation_stopped',stage=stage,error=type(error).__name__)
 raise SystemExit(1)
