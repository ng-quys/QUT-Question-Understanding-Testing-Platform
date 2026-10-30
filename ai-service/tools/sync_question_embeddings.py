"""Preview Question Bank embedding queue by default; --apply writes a bounded batch.
Requires: psycopg2-binary, python-dotenv, httpx (already used by ai-service).
"""
import argparse
import json
import logging
import math
import os
import time
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from contextlib import closing

import httpx
import psycopg2
from dotenv import load_dotenv
from psycopg2.extensions import parse_dsn

load_dotenv(Path(__file__).resolve().parents[1] / '.env')
log = logging.getLogger('examflow.embedding-sync')
HEALTH = {'ready': False, 'lastError': None, 'lastSuccessAt': None}


def queue_metrics(dsn):
    with closing(psycopg2.connect(dsn, connect_timeout=5)) as conn:
        conn.set_session(readonly=True)
        with conn.cursor() as cur:
            cur.execute('''SELECT count(*),count(*) FILTER (WHERE next_retry_at<=now()),
              count(*) FILTER (WHERE attempts>0 OR last_error IS NOT NULL),
              coalesce(extract(epoch from now()-min(queued_at)),0)
              FROM public.question_embedding_queue''')
            pending,due,failed,lag=cur.fetchone()
    return {'pendingCount':pending,'dueCount':due,'failedCount':failed,'oldestQueueLagSeconds':round(float(lag),3)}


def start_health_server(port, reader_dsn):
    class Handler(BaseHTTPRequestHandler):
        def do_GET(self):
            if self.path not in ('/health','/ready','/metrics'):
                self.send_response(404);self.end_headers();return
            try:
                payload={**HEALTH, **queue_metrics(reader_dsn)}
                status=200 if (self.path!='/ready' or payload['ready']) else 503
            except Exception as exc:
                payload={**HEALTH,'ready':False,'lastError':type(exc).__name__};status=503
            body=json.dumps(payload,sort_keys=True).encode()
            self.send_response(status);self.send_header('Content-Type','application/json')
            self.send_header('Content-Length',str(len(body)));self.end_headers();self.wfile.write(body)
        def log_message(self, *_): pass
    server=ThreadingHTTPServer(('127.0.0.1',port),Handler)
    threading.Thread(target=server.serve_forever,name='embedding-sync-health',daemon=True).start()
    return server


def vector_for(client, url, model, text):
    response = client.post(url + '/api/embed', json={'model': model, 'input': text})
    response.raise_for_status()
    vectors = response.json().get('embeddings') or []
    if len(vectors) != 1 or len(vectors[0]) != 768:
        raise ValueError('Embedding must have 768 dimensions')
    if not all(type(x) in (int, float) and math.isfinite(x) for x in vectors[0]) or not any(vectors[0]):
        raise ValueError('Embedding must contain finite numeric values and be nonzero')
    return '[' + ','.join(format(float(x), '.9g') for x in vectors[0]) + ']'


def dry_run(conn, model, batch_size, missing_only=False, question_ids=None):
    """Only SELECTs, no queue claims, embedding HTTP requests or writes."""
    with conn.cursor() as cur:
        cur.execute("""
            SELECT format_type(a.atttypid,a.atttypmod) FROM pg_attribute a
            WHERE a.attrelid='public.question_embeddings'::regclass AND a.attname='embedding'
        """)
        row = cur.fetchone()
        if not row or row[0].split('.')[-1] != 'vector(768)':
            raise ValueError('Question Bank must have a 768-dimensional embedding column')
        cur.execute('''
            SELECT count(*), count(*) FILTER (WHERE e.question_id IS NULL),
              count(*) FILTER (WHERE e.question_id IS NOT NULL AND
                  (e.model_name IS DISTINCT FROM %s OR e.embedding IS NULL OR extensions.vector_dims(e.embedding)<>768))
            FROM public.questions q LEFT JOIN public.question_embeddings e ON e.question_id=q.id
        ''', (model,))
        total, missing, incompatible = cur.fetchone()
        cur.execute('''
            SELECT count(*), count(*) FILTER (WHERE j.next_retry_at<=now()),
              count(*) FILTER (WHERE q.id IS NULL),
              count(*) FILTER (WHERE q.id IS NOT NULL AND btrim(coalesce(q.content,''))='')
            FROM public.question_embedding_queue j LEFT JOIN public.questions q ON q.id=j.question_id
        ''')
        queued, due, orphaned, blank = cur.fetchone()
        cur.execute('''
            SELECT count(*) FROM public.questions q
            LEFT JOIN public.question_embeddings e ON e.question_id=q.id
            LEFT JOIN public.question_embedding_queue j ON j.question_id=q.id
            WHERE j.question_id IS NULL AND (e.question_id IS NULL OR e.model_name IS DISTINCT FROM %s
                OR e.embedding IS NULL OR extensions.vector_dims(e.embedding)<>768)
        ''', (model,))
        unqueued = cur.fetchone()[0]
        cur.execute('''
            SELECT j.question_id FROM public.question_embedding_queue j
            JOIN public.questions q ON q.id=j.question_id
            LEFT JOIN public.question_embeddings e ON e.question_id=q.id
            WHERE j.next_retry_at<=now() AND (NOT %s OR e.question_id IS NULL)
              AND (%s::bigint[] IS NULL OR j.question_id=ANY(%s::bigint[]))
            ORDER BY j.queued_at,j.question_id LIMIT %s
        ''', (missing_only, question_ids, question_ids, batch_size))
        preview = [r[0] for r in cur.fetchall()]
    return dict(mode='dry-run', model=model, dimensions=768, questions=total,
                missing=missing, incompatible=incompatible, queued=queued, due=due,
                orphaned=orphaned, blank=blank, unqueued=unqueued,
                batch_size=batch_size, next_question_ids=preview)


