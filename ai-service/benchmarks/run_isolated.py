"""Sequential real benchmark. No credit jobs, DB writes, migrations or restarts.

Default is preflight only. --run requires the verified existing staging container,
real model manifests, schema, and idle Production checks before every run.
"""
import argparse
import asyncio
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import time
import urllib.request
from types import SimpleNamespace

import psycopg2
from psycopg2.extensions import make_dsn

ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/'ai-service'))
sys.path.insert(0,str(ROOT/'database/questionbank'))
from apply_ai_rag_documents_once import connection_sources,dsn_params


def docker(*args):
    r=subprocess.run(['docker',*args],capture_output=True,text=True,timeout=10)
    if r.returncode:raise RuntimeError('Staging Docker unavailable')
    return r.stdout


def get_json(url):
    with urllib.request.urlopen(url,timeout=5) as response:return json.load(response)


def production_idle():
    health=get_json('http://127.0.0.1:8002/health')
    if any(health.get('queue',{}).get(k,1) for k in ['active','waiting']):
        raise RuntimeError('Production registry is active or unknown')
    _,main_dsn=connection_sources()
    conn=psycopg2.connect(**dict(dsn_params(main_dsn),sslmode='require',connect_timeout=8))
    try:
        conn.set_session(readonly=True,autocommit=False)
        with conn.cursor() as q:
            q.execute("SELECT count(*) FROM public.ai_generation_requests WHERE credit_state IN ('reserved','running','cancel_requested','unknown')")
            if q.fetchone()[0]:raise RuntimeError('Production jobs active/unknown')
    finally:conn.rollback();conn.close()


def preflight():
    ids=docker('ps','-q','--filter','label=com.docker.compose.project=examflow-saved-documents-staging',
               '--filter','label=com.docker.compose.service=questionbank').split()
    if len(ids)!=1:raise RuntimeError('Exactly one running staging Question Bank is required')
    x=json.loads(docker('inspect',ids[0]))[0]
    if x['Config']['Image']!='pgvector/pgvector:pg17' or x['HostConfig']['PortBindings']!={'5432/tcp':[{'HostIp':'127.0.0.1','HostPort':'55441'}]}:
        raise RuntimeError('Staging container identity or binding mismatch')
    if not all(m['Type']=='volume' and m['Name'].startswith('examflow-saved-documents-staging_') for m in x['Mounts']):
        raise RuntimeError('Staging volume isolation mismatch')
    env=dict(k.split('=',1) for k in x['Config']['Env'] if '=' in k)
    if env.get('POSTGRES_DB')!='examflow_rag_staging' or env.get('POSTGRES_USER')!='examflow_rag_staging':
        raise RuntimeError('Unexpected staging database identity')
    dsn=make_dsn(host='127.0.0.1',port=55441,dbname='examflow_rag_staging',
        user='examflow_rag_staging',password=env['POSTGRES_PASSWORD'],
        options='-c default_transaction_read_only=on -c search_path=public,extensions')
    conn=psycopg2.connect(dsn,connect_timeout=5)
    try:
        conn.set_session(readonly=True,autocommit=False)
        with conn.cursor() as q:
            q.execute("SELECT to_regclass('public.questions') IS NOT NULL,to_regclass('public.question_embeddings') IS NOT NULL,to_regclass('public.ai_document_chunks') IS NOT NULL,current_setting('transaction_read_only')")
            row=q.fetchone()
            if row!=(True,True,True,'on'):raise RuntimeError('Staging schema/read-only prerequisite missing')
            q.execute("SELECT format_type(atttypid,atttypmod) FROM pg_attribute WHERE attrelid='public.question_embeddings'::regclass AND attname='embedding'")
            if q.fetchone()[0]!='vector(768)':
                # search_path contains extensions, so format_type may omit its schema.
                q.execute("SELECT atttypmod FROM pg_attribute WHERE attrelid='public.question_embeddings'::regclass AND attname='embedding'")
                if q.fetchone()[0]!=768:raise RuntimeError('Expected staging vector(768)')
    finally:conn.rollback();conn.close()
    tags=get_json('http://127.0.0.1:11434/api/tags').get('models',[])
    by_name={m['name']:m for m in tags}
    if not {'qwen2.5:7b','nomic-embed-text:latest'}<=by_name.keys():
        raise RuntimeError('Required real Qwen/embedding model manifest missing')
    production_idle()
    return dsn,by_name


