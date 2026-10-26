"""Deploy approved job15 recovery API. SELECT/GET only; preserves upstream and all job rows."""
import importlib.util,json,time,subprocess,hashlib
from pathlib import Path
from contextlib import closing
ROOT=Path(__file__).resolve().parents[1]
s=importlib.util.spec_from_file_location('m',ROOT/'tmp/approved-ai-deploy.py');m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
be=m.backend();env=be.environ();config=m.settings(env,'spring.datasource')
def query(sql,args=()):
 with closing(m.connection(config,transaction=True)) as c:
  with c.cursor() as q:
   q.execute(sql,args);return [dict(zip([d[0] for d in q.description],r)) for r in q.fetchall()]
def digest(v):return hashlib.sha256(json.dumps(v,sort_keys=True,default=str).encode()).hexdigest()
def snapshot():return dict(job=query('SELECT * FROM ai_generation_requests WHERE id=15'),ledger=query('SELECT * FROM ai_credit_transactions WHERE job_id=15 ORDER BY id'),quota=query('SELECT * FROM ai_credit_months WHERE user_id=35 ORDER BY month_start'))
before=snapshot();job=before['job'][0]
if job['credit_state']!='cancel_requested' or job['accepted_count']!=2 or job['reserved_monthly']!=10 or job['reserved_extra']!=0 or job['charged_monthly'] or job['charged_extra']:raise RuntimeError('Job15 changed; stop')
if len(before['ledger'])!=1 or before['ledger'][0]['event_type']!='reserve':raise RuntimeError('Ledger changed; stop')
active=query("SELECT id FROM ai_generation_requests WHERE credit_state IN ('reserved','running','cancel_requested','unknown')")
if [r['id'] for r in active]!=[15]:raise RuntimeError('Other active jobs; stop')
if query("SELECT count(*) AS n FROM exam_attempts a LEFT JOIN exam_sessions s ON s.id=a.exam_session_id WHERE a.status='in_progress' AND (s.id IS NULL OR s.end_time>now())")[0]['n']:raise RuntimeError('Live exam attempts; stop')
if query("SELECT count(*) AS n FROM exam_sessions WHERE status='ongoing' AND end_time>now()")[0]['n']:raise RuntimeError('Live exam sessions; stop')
ae=m.ai_env();headers={'X-AI-Internal-Key':ae['AI_INTERNAL_KEY']}
def upstream():
 with m.httpx.Client(timeout=8,trust_env=False) as client:
  r=client.get('http://127.0.0.1:8002/health');r.raise_for_status();registry=r.json()['registryId']
  if registry==job['credit_payload']['_executionRegistry'] if isinstance(job['credit_payload'],dict) else registry==json.loads(job['credit_payload'])['_executionRegistry']:raise RuntimeError('Old registry live; stop')
  r=client.get('http://127.0.0.1:8002/credits/jobs/'+str(job['execution_token']),headers={**headers,'X-AI-Registry-Id':registry})
  if r.status_code!=404:raise RuntimeError('Old execution still exists or upstream unavailable; stop')
  client.get('http://127.0.0.1:11434/api/tags').raise_for_status()
  return registry
registry=upstream()
for _ in range(3):
 legacy=query("SELECT pid FROM pg_stat_activity WHERE datname=current_database() AND application_name NOT LIKE %s AND query ILIKE %s AND query ILIKE %s",('ExamFlow-Main/ai-worker-v1%','SELECT * FROM public.ai_generation_requests WHERE credit_state IN%','%ORDER BY id LIMIT 100%'))
 if legacy:raise RuntimeError('Legacy worker; stop')
 time.sleep(2)
# Verify only the replacement FastAPI command is listening; never stop it.
ai_pids={c.pid for c in m.psutil.net_connections(kind='tcp') if c.status=='LISTEN' and c.laddr.port==8002}
if len(ai_pids)!=1:raise RuntimeError('Ambiguous FastAPI')
ai=m.psutil.Process(next(iter(ai_pids)))
if ai.create_time()<=job['heartbeat_at'].timestamp():raise RuntimeError('Cannot attest original FastAPI stopped')
cmd=be.cmdline();cwd=be.cwd();idx=cmd.index('-cp')+1
if cmd[idx].startswith('@'):
 raw=Path(cmd[idx][1:]).read_text(encoding='utf-8-sig').strip().strip('"');parts=raw.split(';')
 if not all(Path(p).exists() for p in parts) or not any(Path(p).resolve()==(ROOT/'backend/target/classes').resolve() for p in parts):raise RuntimeError('Invalid classpath')
 cmd[idx]=raw
if digest(snapshot())!=digest(before):raise RuntimeError('Snapshot changed; stop')
for _ in range(15):
 if not query("SELECT count(*) AS n FROM pg_stat_activity WHERE datname=current_database() AND application_name LIKE %s AND state IN ('active','idle in transaction')",('ExamFlow-Main%',))[0]['n']:break
 time.sleep(1)
else:raise RuntimeError('Backend remains busy; stop')
if upstream()!=registry:raise RuntimeError('Upstream changed')
(ROOT/'tmp/job15-before-approved-recovery.json').write_text(json.dumps(before,default=str,indent=2),encoding='utf-8')
m.emit('restart_safe',pid=be.pid,only_orphan_job=15,checkpoint=2,other_active_jobs=0)
be.terminate();be.wait(timeout=15)
logfile=ROOT/'.env.examflow.runtime/logs'/('Backend-checkpoint-recovery-'+time.strftime('%Y%m%d-%H%M%S')+'.log');logfile.parent.mkdir(exist_ok=True,parents=True)
with logfile.open('ab',buffering=0) as log:
 child=subprocess.Popen(cmd,cwd=cwd,env=env,stdin=subprocess.DEVNULL,stdout=log,stderr=log,creationflags=subprocess.CREATE_NO_WINDOW|subprocess.CREATE_NEW_PROCESS_GROUP)
m.emit('restart_started',pid=child.pid,log=str(logfile))
with m.httpx.Client(timeout=5,trust_env=False) as client:
 for _ in range(90):
  if child.poll() is not None:raise RuntimeError('Backend exited; stop')
  try:
   if client.get('http://127.0.0.1:8080/api/health').status_code==200:break
  except m.httpx.HTTPError:pass
  time.sleep(1)
 else:raise RuntimeError('Health timeout; stop')
 if client.get('http://127.0.0.1:8080/api/internal/ai-credits/verify-key',headers=headers).status_code!=204:raise RuntimeError('Key mismatch; stop')
 if client.get('http://127.0.0.1:8080/api/admin/ai-credits/jobs/15/checkpoint-recovery').status_code not in (401,403):raise RuntimeError('Admin auth guard failed')
if upstream()!=registry or digest(snapshot())!=digest(before):raise RuntimeError('Snapshot changed after restart; stop')
m.emit('restart_verified',pid=child.pid,health=200,upstream_unchanged=True,job15_and_ledger_unchanged=True)
