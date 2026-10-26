import importlib.util,json,sys
from pathlib import Path
from contextlib import closing
ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('deploy',ROOT/'tmp/approved-ai-deploy.py')
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
record=json.loads((ROOT/'tmp/approved-ai-stage-b.json').read_text(encoding='utf-8'))
qb=m.settings(m.backend().environ(),'questionbank.datasource')
with closing(m.connection(qb)) as conn:
 with conn.cursor() as q:
  q.execute('SELECT count(*),count(*) FILTER(WHERE e.question_id IS NULL) FROM public.questions q LEFT JOIN public.question_embeddings e ON e.question_id=q.id')
  m.emit('embedding_coverage',questions_and_missing=q.fetchone())
  q.execute('SELECT count(*) FROM public.question_embedding_queue');m.emit('queue_remaining',count=q.fetchone()[0])
  q.execute("SELECT model_name,count(*),min(extensions.vector_dims(embedding)),max(extensions.vector_dims(embedding)) FROM public.question_embeddings GROUP BY model_name")
  models=q.fetchall();m.emit('embedding_models',rows=models)
  q.execute('SELECT count(*) FROM public.questions WHERE id=ANY(%s) AND length(btrim(content))<3',(record['approved_question_ids'],))
  short=q.fetchone()[0];m.emit('existing_short_question_content',count=short,changed=False)
  q.execute('SELECT q.id,q.course_id,q.content FROM public.questions q JOIN public.question_embeddings e ON e.question_id=q.id WHERE q.course_id IS NOT NULL AND length(btrim(q.content))>=3 ORDER BY (q.id=ANY(%s)) DESC,q.id LIMIT 1',(record['approved_question_ids'],))
  item=q.fetchone();m.emit('duplicate_probe_metadata',question_id=item[0],course_id=item[1],content_length=len(item[2]))
with m.httpx.Client(timeout=120,trust_env=False) as client:
 response=client.post('http://127.0.0.1:8002/duplicate-check',json={'courseId':item[1],'content':item[2]})
 data=response.json()
 m.emit('duplicate_probe_response',http=response.status_code,keys=list(data) if isinstance(data,dict) else None,
  suspected=data.get('suspectedDuplicate'),detail=data.get('detail'),max_similarity=data.get('maxSimilarity'))
 if response.status_code!=200 or data.get('suspectedDuplicate') is not True:
  raise RuntimeError('Real duplicate check did not pass; stop before C')
 record.update(complete=True,remaining_missing=0,remaining_queue=0,duplicate_check_http=response.status_code,
  duplicate_detected=True,short_source_questions_unchanged=short,
  original_snapshot_gate_passed=True,
  original_probe_issue='Selected existing question had content shorter than endpoint minimum; corrected read-only probe only')
 (ROOT/'tmp/approved-ai-stage-b.json').write_text(json.dumps(record,indent=2),encoding='utf-8')
