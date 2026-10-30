"""User-authorized primary BE restart. No job POSTs or database row mutations."""
import importlib.util,json,time,subprocess,hashlib,uuid
from pathlib import Path
from datetime import datetime,timezone
from contextlib import closing
ROOT=Path(__file__).resolve().parents[1]
s=importlib.util.spec_from_file_location('watch',ROOT/'tmp/watch-one-approved-ui-job.py')
w=importlib.util.module_from_spec(s);s.loader.exec_module(w);m=w.m
report={};stage='preflight'
def digest(value):return hashlib.sha256(json.dumps(value,sort_keys=True,default=str).encode()).hexdigest()
def snapshot(config):
 job=w.query(config,'SELECT * FROM ai_generation_requests WHERE id=8')
 ledger=w.query(config,'SELECT * FROM ai_credit_transactions WHERE job_id=8 ORDER BY id')
 reservations=w.query(config,"SELECT coalesce(sum(reserved),0) AS monthly FROM ai_credit_months")
 extra=w.query(config,"SELECT coalesce(sum(extra_reserved),0) AS extra FROM ai_credit_accounts")
 unresolved=w.query(config,"SELECT id,credit_state FROM ai_generation_requests WHERE credit_state IN ('reserved','running','cancel_requested','unknown')")
 return dict(job8_hash=digest(job),ledger_hash=digest(ledger),job8_state=job[0]['credit_state'],job8_accepted=job[0]['accepted_count'],job8_charged=job[0]['charged_monthly']+job[0]['charged_extra'],ledger_events=[r['event_type'] for r in ledger],monthly_reserved=reservations[0]['monthly'],extra_reserved=extra[0]['extra'],unresolved=unresolved)
def old_polls(config):
 return w.query(config,"""SELECT pid,application_name,query_start FROM pg_stat_activity WHERE datname=current_database()
 AND pid<>pg_backend_pid() AND application_name NOT LIKE %s AND query ILIKE %s AND query ILIKE %s""",('ExamFlow-Main/ai-worker-v1%','SELECT * FROM public.ai_generation_requests WHERE credit_state IN%','%ORDER BY id LIMIT 100%'))
def listener(port):
 ids={c.pid for c in m.psutil.net_connections(kind='tcp') if c.status=='LISTEN' and c.laddr.port==port}
 if len(ids)!=1:raise RuntimeError('Expected one service listener')
 return ids.pop()
