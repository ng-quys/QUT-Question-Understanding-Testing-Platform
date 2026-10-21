import importlib.util,json
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('watch',ROOT/'tmp/watch-one-approved-ui-job.py')
w=importlib.util.module_from_spec(spec);spec.loader.exec_module(w)
m=w.m;config=m.settings(m.backend().environ(),'spring.datasource')
rows=w.query(config,"""SELECT id,requested_by,course_id,credit_state,execution_token,accepted_count,
 charged_monthly,charged_extra,reserved_monthly,reserved_extra,credit_error_code,credit_created_at,
 dispatched_at,heartbeat_at,lease_expires_at,credit_payload::jsonb->'instruction' AS instruction,
 credit_payload::jsonb->'units' AS units,credit_payload::jsonb->'questionCount' AS count,
 credit_payload::jsonb->'cloIds' AS clo_ids,
 jsonb_array_length(credit_payload::jsonb->'selectedClos') AS selected_clos
 FROM ai_generation_requests WHERE id=8""")
for row in rows:m.emit('job8_readonly',**row)
row=rows[0]
ledger=w.query(config,'SELECT event_type,monthly_used_delta,monthly_reserved_delta,extra_balance_delta,extra_reserved_delta FROM ai_credit_transactions WHERE job_id=8 ORDER BY id')
m.emit('job8_ledger',events=ledger)
with m.httpx.Client(timeout=10,trust_env=False) as client:
 r=client.get('http://127.0.0.1:8002/credits/jobs/'+str(row['execution_token']),headers={'X-AI-Internal-Key':m.ai_env()['AI_INTERNAL_KEY']})
 m.emit('job8_upstream',http=r.status_code,state=r.json().get('status'),questions=len(r.json().get('questions',[])))
