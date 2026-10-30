"""Read-only recovery of factual job metadata into the local benchmark workbook."""
import argparse
import json
import sys
from pathlib import Path
import psycopg2

ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/'database/questionbank'))
sys.path.insert(0,str(ROOT/'ai-service'))
from apply_ai_rag_documents_once import connection_sources,dsn_params
from durable_telemetry import ExcelTelemetry

def main():
    parser=argparse.ArgumentParser();parser.add_argument('job_id',type=int);args=parser.parse_args()
    _,dsn=connection_sources();params=dsn_params(dsn);connection=None
    try:
        connection=psycopg2.connect(**dict(params,sslmode='require',connect_timeout=8,application_name='ExamFlow-Telemetry-ReadOnly'))
        connection.set_session(readonly=True,autocommit=False)
        with connection.cursor() as cursor:
            cursor.execute("SET LOCAL statement_timeout='10000ms'")
            cursor.execute("SELECT * FROM public.ai_generation_requests WHERE id=%s",(args.job_id,))
            row=cursor.fetchone();columns=[item.name for item in cursor.description]
        if not row:raise SystemExit('Job not found')
        data=dict(zip(columns,row));token=str(data.get('execution_token'))
        registry=json.loads((ROOT/'ai-service/.runtime/credits-registry.json').read_text(encoding='utf-8'))['jobs'].get(token)
        if not registry:raise SystemExit('No durable upstream telemetry snapshot for this token')
        requested=int(registry.get('total') or data.get('requested_question_count') or 0)
        accepted=len(registry.get('questions') or [])
        status=str(registry.get('state') or data.get('status') or 'unknown')
        ExcelTelemetry(ROOT/'ai-service/benchmarks/ai_generator_results.xlsx',retry_seconds=0).record_snapshot(
            args.job_id,token,status,requested,accepted,int(registry.get('batchSize') or 5),
            int(registry.get('resumeCount') or 0),registry.get('error'),registry.get('createdAt'),registry.get('heartbeat'))
        print(json.dumps({'jobId':args.job_id,'tokenSuffix':token[-8:],'status':status,'requested':requested,
                          'accepted':accepted,'unavailableMetrics':'N/A'},ensure_ascii=False))
    finally:
        if connection:connection.rollback();connection.close()

if __name__=='__main__':main()
