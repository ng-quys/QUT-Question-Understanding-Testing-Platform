"""Approved missing-only backfill: fixed 32 IDs, sequential <=5 batches, stop on error."""
import importlib.util,json,os,subprocess,sys
from pathlib import Path
from contextlib import closing
ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('deploy',ROOT/'tmp/approved-ai-deploy.py')
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
from dotenv import dotenv_values
from psycopg2.extensions import make_dsn,parse_dsn
report_path=ROOT/'tmp/approved-ai-stage-b.json'

def inspect(config,approved=None):
 with closing(m.connection(config)) as conn:
  with conn.cursor() as q:
   q.execute('SELECT q.id FROM public.questions q LEFT JOIN public.question_embeddings e ON e.question_id=q.id WHERE e.question_id IS NULL ORDER BY q.id')
   missing=[r[0] for r in q.fetchall()]
   q.execute("SELECT md5(coalesce(string_agg(to_jsonb(q)::text,'|' ORDER BY q.id),'')) FROM public.questions q")
   questions_hash=q.fetchone()[0]
   q.execute("SELECT md5(coalesce(string_agg(to_jsonb(e)::text,'|' ORDER BY e.question_id),'')) FROM public.question_embeddings e WHERE NOT(e.question_id=ANY(%s::bigint[]))",(approved or missing,))
   preserved_hash=q.fetchone()[0]
   q.execute('SELECT question_id FROM public.question_embedding_queue WHERE next_retry_at<=now() ORDER BY question_id')
   queue=[r[0] for r in q.fetchall()]
   q.execute("SELECT count(*) FROM public.questions q JOIN public.question_embedding_queue j ON j.question_id=q.id WHERE btrim(coalesce(q.content,''))=''")
   blank=q.fetchone()[0]
 return dict(missing=missing,questions_hash=questions_hash,preserved_hash=preserved_hash,queue=queue,blank=blank)

def main():
 a=json.loads((ROOT/'tmp/approved-ai-stage-a.json').read_text(encoding='utf-8'))
 be=m.backend();env=be.environ()
 if a.get('pid')!=be.pid or a.get('login_http')!=200 or not a.get('session_connections_verified'):
  raise RuntimeError('Stage A has not passed for the current Backend')
 qb=m.settings(env,'questionbank.datasource')
 reader=dotenv_values(ROOT/'ai-service/.env').get('EXAMFLOW_QUESTIONBANK_DSN','')
 parsed=parse_dsn(reader)
 if any(str(parsed.get(k,'5432' if k=='port' else ''))!=str(qb.get(k,'5432' if k=='port' else '')) for k in ('host','port','dbname','user')):
  raise RuntimeError('Reader/writer Question Bank identity mismatch')
 before=inspect(qb)
 ids=before['missing']
 if len(ids)!=32 or set(ids)!=set(before['queue']) or before['blank']:
  raise RuntimeError('Approved 32 missing-only scope no longer matches')
 if report_path.exists():raise RuntimeError('Existing deployment report: inspect before any replay')
 report=dict(approved_question_ids=ids,before_missing=32,created=0,updated=0,skipped=0,errors=0,batches=[],complete=False)
 report_path.write_text(json.dumps(report,indent=2),encoding='utf-8')
 writer=make_dsn(**qb,options='-c statement_timeout=10000 -c lock_timeout=2000',application_name='ExamFlow-EmbeddingSync-approved')
 child_env=env.copy()
 child_env.update(EXAMFLOW_QUESTIONBANK_DSN=reader,EXAMFLOW_EMBEDDING_SYNC_DSN=writer,
                  OLLAMA_EMBED_MODEL='nomic-embed-text',PYTHONIOENCODING='utf-8')
 m.emit('embedding_scope_verified',missing=32,batch_max=5,same_questionbank=True,existing_embeddings_preserved=True)
 for number in range(1,8):
  current=inspect(qb,ids)
  remaining=[i for i in current['missing'] if i in ids]
  if not remaining:break
  if current['questions_hash']!=before['questions_hash'] or current['preserved_hash']!=before['preserved_hash']:
   raise RuntimeError('Existing question/embedding snapshot changed; stop')
  command=[str(ROOT/'ai-service/.venv/Scripts/python.exe'),str(ROOT/'ai-service/tools/sync_question_embeddings.py'),
   '--apply','--once','--batch-size',str(min(5,len(remaining))),'--missing-only','--question-ids',*[str(i) for i in ids]]
  result=subprocess.run(command,env=child_env,cwd=ROOT,stdin=subprocess.DEVNULL,capture_output=True,text=True,encoding='utf-8',timeout=900,
   creationflags=subprocess.CREATE_NO_WINDOW)
  lines=[line for line in result.stdout.splitlines() if line.startswith('{')]
  counts=json.loads(lines[-1]) if lines else dict(created=0,updated=0,skipped=0,errors=1)
  for key in ('created','updated','skipped','errors'):report[key]+=counts[key]
  batch=dict(number=number,exit_code=result.returncode,**counts)
  report['batches'].append(batch);report_path.write_text(json.dumps(report,indent=2),encoding='utf-8')
  m.emit('embedding_batch',**batch)
  if result.returncode or counts['errors'] or counts['updated']:
   raise RuntimeError('Batch error: queue retained, no automatic retry')
 after=inspect(qb,ids)
 report['remaining_missing']=len(after['missing'])
 report['remaining_queue']=len(after['queue'])
 report['questions_unchanged']=after['questions_hash']==before['questions_hash']
 report['old_embeddings_unchanged']=after['preserved_hash']==before['preserved_hash']
 if report['remaining_missing'] or report['remaining_queue'] or not report['questions_unchanged'] or not report['old_embeddings_unchanged']:
  report_path.write_text(json.dumps(report,indent=2),encoding='utf-8')
  raise RuntimeError('Post-backfill verification failed; do not proceed to C')
 with closing(m.connection(qb)) as conn:
  with conn.cursor() as q:
   q.execute('SELECT q.id,q.course_id,q.content FROM public.questions q JOIN public.question_embeddings e ON e.question_id=q.id WHERE q.id=%s',(ids[0],))
   item=q.fetchone()
 with m.httpx.Client(timeout=120,trust_env=False) as client:
  response=client.post('http://127.0.0.1:8002/duplicate-check',json={'courseId':item[1],'content':item[2]})
  report['duplicate_check_http']=response.status_code
  report['duplicate_detected']=response.status_code==200 and response.json().get('suspectedDuplicate') is True
 if not report['duplicate_detected']:raise RuntimeError('Real duplicate check did not pass')
 report['complete']=True;report_path.write_text(json.dumps(report,indent=2),encoding='utf-8')
 m.emit('embedding_complete',**{k:v for k,v in report.items() if k not in ('approved_question_ids','batches')})

if __name__=='__main__':
 try:main()
 except Exception as e:
  m.emit('stopped_before_next_stage',exception=type(e).__name__,pool_limit='max clients reached' in str(e))
  sys.exit(1)
