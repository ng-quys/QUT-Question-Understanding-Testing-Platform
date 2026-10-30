"""One read-only snapshot for the explicitly authorized direct PDF test.

No upload, indexing call, retry, job creation, data/schema write or secret output.
"""
import datetime
import json
import sys
import urllib.request
from pathlib import Path
import psycopg2

ROOT=Path(__file__).resolve().parents[1]
PRIVATE=ROOT/'.env.saved-documents-controlled-test'
sys.path.insert(0,str(ROOT/'database/questionbank'))
from apply_ai_rag_documents_once import connection_sources, dsn_params


def snapshot():
    runtime=json.loads((PRIVATE/'runtime.json').read_text(encoding='utf-8'))
    reader,main=connection_sources()
    result={'time_utc':datetime.datetime.now(datetime.timezone.utc).isoformat()}
    for label,dsn in [('questionbank',reader),('main',main)]:
        conn=None
        try:
            params=dsn_params(dsn)
            conn=psycopg2.connect(**dict(params,sslmode='require',connect_timeout=8,
                application_name='ExamFlow-ControlledPDF-ReadOnly'))
            conn.set_session(readonly=True,autocommit=False)
            with conn.cursor() as cur:
                cur.execute("SET LOCAL statement_timeout='10000ms'")
                if label=='questionbank':
                    cur.execute("""SELECT d.id::text,d.status,d.deleted_at IS NOT NULL,
                        i.id::text,i.status,i.chunk_count,
                        (SELECT count(*) FROM public.ai_document_chunks c WHERE c.index_id=i.id),
                        i.ready_at IS NOT NULL,i.error_code
                        FROM public.ai_source_documents d LEFT JOIN public.ai_document_indexes i
                        ON i.document_id=d.id AND i.document_revision=d.revision
                        ORDER BY d.created_at,i.created_at""")
                    names=['documentId','documentStatus','deleted','indexId','indexStatus',
                           'expectedChunks','actualChunks','readyAtSet','errorCode']
                    result['documents']=[dict(zip(names,row)) for row in cur.fetchall()]
                    cur.execute("SELECT count(*) FROM public.ai_document_chunks WHERE embedding IS NULL OR extensions.vector_dims(embedding)<>768")
                    result['invalidVectors']=cur.fetchone()[0]
                else:
                    cur.execute("SELECT credit_state,count(*) FROM public.ai_generation_requests GROUP BY credit_state ORDER BY credit_state")
                    result['jobStateCounts']=dict(cur.fetchall())
                    credit={}
                    for table in ['ai_credit_accounts','ai_credit_months','ai_credit_transactions']:
                        cur.execute('SELECT count(*),md5(coalesce(string_agg(row_to_json(t)::text,\'\' ORDER BY row_to_json(t)::text),\'\')) FROM public.'+table+' t')
                        count,digest=cur.fetchone();credit[table]={'rows':count,'fingerprint':digest}
                    result['creditFingerprints']=credit
        except Exception as exc:
            result[label+'Error']=type(exc).__name__
        finally:
            if conn:conn.rollback();conn.close()
    try:
        request=urllib.request.Request('http://127.0.0.1:8002/documents/metrics',
            headers={'X-AI-Internal-Key':runtime['AI_INTERNAL_KEY']})
        with urllib.request.urlopen(request,timeout=5) as response:result['documentMetrics']=json.load(response)
    except Exception as exc:result['metricsError']=type(exc).__name__
    baseline=PRIVATE/'monitor-baseline.json'
    if baseline.exists():
        before=json.loads(baseline.read_text(encoding='utf-8'))
        result['creditsUnchangedSinceMonitorBaseline']=result.get('creditFingerprints')==before.get('creditFingerprints')
        result['jobCountsUnchangedSinceMonitorBaseline']=result.get('jobStateCounts')==before.get('jobStateCounts')
    else:baseline.write_text(json.dumps(result,indent=2),encoding='utf-8')
    (PRIVATE/'monitor-latest.json').write_text(json.dumps(result,indent=2),encoding='utf-8')
    # IDs/content/credentials need not appear in the user-facing console.
    safe={k:v for k,v in result.items() if k not in ['creditFingerprints','documents']}
    safe['documents']=[{k:v for k,v in row.items() if k not in ['documentId','indexId']} for row in result.get('documents',[])]
    print(json.dumps(safe,ensure_ascii=False))


if __name__=='__main__':snapshot()
