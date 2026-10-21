"""Observe user-operated Admin reconciliation of job 8; SELECT only."""
import importlib.util,json,time,hashlib
from pathlib import Path
from datetime import datetime,timezone
from contextlib import closing
ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('watch',ROOT/'tmp/watch-one-approved-ui-job.py')
w=importlib.util.module_from_spec(spec);spec.loader.exec_module(w)
m=w.m;config=m.settings(m.backend().environ(),'spring.datasource')
expected=json.loads((ROOT/'tmp/approved-ai-job8-evidence.json').read_text(encoding='utf-8'))
# Jackson omits null fields such as chapterId; compare their semantic values.
digest=lambda v:hashlib.sha256(json.dumps([{k:x for k,x in item.items() if x is not None} for item in (v or [])],sort_keys=True,ensure_ascii=False,separators=(',',':')).encode()).hexdigest()
started=time.monotonic();last=None
with closing(m.connection(config,transaction=True)) as conn:
 with conn.cursor() as q:
  def read(sql,args=()):
   q.execute(sql,args)
   return [dict(zip([d[0] for d in q.description],r)) for r in q.fetchall()]
  while time.monotonic()-started<300:
   row=read("""SELECT j.id,j.requested_by,j.credit_state,j.execution_token,j.accepted_count,
    j.charged_monthly,j.charged_extra,j.reserved_monthly,j.reserved_extra,
    j.credit_completed_at,j.credit_result::jsonb AS result,u.username,u.full_name,u.email
    FROM ai_generation_requests j JOIN users u ON u.id=j.requested_by WHERE j.id=8""")[0]
   if str(row['execution_token'])!=expected['execution_token']:raise RuntimeError('Execution token changed; stop')
   state=row['credit_state']
   if state!=last:
    m.emit('job8_observed',state=state,accepted=row['accepted_count'],charged=row['charged_monthly']+row['charged_extra'],teacher=row['username'],full_name=row['full_name'],email=row['email']);last=state
   if state=='unknown':time.sleep(5);continue
   events=read('SELECT id,event_type,actor_id,monthly_used_delta,monthly_reserved_delta,extra_balance_delta,extra_reserved_delta,reason,created_at FROM ai_credit_transactions WHERE job_id=8 ORDER BY id')
   quota=read("""SELECT m.used,m.reserved,m.monthly_limit,a.extra_balance,a.extra_reserved,
    m.monthly_limit-m.used-m.reserved+a.extra_balance-a.extra_reserved AS remaining
    FROM ai_credit_months m JOIN ai_credit_accounts a ON a.user_id=m.user_id
    WHERE m.user_id=%s AND m.month_start=date_trunc('month',now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date""",(row['requested_by'],))[0]
   settles=[e for e in events if e['event_type']=='settle'];releases=[e for e in events if e['event_type']=='release']
   ok=(state=='succeeded' and row['accepted_count']==1 and row['charged_monthly']==1 and row['charged_extra']==0
    and len(settles)==1 and len(releases)==0 and settles[0]['monthly_used_delta']==1 and settles[0]['monthly_reserved_delta']==-1
    and settles[0]['extra_balance_delta']==0 and settles[0]['extra_reserved_delta']==0
    and len([e for e in events if e['event_type']=='reserve'])==1 and len(row['result'] or [])==1
    and digest(row['result'])==digest(expected['questions']))
   report=dict(verified=ok,job={k:v for k,v in row.items() if k!='result'},result_count=len(row['result'] or []),
    result_unchanged=digest(row['result'])==digest(expected['questions']),ledger=events,quota=quota,
    observer_writes=0,inspected_utc=datetime.now(timezone.utc).isoformat())
   (ROOT/'tmp/job8-reconciliation-verified.json').write_text(json.dumps(report,ensure_ascii=False,indent=2,default=str),encoding='utf-8')
   m.emit('job8_reconciliation_verified',**report)
   if not ok:raise RuntimeError('Unexpected final outcome; no further actions performed')
   break
  else:m.emit('job8_still_waiting',state=last,observer_writes=0)