async def run(args,dsn,models):
    output=args.output.resolve()
    if output.exists() and any(output.iterdir()):raise RuntimeError('Use a new empty output directory')
    output.mkdir(parents=True,exist_ok=True)
    # This process never inherits either Production Question Bank DSN or registry.
    os.environ.update(PYTHON_DOTENV_DISABLED='1',EXAMFLOW_QUESTIONBANK_DSN=dsn,
        EXAMFLOW_QUESTIONBANK_WRITER_DSN='',AI_INTERNAL_KEY='isolated-benchmark-no-listener-key',
        OLLAMA_URL='http://127.0.0.1:11434',OLLAMA_MODEL='qwen2.5:7b',
        OLLAMA_EMBED_MODEL='nomic-embed-text:latest',AI_INFERENCE_BATCH_SIZE='1',
        AI_SAVED_DOCUMENTS_ENABLED='false',AI_JOB_STATE_PATH=str(output/'registry.json'),
        AI_METRICS_XLSX_PATH=str(output/'runtime-metrics.xlsx'))
    import main
    from inference_metrics import measured_generate
    from generation_telemetry import ExcelTelemetry
    source=Path(__file__).with_name('network_case.txt').read_text(encoding='utf-8')
    case_id=hashlib.sha256(source.encode()).hexdigest()[:16]+'-network-CLO1'
    options={'num_ctx':2048,'num_predict':850,'temperature':0.8,'seed':42}
    async def generate(client,prompt):
        return await measured_generate(client,main.OLLAMA_URL,main.MODEL,prompt,options)
    main.ollama_generate=generate  # Real HTTP adapter with identical fixed options in A/B.
    telemetry=ExcelTelemetry(output/'runtime-metrics.xlsx',1);telemetry.ensure()
    schedule=[('pilot-1',1,3),('pilot-3',3,3)]
    for repeat in range(1,6):
        for mode in ([1,3] if repeat%2 else [3,1]):schedule.append((f'main-{repeat}-{mode}',mode,9))
    results=[]
    for name,mode,count in schedule:
        production_idle()
        current={m['name']:m for m in get_json('http://127.0.0.1:11434/api/tags').get('models',[])}
        if any(current.get(name,{}).get('digest')!=models[name]['digest'] for name in ['qwen2.5:7b','nomic-embed-text:latest']):
            raise RuntimeError('Model manifest changed during experiment')
        request=main.GenerationRequest(courseId=900001,sourceText=source,questionCount=count,
            cloIds=[1],selectedClos=[main.SelectedClo(id=1,code='CLO1',description='Giải thích và vận dụng chức năng các giao thức, thiết bị và cơ chế bảo vệ trong mạng máy tính cơ bản.')],
            batchSize=5,inferenceBatchSize=mode)
        job=SimpleNamespace(created_at=time.time(),total=count,batch_size=5,resume_count=0,
            inference_batch_size=mode,payload={},questions=[])
        observation=telemetry.begin(name,job)
        observation.metrics.configuration.update(runId=name,caseId=case_id,acceptedAtStart=0,
            modelDigest=models['qwen2.5:7b']['digest'],startCondition='unknown',
            embeddingModel='nomic-embed-text:latest',embeddingDigest=models['nomic-embed-text:latest']['digest'])
        started=time.perf_counter();checkpoints=[];accepted=[];error=None
        interrupted=False
        async def watch_production():
            nonlocal interrupted
            while True:
                await asyncio.sleep(2)
                try:await asyncio.to_thread(production_idle)
                except Exception:interrupted=True;return
        watch=asyncio.create_task(watch_production())
        try:
            accepted=await main._generate(request,lambda qs:checkpoints.append(len(qs)),lambda:interrupted)
        except Exception as exc:error=type(exc).__name__
        finally:
            watch.cancel()
            await observation.finish('failed' if error or interrupted else 'succeeded',len(accepted),error)
        entry={'runId':name,'mode':mode,'requested':count,'accepted':len(accepted),
               'seconds':time.perf_counter()-started,'checkpoints':checkpoints,'error':error,'interrupted':interrupted}
        results.append(entry);(output/'results.json').write_text(json.dumps(results,indent=2),encoding='utf-8')
        print(json.dumps(entry),flush=True)
        if error or interrupted:raise RuntimeError('Stopped benchmark after execution error/Production activity; no replay')


def main_cli():
    parser=argparse.ArgumentParser();parser.add_argument('--run',action='store_true')
    parser.add_argument('--output',type=Path,default=ROOT/'outputs/inference-benchmark-real')
    args=parser.parse_args()
    try:
        dsn,models=preflight();print('Isolated read-only staging and idle Production preflight passed',flush=True)
        if args.run:asyncio.run(run(args,dsn,models))
    except Exception as exc:
        # Credentials cannot appear in failures; keep raw connection exceptions private.
        print('Benchmark not started/stopped: '+(str(exc) if isinstance(exc,RuntimeError) else type(exc).__name__),flush=True)
        raise SystemExit(1)


if __name__=='__main__':main_cli()
