"""Controlled local deployment. No job POST, reconciliation or direct SQL mutation."""
import importlib.util,json,re,subprocess,time,uuid
from pathlib import Path
from contextlib import closing
ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('watch',ROOT/'tmp/watch-one-approved-ui-job.py')
w=importlib.util.module_from_spec(spec);spec.loader.exec_module(w);m=w.m
report={};phase='preflight'

def idle(env):
 for i in range(10):
  if m.preflight(env):return
  time.sleep(1)
 raise RuntimeError('No safe idle window')

def job8(env):
 config=m.settings(env,'spring.datasource')
 row=w.query(config,"SELECT credit_state,accepted_count,charged_monthly,charged_extra,jsonb_array_length(credit_result) AS result_count FROM ai_generation_requests WHERE id=8")[0]
 events=w.query(config,"SELECT event_type,count(*) AS count FROM ai_credit_transactions WHERE job_id=8 GROUP BY event_type")
 if row!=dict(credit_state='succeeded',accepted_count=1,charged_monthly=1,charged_extra=0,result_count=1):raise RuntimeError('Job8 changed')
 if {r['event_type']:r['count'] for r in events}!={'reserve':1,'settle':1}:raise RuntimeError('Job8 ledger changed')
 return row

def wait_health(url,process):
 with m.httpx.Client(timeout=4,trust_env=False) as client:
  for _ in range(90):
   if process.poll() is not None:raise RuntimeError('Service exited; stop deployment')
   try:
    r=client.get(url)
    if r.status_code==200:return r.json()
   except m.httpx.HTTPError:pass
   time.sleep(1)
 raise RuntimeError('Service health timeout')

try:
 be=m.backend();env=be.environ();idle(env);report['job8_before']=job8(env)
 ai_pid=next(c.pid for c in m.psutil.net_connections(kind='tcp') if c.status=='LISTEN' and c.laddr.port==8002)
 ai=m.psutil.Process(ai_pid);ai_cmd=ai.cmdline();ai_env=ai.environ();ai_cwd=ai.cwd()
 if Path(ai_cwd).resolve()!=ROOT/'ai-service' or 'uvicorn' not in ai_cmd or '--reload' in ai_cmd:raise RuntimeError('AI process not verified')
 if '--workers' not in ai_cmd or ai_cmd[ai_cmd.index('--workers')+1]!='1':raise RuntimeError('Unexpected AI worker count')
 cmd=be.cmdline();cwd=be.cwd()
 cpfile=(ROOT/'tmp/job8-backend-classpath.txt').read_text(encoding='utf-8-sig').strip()
 cp=re.sub(r'\\([\\:= ])',r'\1',cpfile.split('=',1)[1])
 if Path(cp.split(';')[0]).resolve()!=ROOT/'backend/target/classes' or not all(Path(p).exists() for p in cp.split(';')):raise RuntimeError('Classpath validation failed')
 cmd[cmd.index('-cp')+1]=cp
 env['AI_CREDITS_WORKER_ENABLED']='false'
 env['AI_CREDITS_WORKER_CLUSTER_READY']='false'
 logs=ROOT/'.env.examflow.runtime/logs';stamp=time.strftime('%Y%m%d-%H%M%S')
 phase='backend_restart';be.terminate();be.wait(timeout=15)
 be_log=logs/('Backend-coordinated-'+stamp+'.log')
 with be_log.open('ab',buffering=0) as output:
  child=subprocess.Popen(cmd,cwd=cwd,env=env,stdin=subprocess.DEVNULL,stdout=output,stderr=output,creationflags=subprocess.CREATE_NO_WINDOW|subprocess.CREATE_NEW_PROCESS_GROUP)
 report['backend_health']=wait_health('http://127.0.0.1:8080/api/health',child)
 with m.httpx.Client(timeout=8,trust_env=False) as client:
  status=client.get('http://127.0.0.1:8080/api/internal/ai-credits/verify-key',headers={'X-AI-Internal-Key':ai_env['AI_INTERNAL_KEY']}).status_code
  if status!=204:raise RuntimeError('Internal key handshake failed')
 report.update(backend_pid=child.pid,backend_log=str(be_log),internal_key_http=status,worker_enabled=False,cluster_ready=False)
 m.emit('backend_coordination_loaded',pid=child.pid,health=200,worker_enabled=False,cluster_ready=False)
 phase='ai_restart_preflight';idle(env);job8(env)
 phase='ai_restart';ai.terminate();ai.wait(timeout=15)
 ai_log=logs/('AI-coordinated-'+stamp+'.log')
 with ai_log.open('ab',buffering=0) as output:
  ai_child=subprocess.Popen(ai_cmd,cwd=ai_cwd,env=ai_env,stdin=subprocess.DEVNULL,stdout=output,stderr=output,creationflags=subprocess.CREATE_NO_WINDOW|subprocess.CREATE_NEW_PROCESS_GROUP)
 health=wait_health('http://127.0.0.1:8002/health',ai_child)
 report['registry_id']=str(uuid.UUID(health['registryId']))
 report['ai_pid']=next(c.pid for c in m.psutil.net_connections(kind='tcp') if c.status=='LISTEN' and c.laddr.port==8002)
 report['ai_log']=str(ai_log)
 m.emit('ai_coordination_loaded',pid=report['ai_pid'],health=200,registry_id=report['registry_id'])
 phase='verification';report['job8_after']=job8(env);report['pools']=m.pool_check(env)
 with m.httpx.Client(timeout=10,trust_env=False) as client:
  r=client.get('http://127.0.0.1:11434/api/tags');r.raise_for_status()
  report['ollama_models']=[item['name'] for item in r.json()['models']]
  if not any(n.startswith('qwen2.5:7b') for n in report['ollama_models']) or not any(n.startswith('nomic-embed-text') for n in report['ollama_models']):raise RuntimeError('Required model missing')
 config=m.settings(env,'spring.datasource');samples=[]
 for i in range(5):
  samples.append(w.query(config,"""SELECT pid,application_name,query_start FROM pg_stat_activity
   WHERE datname=current_database() AND pid<>pg_backend_pid()
   AND application_name NOT LIKE %s AND query ILIKE %s AND query ILIKE %s""",
   ('ExamFlow-Main/ai-worker-v1%','SELECT * FROM public.ai_generation_requests WHERE credit_state IN%','%ORDER BY id LIMIT 100%')));time.sleep(1)
 report['legacy_poller_samples']=samples;report['legacy_poller_observed']=any(samples)
 report['quota']=w.query(config,"""SELECT m.used,m.reserved,m.monthly_limit-m.used-m.reserved+a.extra_balance-a.extra_reserved AS remaining
 FROM ai_credit_months m JOIN ai_credit_accounts a ON a.user_id=m.user_id JOIN users u ON u.id=m.user_id
 WHERE u.username='8000000004' AND m.month_start=date_trunc('month',now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date""")[0]
 report['production_test_ready']=False
 report['reason']='All participating Backend operators must disable/upgrade legacy workers before cluster-ready can be enabled.'
 report['production_job_posts']=0;report['production_sql_mutations']=0
 (ROOT/'tmp/ai-coordination-deployment.json').write_text(json.dumps(report,indent=2,default=str),encoding='utf-8')
 m.emit('deployment_verified',**{k:v for k,v in report.items() if k not in ('pools','legacy_poller_samples','backend_health')})
except Exception as e:
 m.emit('deployment_stopped',stage=phase,error=type(e).__name__)
 raise SystemExit(1)
