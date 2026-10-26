"""Post-deployment verification: SELECT/GET only, no restart or job creation."""
import importlib.util,json,time,uuid
from pathlib import Path
from datetime import datetime,timezone
from contextlib import closing
ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('watch',ROOT/'tmp/watch-one-approved-ui-job.py')
w=importlib.util.module_from_spec(spec);spec.loader.exec_module(w);m=w.m
be=m.backend();env=be.environ();config=m.settings(env,'spring.datasource')
report=dict(backend_pid=be.pid,worker_enabled=env.get('AI_CREDITS_WORKER_ENABLED')=='true',cluster_ready=env.get('AI_CREDITS_WORKER_CLUSTER_READY')=='true')
with m.httpx.Client(timeout=10,trust_env=False) as client:
 report['backend_health_http']=client.get('http://127.0.0.1:8080/api/health').status_code
 response=client.get('http://127.0.0.1:8002/health');report['ai_health_http']=response.status_code
 report['registry_id']=str(uuid.UUID(response.json()['registryId']))
 ae=m.ai_env();report['internal_key_http']=client.get('http://127.0.0.1:8080/api/internal/ai-credits/verify-key',headers={'X-AI-Internal-Key':ae['AI_INTERNAL_KEY']}).status_code
 report['ai_pid']=next(c.pid for c in m.psutil.net_connections(kind='tcp') if c.status=='LISTEN' and c.laddr.port==8002)
 response=client.get('http://127.0.0.1:11434/api/tags');report['ollama_http']=response.status_code
 report['ollama_models']=[item['name'] for item in response.json()['models']]
report['job8']=w.query(config,"SELECT id,credit_state,accepted_count,charged_monthly,charged_extra,jsonb_array_length(credit_result) AS result_count FROM ai_generation_requests WHERE id=8")[0]
report['job8_ledger']=w.query(config,'SELECT id,event_type,monthly_used_delta,monthly_reserved_delta,actor_id FROM ai_credit_transactions WHERE job_id=8 ORDER BY id')
report['active_jobs']=w.query(config,"SELECT id,credit_state FROM ai_generation_requests WHERE credit_state IN ('reserved','running','cancel_requested')")
report['quota']=w.query(config,"""SELECT m.used,m.reserved,m.monthly_limit-m.used-m.reserved+a.extra_balance-a.extra_reserved AS remaining
 FROM ai_credit_months m JOIN ai_credit_accounts a ON a.user_id=m.user_id JOIN users u ON u.id=m.user_id
 WHERE u.username='8000000004' AND m.month_start=date_trunc('month',now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date""")[0]
samples=[]
for i in range(6):
 samples.append(w.query(config,"""SELECT pid,application_name,query_start FROM pg_stat_activity
 WHERE datname=current_database() AND pid<>pg_backend_pid()
 AND application_name NOT LIKE %s AND query ILIKE %s AND query ILIKE %s""",
 ('ExamFlow-Main/ai-worker-v1%','SELECT * FROM public.ai_generation_requests WHERE credit_state IN%','%ORDER BY id LIMIT 100%')));time.sleep(1)
report['legacy_poller_samples']=samples;report['legacy_poller_observed']=any(samples)
with closing(m.connection(m.settings(env,'questionbank.datasource'))) as conn:
 with conn.cursor() as q:
  q.execute('SELECT count(*),count(*) FILTER(WHERE e.question_id IS NULL) FROM public.questions q LEFT JOIN public.question_embeddings e ON e.question_id=q.id')
  total,missing=q.fetchone();report['question_bank']=dict(questions=total,missing_embeddings=missing)
report['services_healthy']=(report['backend_health_http']==200 and report['ai_health_http']==200 and report['ollama_http']==200 and report['internal_key_http']==204)
report['job8_verified']=(report['job8']['credit_state']=='succeeded' and report['job8']['accepted_count']==1 and report['job8']['charged_monthly']==1 and report['job8']['charged_extra']==0 and len(report['job8_ledger'])==2 and len([e for e in report['job8_ledger'] if e['event_type']=='settle'])==1)
report['production_test_ready']=report['cluster_ready'] and report['worker_enabled'] and not report['legacy_poller_observed']
report['production_job_posts']=0;report['production_sql_mutations']=0
report['inspected_utc']=datetime.now(timezone.utc).isoformat()
(ROOT/'tmp/ai-coordination-deployment.json').write_text(json.dumps(report,indent=2,default=str),encoding='utf-8')
m.emit('coordination_deployment_verified',**{k:v for k,v in report.items() if k!='legacy_poller_samples'})
m.emit('legacy_poller_evidence',samples=samples)
if not report['services_healthy'] or not report['job8_verified']:raise SystemExit(1)
