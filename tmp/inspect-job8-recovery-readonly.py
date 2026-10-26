"""SELECT + authenticated GET only. No reconciliation, generation or DB writes."""
import importlib.util,json,hashlib,re,sys
from pathlib import Path
from datetime import datetime,timezone
from contextlib import closing
ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('watch',ROOT/'tmp/watch-one-approved-ui-job.py')
w=importlib.util.module_from_spec(spec);spec.loader.exec_module(w)
m=w.m;env=m.backend().environ();config=m.settings(env,'spring.datasource')
row=w.query(config,"""SELECT id,requested_by,course_id,credit_state,execution_token,
 accepted_count,charged_monthly,charged_extra,reserved_monthly,reserved_extra,
 credit_created_at,dispatched_at,heartbeat_at,lease_expires_at,credit_completed_at,
 credit_result::jsonb AS saved_result,credit_payload::jsonb AS payload
 FROM ai_generation_requests WHERE id=8""")[0]
report={k:v for k,v in row.items() if k not in ('payload','saved_result')}
report['saved_result_count']=len(row['saved_result'] or [])
report['ledger']=w.query(config,'SELECT event_type,monthly_used_delta,monthly_reserved_delta,extra_balance_delta,extra_reserved_delta FROM ai_credit_transactions WHERE job_id=8 ORDER BY id')
report['active_jobs']=w.query(config,"SELECT id,credit_state FROM ai_generation_requests WHERE credit_state IN ('reserved','running','cancel_requested')")
report['quota']=w.query(config,"""SELECT m.used,m.reserved,m.monthly_limit,
 a.extra_balance,a.extra_reserved,
 m.monthly_limit-m.used-m.reserved+a.extra_balance-a.extra_reserved AS remaining
 FROM ai_credit_months m JOIN ai_credit_accounts a ON a.user_id=m.user_id
 WHERE m.user_id=%s AND m.month_start=date_trunc('month',now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date""",(row['requested_by'],))[0]
with m.httpx.Client(timeout=15,trust_env=False) as client:
 response=client.get('http://127.0.0.1:8002/credits/jobs/'+str(row['execution_token']),headers={'X-AI-Internal-Key':m.ai_env()['AI_INTERNAL_KEY']})
 report['upstream_http']=response.status_code
 response.raise_for_status();upstream=response.json();questions=upstream.get('questions',[])
 report['upstream_state']=upstream.get('status');report['upstream_count']=len(questions)
 report['upstream_heartbeat_utc']=datetime.fromtimestamp(upstream['heartbeat'],timezone.utc).isoformat()
 report['internal_keys_match']=m.ai_env()['AI_INTERNAL_KEY']==env['AI_INTERNAL_KEY']
old=json.loads((ROOT/'tmp/approved-ai-job8-evidence.json').read_text(encoding='utf-8'))
digest=lambda value:hashlib.sha256(json.dumps(value,sort_keys=True,ensure_ascii=False,separators=(',',':')).encode()).hexdigest()
report['same_result_as_previous_inspection']=digest(questions)==digest(old['questions'])
report['result_sha256']=digest(questions)
sys.path.insert(0,str(ROOT/'ai-service'))
from clo_generation import normalize_clo
report['validation']=[]
for question in questions:
 report['validation'].append(dict(clo_id=question.get('cloId'),bloom=question.get('bloom'),
  selected_clo=question.get('cloId') in row['payload']['cloIds'],
  ai_normalizer_valid=normalize_clo(json.dumps({'questions':[question]}),question.get('cloId'),row['payload']['sourceText']) is not None,
  exact_evidence_in_source=' '.join(question.get('evidenceQuote','').split()) in ' '.join(row['payload']['sourceText'].split())))
with closing(m.connection(m.settings(env,'questionbank.datasource'))) as conn:
 with conn.cursor() as q:
  matches=[]
  for question in questions:
   q.execute("SELECT id,course_id FROM public.questions WHERE lower(regexp_replace(btrim(content),'\\s+',' ','g'))=lower(regexp_replace(btrim(%s),'\\s+',' ','g'))",(question['content'],))
   matches.extend([dict(zip([d[0] for d in q.description],r)) for r in q.fetchall()])
  report['question_bank_normalized_content_matches']=matches
  q.execute('SELECT count(*) FROM public.questions');report['question_bank_count']=q.fetchone()[0]
report['inspected_utc']=datetime.now(timezone.utc).isoformat()
(ROOT/'tmp/job8-recovery-readonly.json').write_text(json.dumps(report,indent=2,default=str),encoding='utf-8')
m.emit('job8_recovery_readonly',**report)
