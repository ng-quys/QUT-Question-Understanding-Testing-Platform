"""Approved A/B/C helper. No secret output. Database inspections are read-only."""
import os,sys,json,re,time,subprocess,socket
from pathlib import Path
from urllib.parse import urlparse,parse_qs
from contextlib import closing
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'tmp/ai-diag-deps'))
import psutil,httpx,psycopg2
from dotenv import dotenv_values
def emit(phase,**fields):print(json.dumps(dict(phase=phase,**fields),default=str,ensure_ascii=True),flush=True)
def backend():
 pids={c.pid for c in psutil.net_connections(kind='tcp') if c.status==psutil.CONN_LISTEN and c.laddr.port==8080}
 if len(pids)!=1:raise RuntimeError('Expected exactly one Backend listener')
 p=psutil.Process(pids.pop())
 if 'com.examflow.backend' not in ' '.join(p.cmdline()) or Path(p.cwd()).resolve()!=ROOT/'backend':
  raise RuntimeError('Backend process identity mismatch')
 return p
def settings(env,prefix):
 props={}
 for p in [ROOT/'backend/src/main/resources/application.properties',ROOT/'.env.questionbank',ROOT/'backend/.env.questionbank']:
  if p.exists():
   for line in p.read_text(encoding='utf-8-sig').splitlines():
    if line.strip() and not line.lstrip().startswith('#') and '=' in line:
     k,v=line.split('=',1);props[k.strip()]=v.strip()
 def value(k):
  raw=env.get(k.upper().replace('.','_').replace('-','_'),props.get(k,''))
  for _ in range(4):
   m=re.fullmatch(r'\$\{([^}:]+)(?::([^}]*))?\}',raw)
   if not m:break
   raw=env.get(m[1],props.get(m[1],m[2] or ''))
  return raw
 u=urlparse(value(prefix+'.url').removeprefix('jdbc:'))
 return dict(host=u.hostname,port=u.port or 5432,dbname=u.path.lstrip('/'),user=value(prefix+'.username'),
  password=value(prefix+'.password'),sslmode=parse_qs(u.query).get('sslmode',['require'])[0],connect_timeout=8)
def connection(config,transaction=False):
 config=config.copy()
 if transaction:config['port']=6543
 c=psycopg2.connect(**config,options='-c default_transaction_read_only=on -c statement_timeout=8000',application_name='examflow-approved-readonly')
 c.set_session(readonly=True,autocommit=True)
 return c
def ai_env():
 pid=next(c.pid for c in psutil.net_connections(kind='tcp') if c.status==psutil.CONN_LISTEN and c.laddr.port==8002)
 return psutil.Process(pid).environ()
def preflight(env):
 # Diagnostic-only transaction endpoint avoids the known saturated session pool.
 with closing(connection(settings(env,'spring.datasource'),transaction=True)) as c:
  with c.cursor() as q:
   q.execute("SELECT id,credit_state,execution_token,accepted_count FROM ai_generation_requests WHERE credit_state IN ('reserved','running','cancel_requested','unknown')")
   jobs=q.fetchall()
   q.execute("SELECT count(*) FROM exam_attempts a LEFT JOIN exam_sessions s ON s.id=a.exam_session_id WHERE a.status='in_progress' AND (s.id IS NULL OR s.end_time>now())")
   live_attempts=q.fetchone()[0]
   q.execute("SELECT count(*) FROM exam_sessions WHERE status='ongoing' AND end_time>now()")
   live_sessions=q.fetchone()[0]
   q.execute("SELECT count(*) FROM pg_stat_activity WHERE backend_type='client backend' AND application_name IN ('PostgreSQL JDBC Driver','ExamFlow-Main','ExamFlow-QuestionBank') AND state IN ('active','idle in transaction')")
   busy=q.fetchone()[0]
 active=[r[0] for r in jobs if r[1] in ('reserved','running','cancel_requested')]
 remote_running=[]
 with httpx.Client(timeout=8,trust_env=False) as client:
  ae=ai_env();headers={'X-AI-Internal-Key':ae['AI_INTERNAL_KEY']}
  for jid,state,token,accepted in jobs:
   if token:
    r=client.get('http://127.0.0.1:8002/credits/jobs/'+str(token),headers=headers)
    if r.status_code not in (200,404):raise RuntimeError('Upstream status unavailable')
    if r.status_code==200 and r.json().get('status')=='running':remote_running.append(jid)
 emit('restart_preflight',active_jobs=active,remote_running=remote_running,live_exam_attempts=live_attempts,live_exam_sessions=live_sessions,busy_jdbc=busy)
 if active or remote_running or live_attempts or live_sessions:raise RuntimeError('Restart blocked by active or important work')
 return busy==0

