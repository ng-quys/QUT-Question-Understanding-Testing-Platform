"""Observe one user-created lecturer job after primary readiness. SELECT/GET only."""
import importlib.util,json,time
from pathlib import Path
from datetime import datetime,timezone
ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('watch',ROOT/'tmp/watch-one-approved-ui-job.py')
w=importlib.util.module_from_spec(spec);spec.loader.exec_module(w);m=w.m
env=m.backend().environ();config=m.settings(env,'spring.datasource')
if any(env.get(k)!='true' for k in ('AI_CREDITS_WORKER_ENABLED','AI_CREDITS_WORKER_CLUSTER_READY')):raise RuntimeError('Primary not enabled')
proof=json.loads((ROOT/'tmp/primary-worker-activation.json').read_text(encoding='utf-8'))
if not proof.get('cluster_ready') or proof.get('legacy_poller_observed'):raise RuntimeError('Primary not verified')
actor=w.query(config,"SELECT id,username FROM users WHERE username='8000000004' AND role='teacher' AND status='active'")[0]
existing=w.query(config,"SELECT id FROM ai_generation_requests WHERE requested_by=%s AND credit_state IN ('reserved','running','cancel_requested','unknown')",(actor['id'],))
if existing:raise RuntimeError('Lecturer has unresolved job; no new test')
baseline=w.query(config,'SELECT coalesce(max(id),0) AS id FROM ai_generation_requests')[0]['id']
record=dict(baseline_id=baseline,username=actor['username'],armed_utc=datetime.now(timezone.utc).isoformat(),observer_writes=0)
(ROOT/'tmp/primary-ui-test-baseline.json').write_text(json.dumps(record,indent=2,default=str),encoding='utf-8')
m.emit('primary_ui_watch_armed',**record)
start=time.monotonic();last=None;last_upstream=0;remote=None;transport_log=[]
with m.httpx.Client(timeout=10,trust_env=False) as client:
 while time.monotonic()-start<600:
  rows=w.query(config,"""SELECT id,requested_by,course_id,credit_state,execution_token,requested_question_count,
   accepted_count,charged_monthly,charged_extra,credit_error_code,credit_payload::jsonb AS payload,
   credit_result::jsonb AS result FROM ai_generation_requests WHERE requested_by=%s AND id>%s ORDER BY id""",(actor['id'],baseline))
  if len(rows)>1:raise RuntimeError('More than one job observed; stop without mutation')
  if not rows:time.sleep(4);continue
  row=rows[0];jid=row['id'];state=row['credit_state']
  if row['requested_question_count']!=1:raise RuntimeError('Test is limited to one question; no intervention performed')
  if state!=last:
   m.emit('primary_ui_job_status',id=jid,state=state,accepted=row['accepted_count'],charged=row['charged_monthly']+row['charged_extra']);last=state
  registry=row['payload'].get('_executionRegistry')
  if registry and (time.monotonic()-last_upstream>=10 or state in ('succeeded','partial','failed','cancelled','unknown')):
   response=client.get('http://127.0.0.1:8002/credits/jobs/'+str(row['execution_token']),headers={'X-AI-Internal-Key':m.ai_env()['AI_INTERNAL_KEY'],'X-AI-Registry-Id':registry})
   data=response.json();remote=dict(http=response.status_code,state=data.get('status'),questions=len(data.get('questions',[])))
   last_upstream=time.monotonic()
  for log in [Path(proof['backend_log']),ROOT/'.env.examflow.runtime/logs/AI-coordinated-20261022-013949.log']:
   if log.exists():
    for line in log.read_text(encoding='utf-8',errors='replace').splitlines():
     if str(row['execution_token']) in line or ('job='+str(jid)+' ') in line:
      if line not in transport_log:transport_log.append(line)
  if state in ('succeeded','partial','failed','cancelled','unknown'):
   ledger=w.query(config,'SELECT id,event_type,monthly_used_delta,monthly_reserved_delta,extra_balance_delta,extra_reserved_delta FROM ai_credit_transactions WHERE job_id=%s ORDER BY id',(jid,))
   quota=w.query(config,"""SELECT m.used,m.reserved,m.monthly_limit-m.used-m.reserved+a.extra_balance-a.extra_reserved AS remaining
    FROM ai_credit_months m JOIN ai_credit_accounts a ON a.user_id=m.user_id WHERE m.user_id=%s
    AND m.month_start=date_trunc('month',now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date""",(actor['id'],))[0]
   questions=row['result'] or [];selected=row['payload'].get('cloIds',[]);source=row['payload'].get('sourceText','')
   valid=bool(questions) and all(q.get('cloId') in selected and q.get('bloom') in ('remember','understand','apply')
    and bool(q.get('content','').strip()) and bool(q.get('explanation','').strip())
    and 0<=q.get('correctIndex',-1)<=3 and len(q.get('options',[]))==4
    and len(q.get('evidenceQuote','').strip())>=20
    and ' '.join(q.get('evidenceQuote','').split()) in ' '.join(source.split()) for q in questions)
   success=(state=='succeeded' and row['accepted_count']==1 and row['charged_monthly']+row['charged_extra']==1
    and len(questions)==1 and valid and len([e for e in ledger if e['event_type']=='reserve'])==1
    and len([e for e in ledger if e['event_type']=='settle'])==1 and not any(e['event_type']=='release' for e in ledger)
    and quota['reserved']==0)
   record.update(job_id=jid,state=state,accepted=row['accepted_count'],charged=row['charged_monthly']+row['charged_extra'],
    execution_token=str(row['execution_token']),registry=registry,upstream=remote,questions=questions,
    selected_clos=selected,source_characters=len(source),machine_validation=valid,ledger=ledger,quota=quota,
    transport_logs=transport_log,success=success,finished_utc=datetime.now(timezone.utc).isoformat())
   (ROOT/'tmp/primary-ui-test-result.json').write_text(json.dumps(record,ensure_ascii=False,indent=2,default=str),encoding='utf-8')
   m.emit('primary_ui_test_finished',**{k:v for k,v in record.items() if k not in ('questions','transport_logs')})
   break
  time.sleep(4)
 else:m.emit('primary_ui_watch_waiting_for_user',baseline_id=baseline,observer_writes=0)
