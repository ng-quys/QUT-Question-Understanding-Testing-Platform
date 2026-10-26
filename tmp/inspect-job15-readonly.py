"""Job15 SELECT/GET only. Never starts/stops a service or writes application data."""
import importlib.util,json,time,hashlib
from datetime import datetime,timezone
from pathlib import Path
from contextlib import closing
ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('m',ROOT/'tmp/approved-ai-deploy.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
report={};be=m.backend();env=be.environ();config=m.settings(env,'spring.datasource')
def query(sql,args=()):
 with closing(m.connection(config,transaction=True)) as c:
  with c.cursor() as q:
   q.execute(sql,args);return [dict(zip([d[0] for d in q.description],row)) for row in q.fetchall()]
def process(port):
 ids={c.pid for c in m.psutil.net_connections(kind='tcp') if c.status=='LISTEN' and c.laddr.port==port}
 rows=[]
 for pid in ids:
  p=m.psutil.Process(pid);rows.append(dict(pid=pid,started_utc=datetime.fromtimestamp(p.create_time(),timezone.utc).isoformat(),cwd=p.cwd()))
 return rows
m.emit('audit_connected_to_process',backend_pid=be.pid)
report.update(backend=process(8080),fastapi=process(8002),ollama=process(11434),worker_flags={k:env.get(k,'<unset>') for k in ['AI_CREDITS_WORKER_ENABLED','AI_CREDITS_WORKER_CLUSTER_READY']})
rows=query("""SELECT id,requested_by,course_id,status,credit_state,execution_token,requested_question_count,accepted_count,
 reserved_monthly,reserved_extra,charged_monthly,charged_extra,credit_created_at,dispatched_at,heartbeat_at,lease_expires_at,
 cancel_requested_at,credit_completed_at,credit_error_code,
 credit_payload::jsonb->>'_executionRegistry' AS registry,
 credit_payload::jsonb->>'provider' AS provider,
 jsonb_array_length(coalesce(credit_result::jsonb,'[]'::jsonb)) AS checkpoint_count
 FROM ai_generation_requests WHERE id=15""")
if len(rows)!=1:raise RuntimeError('Job15 not found')
job=rows[0];report['job']=job
m.emit('job15_database_state',job=job)
report['ledger']=query('SELECT id,event_type,monthly_used_delta,monthly_reserved_delta,extra_balance_delta,extra_reserved_delta,created_at FROM ai_credit_transactions WHERE job_id=15 ORDER BY id')
report['reservations']=query('SELECT user_id,month_start,monthly_limit,used,reserved FROM ai_credit_months WHERE user_id=%s ORDER BY month_start DESC LIMIT 1',(job['requested_by'],))
report['extra']=query('SELECT extra_balance,extra_reserved FROM ai_credit_accounts WHERE user_id=%s',(job['requested_by'],))
report['checkpoints']=query("SELECT credit_result::jsonb AS items FROM ai_generation_requests WHERE id=15")
ae=m.ai_env();headers={'X-AI-Internal-Key':ae['AI_INTERNAL_KEY']}
report['ai_runtime_settings']={k:ae.get(k,'<default>') for k in ['OLLAMA_URL','OLLAMA_MODEL','OLLAMA_EMBED_MODEL','AI_DUPLICATE_MAX_ATTEMPTS']}
report['samples']=[]
with m.httpx.Client(timeout=12,trust_env=False) as client:
 for n in range(3):
  sample={'observed_utc':datetime.now(timezone.utc).isoformat()}
  for label,url,auth in [('health','http://127.0.0.1:8002/health',{}),('upstream','http://127.0.0.1:8002/credits/jobs/'+str(job['execution_token']),headers),('ollama_ps',ae.get('OLLAMA_URL','http://127.0.0.1:11434').rstrip('/')+'/api/ps',{})]:
   try:
    r=client.get(url,headers=auth);body=r.json();sample[label]=dict(http=r.status_code)
    if label=='upstream':
     sample[label].update({k:body.get(k) for k in ['status','error','heartbeat','cancelRequested']});sample[label]['questions_count']=len(body.get('questions',[]))
     sample[label]['questions_hash']=hashlib.sha256(json.dumps(body.get('questions',[]),sort_keys=True,ensure_ascii=False).encode()).hexdigest()
    elif label=='health':sample[label].update({k:body.get(k) for k in ['status','registryId','model','ollama_url']})
    else:sample[label]['models']=[{k:v for k,v in model.items() if k in ['name','expires_at','size_vram']} for model in body.get('models',[])]
   except Exception as e:sample[label]=dict(error=type(e).__name__)
  sample['db']=query('SELECT credit_state,accepted_count,heartbeat_at,credit_error_code FROM ai_generation_requests WHERE id=15')[0]
  report['samples'].append(sample);m.emit('job15_sample',**sample)
  if n<2:time.sleep(8)
 report['ollama_tags']=[r['name'] for r in client.get(ae.get('OLLAMA_URL','http://127.0.0.1:11434').rstrip('/')+'/api/tags').json().get('models',[])]
report['db_activity']=query("""SELECT pid,application_name,state,query_start,wait_event_type,wait_event,
 CASE WHEN query ILIKE %s THEN 'ai_job_scan' WHEN query ILIKE %s THEN 'coordination' ELSE 'other' END AS query_kind
 FROM pg_stat_activity WHERE datname=current_database() AND backend_type='client backend' AND pid<>pg_backend_pid()""",('%SELECT * FROM public.ai_generation_requests WHERE credit_state IN%','%pg_stat_activity%'))
report['finished_utc']=datetime.now(timezone.utc).isoformat()
(ROOT/'tmp/job15-readonly-report.json').write_text(json.dumps(report,indent=2,default=str),encoding='utf-8')
m.emit('job15_summary',**{k:v for k,v in report.items() if k not in ['checkpoints','samples','db_activity']})
m.emit('job15_checkpoint_summary',items=[{k:v for k,v in item.items() if k in ['cloId','bloom','content']} for row in report['checkpoints'] for item in (row['items'] or [])])