def pool_check(env):
 report={}
 for name,prefix in [('main','spring.datasource'),('questionbank','questionbank.datasource')]:
  with closing(connection(settings(env,prefix))) as c:
   with c.cursor() as q:
    q.execute("SELECT application_name,state,count(*) FROM pg_stat_activity WHERE datname=current_database() AND backend_type='client backend' GROUP BY 1,2 ORDER BY 3 DESC")
    report[name]=q.fetchall()
 emit('pool_check_session_endpoints',**report)
 return report

def restart():
 old=backend();env=old.environ();cmd=old.cmdline();cwd=old.cwd()
 for _ in range(10):
  if preflight(env):break
  time.sleep(1)
 else:raise RuntimeError('No JDBC idle window; restart not attempted')
 # Source was compiled and tested before this command; execute the same JVM/classpath.
 old.terminate();old.wait(timeout=15)
 logs=ROOT/'.env.examflow.runtime/logs';logs.mkdir(parents=True,exist_ok=True)
 logfile=logs/('Backend-approved-'+time.strftime('%Y%m%d-%H%M%S')+'.log')
 with open(logfile,'ab',buffering=0) as log:
  child=subprocess.Popen(cmd,cwd=cwd,env=env,stdin=subprocess.DEVNULL,stdout=log,stderr=log,
   creationflags=subprocess.CREATE_NO_WINDOW|subprocess.CREATE_NEW_PROCESS_GROUP)
 emit('backend_restart_started',old_pid=old.pid,new_pid=child.pid,log_path=str(logfile))
 with httpx.Client(timeout=5,trust_env=False) as client:
  for _ in range(120):
   if child.poll() is not None:raise RuntimeError('Backend exited during restart; do not proceed')
   try:
    r=client.get('http://127.0.0.1:8080/api/health')
    if r.status_code==200:break
   except httpx.HTTPError:pass
   time.sleep(1)
  else:raise RuntimeError('Backend health timeout; do not proceed')
  verify=client.get('http://127.0.0.1:8080/api/internal/ai-credits/verify-key',headers={'X-AI-Internal-Key':env['AI_INTERNAL_KEY']})
  emit('backend_health',http=r.status_code,internal_key_http=verify.status_code)
  if verify.status_code!=204:raise RuntimeError('Backend internal key handshake failed')
 pool_check(env)
 # Persist metadata only, never credentials.
 (ROOT/'tmp/approved-ai-stage-a.json').write_text(json.dumps(dict(pid=child.pid,health_http=200,log_path=str(logfile)),indent=2),encoding='utf-8')

def login_check():
 import getpass
 password=getpass.getpass('Admin password (hidden): ')
 with httpx.Client(timeout=20,trust_env=False) as client:
  r=client.post('http://127.0.0.1:8080/api/auth/login',json={'username':'admin_quy','password':password})
  password=None
  if r.status_code!=200:raise RuntimeError('Login verification failed; stop before B')
  tokens=r.json()
  me=client.get('http://127.0.0.1:8080/api/auth/me',headers={'Authorization':'Bearer '+tokens['access_token']})
  emit('login_verified',http=r.status_code,me_http=me.status_code,role=me.json().get('role'))
  if me.status_code!=200 or me.json().get('role')!='admin':raise RuntimeError('Admin principal verification failed')
 pool_check(backend().environ())
 path=ROOT/'tmp/approved-ai-stage-a.json';record=json.loads(path.read_text(encoding='utf-8'))
 record['login_http']=200;record['session_connections_verified']=True
 path.write_text(json.dumps(record,indent=2),encoding='utf-8')

if __name__=='__main__':
 try:
  if sys.argv[1:] == ['preflight']:preflight(backend().environ())
  elif sys.argv[1:] == ['restart']:restart()
  elif sys.argv[1:] == ['pools']:pool_check(backend().environ())
  elif sys.argv[1:] == ['login-check']:login_check()
  else:raise RuntimeError('Explicit phase required')
 except Exception as e:
  emit('stopped',exception=type(e).__name__,pool_limit='max clients reached' in str(e))
  sys.exit(1)
