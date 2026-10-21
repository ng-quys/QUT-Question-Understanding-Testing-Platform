"""Observe one user-operated UI job. Never POST start/cancel/reconcile or write SQL."""
import importlib.util,json,sys,time,datetime,hashlib
from pathlib import Path
from contextlib import closing
ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('deploy',ROOT/'tmp/approved-ai-deploy.py')
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
outpath=ROOT/'tmp/approved-ai-stage-c.json'
anchor=datetime.datetime.fromtimestamp((ROOT/'tmp/approved-ai-stage-a.json').stat().st_mtime,datetime.timezone.utc)

def query(config,sql,args=()):
 with closing(m.connection(config,transaction=True)) as conn:
  with conn.cursor() as q:
   q.execute(sql,args)
   return [dict(zip([d[0] for d in q.description],r)) for r in q.fetchall()]

def main():
 if not json.loads((ROOT/'tmp/approved-ai-stage-b.json').read_text())['complete']:
  raise RuntimeError('B has not passed')
 env=m.backend().environ();config=m.settings(env,'spring.datasource')
 actor=query(config,'SELECT id,username,role,status FROM users WHERE username=%s',('8000000004',))[0]
 if actor['role'] not in ('teacher','faculty') or actor['status']!='active':raise RuntimeError('Lecturer not valid')
 unresolved=query(config,"SELECT id FROM ai_generation_requests WHERE requested_by=%s AND credit_state IN ('reserved','running','cancel_requested','unknown') AND credit_created_at<%s",(actor['id'],anchor))
 if unresolved:raise RuntimeError('Existing unresolved lecturer job')
 m.emit('watch_ready',username=actor['username'],source='user-operated real ExamFlow UI',new_jobs_created_by_observer=0)
 started=time.monotonic();last=None;last_print=0;job_id=None
 with m.httpx.Client(timeout=120,trust_env=False) as client:
  while time.monotonic()-started<1800:
   rows=query(config,"""SELECT id,course_id,credit_state,requested_question_count,accepted_count,
      reserved_monthly,reserved_extra,charged_monthly,charged_extra,execution_token,
      credit_created_at,heartbeat_at,credit_error_code,credit_payload::jsonb AS payload,credit_result::jsonb AS questions
      FROM ai_generation_requests WHERE requested_by=%s AND credit_created_at>=%s ORDER BY id""",(actor['id'],anchor))
   if len(rows)>1:raise RuntimeError('More than one new job: stop without creating or changing anything')
   if not rows:
    if time.monotonic()-last_print>30:m.emit('waiting_for_user_ui',job_created=False);last_print=time.monotonic()
    time.sleep(3);continue
   row=rows[0];job_id=row['id'];payload=row['payload'];state=row['credit_state']
   if row['requested_question_count']!=1 or payload.get('questionCount')!=1:
    raise RuntimeError('The UI request is not exactly one question; no additional job allowed')
   if (job_id,state,row['accepted_count'])!=last or time.monotonic()-last_print>30:
    m.emit('job_observed',job_id=job_id,state=state,accepted=row['accepted_count'],charged=row['charged_monthly']+row['charged_extra'],heartbeat=row['heartbeat_at'])
    last=(job_id,state,row['accepted_count']);last_print=time.monotonic()
   if state=='unknown':
    outpath.write_text(json.dumps(dict(job_id=job_id,state=state,accepted=row['accepted_count'],charged=row['charged_monthly']+row['charged_extra'],error=row['credit_error_code'],observer_writes=0),indent=2),encoding='utf-8')
    raise RuntimeError('Job unknown: retain current mechanism, no replacement/reconcile performed')
   if state not in ('succeeded','partial','failed','cancelled'):
    time.sleep(3);continue
   questions=row['questions'] or []
   source=payload.get('sourceText','');clo_ids=payload.get('cloIds',[])
   sys.path.insert(0,str(ROOT/'ai-service'))
   from clo_generation import normalize_clo
   checks=[]
   for question in questions:
    valid=question.get('cloId') in clo_ids and normalize_clo(json.dumps({'questions':[question]}),question.get('cloId'),source) is not None
    response=client.post('http://127.0.0.1:8002/duplicate-check',json={'courseId':row['course_id'],'content':question['content']})
    data=response.json()
    checks.append(dict(structure_clo_bloom_evidence_valid=valid,duplicate_check_http=response.status_code,
      suspected_duplicate=data.get('suspectedDuplicate'),threshold=data.get('threshold'),
      max_bank_similarity=max((r['similarity'] for r in data.get('bankMatches',[])),default=0)))
   ledger=query(config,"SELECT event_type,monthly_used_delta,monthly_reserved_delta,extra_balance_delta,extra_reserved_delta FROM ai_credit_transactions WHERE job_id=%s ORDER BY id",(job_id,))
   quota=query(config,"""SELECT monthly_limit,used,reserved,extra_balance,extra_reserved,
     monthly_limit-used-reserved+extra_balance-extra_reserved AS remaining
     FROM ai_credit_months m JOIN ai_credit_accounts a ON a.user_id=m.user_id
     WHERE m.user_id=%s AND m.month_start=date_trunc('month',now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date""",(actor['id'],))[0]
   expected_final='settle' if row['accepted_count']==1 else 'release'
   ledger_ok=[t['event_type'] for t in ledger]==['reserve',expected_final]
   charged=row['charged_monthly']+row['charged_extra']
   report=dict(job_id=job_id,execution_token=str(row['execution_token']),username=actor['username'],
    state=state,requested=1,accepted=row['accepted_count'],charged=charged,
    course_id=row['course_id'],clo_ids=clo_ids,source_characters=len(source),
    source_sha256=hashlib.sha256(source.encode()).hexdigest(),questions=questions,validation=checks,
    ledger=ledger,ledger_single_reservation_and_finalization=ledger_ok,quota=quota,
    error=row['credit_error_code'],observer_created_jobs=0,observer_sql_writes=0)
   outpath.write_text(json.dumps(report,ensure_ascii=False,indent=2,default=str),encoding='utf-8')
   m.emit('one_ui_job_result',**{k:v for k,v in report.items() if k not in ('source_sha256','questions')})
   if not ledger_ok or charged!=row['accepted_count'] or quota['reserved']!=0:
    raise RuntimeError('Ledger/reservation verification did not pass')
   return
  raise RuntimeError('Waiting deadline reached; no jobs were created by observer')

if __name__=='__main__':
 try:main()
 except Exception as e:
  m.emit('observer_stopped',exception=type(e).__name__,pool_limit='max clients reached' in str(e))
  sys.exit(1)
