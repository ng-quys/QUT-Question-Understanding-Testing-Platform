import importlib.util,json,sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('watch',ROOT/'tmp/watch-one-approved-ui-job.py')
w=importlib.util.module_from_spec(spec);spec.loader.exec_module(w)
m=w.m;config=m.settings(m.backend().environ(),'spring.datasource')
row=w.query(config,'SELECT id,requested_by,course_id,credit_state,execution_token,credit_payload::jsonb AS payload FROM ai_generation_requests WHERE id=8')[0]
with m.httpx.Client(timeout=120,trust_env=False) as client:
 r=client.get('http://127.0.0.1:8002/credits/jobs/'+str(row['execution_token']),headers={'X-AI-Internal-Key':m.ai_env()['AI_INTERNAL_KEY']})
 upstream=r.json();questions=upstream.get('questions',[])
 sys.path.insert(0,str(ROOT/'ai-service'))
 from clo_generation import normalize_clo
 source=row['payload']['sourceText'];selected=row['payload']['cloIds'];validation=[]
 for question in questions:
  valid=question.get('cloId') in selected and normalize_clo(json.dumps({'questions':[question]}),question.get('cloId'),source) is not None
  check=client.post('http://127.0.0.1:8002/duplicate-check',json={'courseId':row['course_id'],'content':question['content']})
  validation.append(dict(clo_bloom_structure_evidence_valid=valid,duplicate_http=check.status_code,
   suspected_duplicate=check.json().get('suspectedDuplicate'),bloom=question.get('bloom'),clo_id=question.get('cloId')))
 quota=w.query(config,"SELECT m.used,m.reserved,m.monthly_limit-m.used-m.reserved+a.extra_balance-a.extra_reserved AS remaining FROM ai_credit_months m JOIN ai_credit_accounts a ON a.user_id=m.user_id WHERE m.user_id=%s AND m.month_start=date_trunc('month',now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date",(row['requested_by'],))[0]
 report=dict(job_id=8,execution_token=str(row['execution_token']),backend_state=row['credit_state'],
  upstream_http=r.status_code,upstream_state=upstream.get('status'),upstream_questions=len(questions),
  validation=validation,quota=quota,charged_for_job=0,reservation_for_job=1,questions=questions,
  source_characters=len(source),admin_reconciliation_performed=False,new_jobs_created_by_observer=0)
 (ROOT/'tmp/approved-ai-job8-evidence.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
 m.emit('job8_evidence',**{k:v for k,v in report.items() if k!='questions'})
 p=m.backend();env=p.environ()
 m.emit('worker_logging_config',levels={k:v for k,v in env.items() if k.startswith('LOGGING_LEVEL_')})