try:
 proof=json.loads((ROOT/'tmp/current-pollers-readonly-audit.json').read_text())
 if len(proof['samples'])<18 or (datetime.now(timezone.utc)-datetime.fromisoformat(proof['finished_utc'])).total_seconds()>600:raise RuntimeError('Fresh observation required')
 if any(g['kind']=='global_ai_poll' and not g['application'].startswith('ExamFlow-Main/ai-worker-v1') for g in proof['groups']):raise RuntimeError('Legacy poller observed')
 be=m.backend();env=be.environ();config=m.settings(env,'spring.datasource')
 if be.pid!=proof['primary_pid'] or config['port']==6543:raise RuntimeError('Primary identity or datasource changed')
 before=snapshot(config);report['before']=before
 if before['unresolved'] or before['monthly_reserved'] or before['extra_reserved']:raise RuntimeError('Unresolved jobs or reservations; stop')
 if before['job8_state']!='succeeded' or before['job8_accepted']!=1 or before['job8_charged']!=1 or before['ledger_events']!=['reserve','settle']:raise RuntimeError('Job8 unexpected state')
 if old_polls(config):raise RuntimeError('Legacy poller returned')
 if not m.preflight(env):raise RuntimeError('Busy tasks before restart')
 # Isolated negative advisory key; never use any production job key.
 key=-(uuid.uuid4().int%((1<<62)-1)+1)
 with closing(m.connection(config)) as a,closing(m.connection(config)) as b:
  with a.cursor() as qa,b.cursor() as qb:
   try:
    qa.execute('SELECT pg_try_advisory_lock(%s)',(key,));first=qa.fetchone()[0]
    qb.execute('SELECT pg_try_advisory_lock(%s)',(key,));blocked=not qb.fetchone()[0]
    qa.execute('SELECT pg_advisory_unlock(%s)',(key,));released=qa.fetchone()[0]
    qb.execute('SELECT pg_try_advisory_lock(%s)',(key,));handover=qb.fetchone()[0]
    report['lock_check']=dict(first=first,second_blocked=blocked,released=released,handover=handover)
    if not all(report['lock_check'].values()):raise RuntimeError('Advisory lock check failed')
   finally:
    for cursor in (qa,qb):cursor.execute('SELECT pg_advisory_unlock(%s)',(key,))
 ai_pid=listener(8002);ollama_pid=listener(11434)
 with m.httpx.Client(timeout=8,trust_env=False) as client:
  ai=client.get('http://127.0.0.1:8002/health');ai.raise_for_status();registry=ai.json()['registryId']
  models=client.get('http://127.0.0.1:11434/api/tags');models.raise_for_status()
  report['models']=[r['name'] for r in models.json()['models']]
 cmd=be.cmdline();cwd=be.cwd()
 if '-cp' not in cmd:raise RuntimeError('Cannot safely reuse classpath')
 cp_index=cmd.index('-cp')+1
 if cmd[cp_index].startswith('@'):
  # Spring Boot Maven uses a temporary argument file containing one quoted classpath.
  # Expand it before stopping its child: Maven may delete the file on child exit.
  argfile=Path(cmd[cp_index][1:]);raw=argfile.read_text(encoding='utf-8-sig').strip()
  if raw.startswith('"') and raw.endswith('"'):raw=raw[1:-1]
  entries=raw.split(';')
  if not entries or any('\n' in part or '\r' in part for part in entries):raise RuntimeError('Unexpected classpath argument format')
  if not any(Path(part).resolve()==(ROOT/'backend/target/classes').resolve() for part in entries):raise RuntimeError('Classpath missing project classes')
  if not all(Path(part).exists() for part in entries):raise RuntimeError('Classpath contains missing entries')
  cmd[cp_index]=raw
 env.update(AI_CREDITS_WORKER_ENABLED='true',AI_CREDITS_WORKER_CLUSTER_READY='true')
 # These environment flags must not be overridden by explicit JVM/CLI properties.
 if any('ai.credits.worker.' in arg for arg in cmd):raise RuntimeError('Worker command override needs review')
 if old_polls(config) or snapshot(config)!=before:raise RuntimeError('State changed before restart')
 busy=w.query(config,"SELECT count(*) AS count FROM pg_stat_activity WHERE datname=current_database() AND application_name LIKE %s AND state IN ('active','idle in transaction')",('ExamFlow-Main%',))[0]['count']
 if busy:raise RuntimeError('Backend database work in progress')
 m.emit('safe_to_restart',pid=be.pid,reservations=0,legacy_polls=0,lock_check=report['lock_check'])
 stage='restart';old_pid=be.pid;be.terminate();be.wait(timeout=15)
 logfile=ROOT/'.env.examflow.runtime/logs'/('Backend-primary-'+time.strftime('%Y%m%d-%H%M%S')+'.log')
 with logfile.open('ab',buffering=0) as log:
  child=subprocess.Popen(cmd,cwd=cwd,env=env,stdin=subprocess.DEVNULL,stdout=log,stderr=log,creationflags=subprocess.CREATE_NO_WINDOW|subprocess.CREATE_NEW_PROCESS_GROUP)
 report.update(old_pid=old_pid,pid=child.pid,log=str(logfile),ai_pid=ai_pid,ollama_pid=ollama_pid)
 m.emit('restart_started',**{k:v for k,v in report.items() if k in ['old_pid','pid','log']})
 stage='verify'
 with m.httpx.Client(timeout=5,trust_env=False) as client:
  for _ in range(90):
   if child.poll() is not None:raise RuntimeError('Backend exited; stop')
   try:
    health=client.get('http://127.0.0.1:8080/api/health')
    if health.status_code==200:break
   except m.httpx.HTTPError:pass
   time.sleep(1)
  else:raise RuntimeError('Backend startup timeout')
  report['health_http']=health.status_code
  ai=client.get('http://127.0.0.1:8002/health');ai.raise_for_status()
  if ai.json()['registryId']!=registry or listener(8002)!=ai_pid or listener(11434)!=ollama_pid:raise RuntimeError('Upstream changed')
  report['internal_key_http']=client.get('http://127.0.0.1:8080/api/internal/ai-credits/verify-key',headers={'X-AI-Internal-Key':m.ai_env()['AI_INTERNAL_KEY']}).status_code
  if report['internal_key_http']!=204:raise RuntimeError('Internal authentication mismatch')
  report['unauthenticated_readiness_http']=client.get('http://127.0.0.1:8080/api/teacher/ai-credits/readiness').status_code
 samples=[]
 for _ in range(12):
  if old_polls(config):raise RuntimeError('Legacy poller returned; stop')
  samples+=w.query(config,"SELECT pid,query_start FROM pg_stat_activity WHERE datname=current_database() AND application_name LIKE %s AND query ILIKE %s AND query ILIKE %s",('ExamFlow-Main/ai-worker-v1%','SELECT * FROM public.ai_generation_requests WHERE credit_state IN%','%ORDER BY id LIMIT 100%'))
  time.sleep(2)
 if len({str(r['query_start']) for r in samples})<2:raise RuntimeError('Primary polling not demonstrated')
 report['primary_poll_samples']=samples
 after=snapshot(config);report['after']=after
 if after!=before:raise RuntimeError('Job8 ledger or reservations changed')
 current=m.backend()
 if current.pid!=child.pid:raise RuntimeError('Primary process replaced unexpectedly')
 actual=current.environ()
 if any(actual.get(k)!='true' for k in ['AI_CREDITS_WORKER_ENABLED','AI_CREDITS_WORKER_CLUSTER_READY']):raise RuntimeError('Flags not loaded')
 logtext=logfile.read_text(encoding='utf-8',errors='replace')
 report['startup_flags_verified']='enabled=true clusterReady=true' in logtext
 if not report['startup_flags_verified'] or 'AI credit poller unavailable' in logtext:raise RuntimeError('Worker startup or poller error')
 local=ROOT/'.env.examflow.local.json';settings=json.loads(local.read_text(encoding='utf-8-sig')) if local.exists() else {}
 settings.setdefault('Environment',{}).update(AI_CREDITS_WORKER_ENABLED='true',AI_CREDITS_WORKER_CLUSTER_READY='true')
 local.write_text(json.dumps(settings,indent=2)+'\n',encoding='utf-8')
 report.update(server_checks_passed=True,authenticated_readiness_pending=True,fastapi_ollama_unchanged=True,finished_utc=datetime.now(timezone.utc).isoformat())
 m.emit('server_checks_passed',**{k:v for k,v in report.items() if k!='primary_poll_samples'})
except Exception as error:
 report.update(stopped_stage=stage,error=type(error).__name__,reason=str(error) if isinstance(error,RuntimeError) else 'External operation failed; inspect stage without exposing connection secrets',server_checks_passed=False)
 m.emit('stopped',**{k:report[k] for k in ['stopped_stage','error','reason']})
finally:
 (ROOT/'tmp/primary-enable-20261023-report.json').write_text(json.dumps(report,indent=2,default=str),encoding='utf-8')
if not report.get('server_checks_passed'):raise SystemExit(1)