def process_one(conn, client, url, model, missing_only=False, question_ids=None):
    # One worker at a time; lock the queue row until commit, preventing duplicate work.
    with conn.cursor() as cur:
        cur.execute('''
            SELECT j.question_id,q.content,j.attempts,e.question_id IS NOT NULL
            FROM public.question_embedding_queue j
            LEFT JOIN public.questions q ON q.id=j.question_id
            LEFT JOIN public.question_embeddings e ON e.question_id=q.id
            WHERE j.next_retry_at <= now()
              AND (NOT %s OR e.question_id IS NULL)
              AND (%s::bigint[] IS NULL OR j.question_id=ANY(%s::bigint[]))
            ORDER BY j.queued_at,j.question_id
            LIMIT 1 FOR UPDATE OF j SKIP LOCKED
        ''', (missing_only, question_ids, question_ids))
        item = cur.fetchone()
        if not item:
            conn.commit()
            return None
        qid, content, attempts, existed = item
        if missing_only and (existed or content is None):
            conn.rollback()
            return 'skipped'
        if content is None:
            cur.execute('DELETE FROM public.question_embedding_queue WHERE question_id=%s', (qid,))
            conn.commit()
            return 'skipped'
        cur.execute('SAVEPOINT embedding_item')
        try:
            if not content.strip():
                raise ValueError('Question content is empty')
            vector = vector_for(client, url, model, content)
            statement = '''
                INSERT INTO public.question_embeddings(question_id,embedding,model_name,updated_at)
                VALUES(%s,%s::extensions.vector,%s,now())
            '''
            if missing_only:
                statement += ' ON CONFLICT(question_id) DO NOTHING'
            else:
                statement += ''' ON CONFLICT(question_id) DO UPDATE SET
                  embedding=EXCLUDED.embedding,model_name=EXCLUDED.model_name,updated_at=now()
                '''
            cur.execute(statement, (qid, vector, model))
            if missing_only and cur.rowcount == 0:
                # Another writer supplied the embedding: preserve it and its queue item.
                conn.rollback()
                return 'skipped'
            cur.execute('DELETE FROM public.question_embedding_queue WHERE question_id=%s', (qid,))
            conn.commit()
            log.info('Embedded question %s', qid)
            return 'updated' if existed else 'created'
        except Exception as exc:
            # Retain the queue-row lock while recording retry; another worker cannot
            # consume/requeue this question between rollback and error bookkeeping.
            cur.execute('ROLLBACK TO SAVEPOINT embedding_item')
            # Record retry without logging credentials or source text.
            with conn.cursor() as cur2:
                cur2.execute('''
                    UPDATE public.question_embedding_queue
                    SET attempts=attempts+1,
                        next_retry_at=now() + (LEAST(300, 10 * (attempts+1)) * interval '1 second'),
                        last_error=%s
                    WHERE question_id=%s
                ''', (type(exc).__name__[:120], qid))
            conn.commit()
            log.warning('Embedding failed for question %s (%s)', qid, type(exc).__name__)
            return 'errors'


def run_batch(conn, client, url, model, batch_size, missing_only=False, question_ids=None):
    counts = dict(created=0, updated=0, skipped=0, errors=0)
    for _ in range(batch_size):
        status = process_one(conn, client, url, model, missing_only, question_ids)
        if status is None:
            break
        counts[status] += 1
        if status == 'errors':
            break
    return counts


def writer_dsn(reader, writer):
    if not writer:
        raise ValueError('Apply requires separate approved EXAMFLOW_EMBEDDING_SYNC_DSN')
    source, target = parse_dsn(reader), parse_dsn(writer)
    keys = ('host', 'port', 'dbname', 'user')
    if any(source.get(k, '5432' if k == 'port' else '') != target.get(k, '5432' if k == 'port' else '') for k in keys):
        raise ValueError('Writer must target the same Question Bank as the reader')
    return writer


def main():
    parser = argparse.ArgumentParser()
    modes = parser.add_mutually_exclusive_group()
    modes.add_argument('--dry-run', action='store_true', help='Read-only preview (default)')
    modes.add_argument('--apply', action='store_true', help='Write one bounded batch; requires separate approval')
    parser.add_argument('--once', action='store_true', help='Explicitly run one batch (default)')
    parser.add_argument('--watch', action='store_true', help='Explicit continuous apply; otherwise stops after one batch')
    parser.add_argument('--batch-size', type=int, default=5)
    parser.add_argument('--missing-only', action='store_true', help='Never update or remove an existing embedding')
    parser.add_argument('--question-ids', type=int, nargs='+', help='Restrict work to explicitly approved question IDs')
    parser.add_argument('--interval', type=int, default=10)
    parser.add_argument('--health-port', type=int, default=8004)
    args = parser.parse_args()
    if args.interval < 1:
        parser.error('--interval must be >= 1')
    if not 1 <= args.health_port <= 65535:
        parser.error('--health-port must be between 1 and 65535')
    if not 1 <= args.batch_size <= 20:
        parser.error('--batch-size must be between 1 and 20')
    if args.question_ids and any(qid < 1 for qid in args.question_ids):
        parser.error('--question-ids must be positive')
    if args.watch and (not args.apply or args.once):
        parser.error('--watch requires --apply and cannot be combined with --once')
    dsn = os.getenv('EXAMFLOW_QUESTIONBANK_DSN', '').strip()
    if not dsn:
        parser.error('Missing EXAMFLOW_QUESTIONBANK_DSN in ai-service/.env')
    url = os.getenv('OLLAMA_URL', 'http://127.0.0.1:11434').rstrip('/')
    model = os.getenv('OLLAMA_EMBED_MODEL', 'nomic-embed-text')
    logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s %(message)s')
    if not args.apply:
        with closing(psycopg2.connect(dsn, connect_timeout=10)) as conn:
            conn.set_session(readonly=True)
            print(json.dumps(dry_run(conn, model, args.batch_size, args.missing_only, args.question_ids), sort_keys=True))
        return
    try:
        dsn = writer_dsn(dsn, os.getenv('EXAMFLOW_EMBEDDING_SYNC_DSN', '').strip())
    except ValueError as exc:
        parser.error(str(exc))
    health = start_health_server(args.health_port, os.getenv('EXAMFLOW_QUESTIONBANK_DSN','').strip()) if args.watch else None
    with httpx.Client(timeout=120) as client:
        while True:
            try:
                with closing(psycopg2.connect(dsn, connect_timeout=10)) as conn:
                    with conn.cursor() as cur:
                        cur.execute('SHOW transaction_read_only')
                        if cur.fetchone()[0] != 'off':
                            raise SystemExit('Writer connection is read-only; reader settings will not be overridden')
                    conn.rollback()
                    counts = run_batch(conn, client, url, model, args.batch_size, args.missing_only, args.question_ids)
                    HEALTH.update(ready=True,lastError=None,lastSuccessAt=time.time())
                    print(json.dumps(counts, sort_keys=True), flush=True)
                    if counts['errors']:
                        raise SystemExit('Batch stopped after first error; failed queue item retained')
                if not args.watch:
                    break
            except Exception as exc:
                HEALTH.update(ready=False,lastError=type(exc).__name__)
                log.warning('Queue unavailable (%s)', type(exc).__name__)
                if not args.watch:
                    raise SystemExit('Embedding sync failed (%s); credentials suppressed' % type(exc).__name__) from None
            time.sleep(args.interval)

if __name__ == '__main__':
    try:
        main()
    except KeyboardInterrupt:
        raise SystemExit(130) from None
    except Exception as exc:
        raise SystemExit('Embedding sync failed (%s); credentials suppressed' % type(exc).__name__) from None
