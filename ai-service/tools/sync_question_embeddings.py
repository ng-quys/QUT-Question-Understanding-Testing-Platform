"""Poll Question Bank embedding queue. Run beside ai-service/.env.
Requires: psycopg2-binary, python-dotenv, httpx (already used by ai-service).
"""
import argparse
import hashlib
import logging
import os
import time
from pathlib import Path

import httpx
import psycopg2
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[1] / '.env')
log = logging.getLogger('examflow.embedding-sync')


def vector_for(client, url, model, text):
    response = client.post(url + '/api/embed', json={'model': model, 'input': text})
    response.raise_for_status()
    vectors = response.json().get('embeddings') or []
    if len(vectors) != 1 or len(vectors[0]) != 768:
        raise ValueError('Embedding must have 768 dimensions')
    return '[' + ','.join(format(float(x), '.9g') for x in vectors[0]) + ']'


def process_one(conn, client, url, model):
    # One worker at a time; lock the queue row until commit, preventing duplicate work.
    with conn.cursor() as cur:
        cur.execute('''
            SELECT j.question_id,q.content,j.attempts
            FROM public.question_embedding_queue j
            LEFT JOIN public.questions q ON q.id=j.question_id
            WHERE j.next_retry_at <= now()
            ORDER BY j.queued_at
            LIMIT 1 FOR UPDATE OF j SKIP LOCKED
        ''')
        item = cur.fetchone()
        if not item:
            conn.commit()
            return False
        qid, content, attempts = item
        if content is None:
            cur.execute('DELETE FROM public.question_embeddings WHERE question_id=%s', (qid,))
            cur.execute('DELETE FROM public.question_embedding_queue WHERE question_id=%s', (qid,))
            conn.commit()
            return True
        try:
            vector = vector_for(client, url, model, content)
            cur.execute('''
                INSERT INTO public.question_embeddings(question_id,embedding,model_name,updated_at)
                VALUES(%s,%s::extensions.vector,%s,now())
                ON CONFLICT(question_id) DO UPDATE SET
                  embedding=EXCLUDED.embedding,model_name=EXCLUDED.model_name,updated_at=now()
            ''', (qid, vector, model))
            cur.execute('DELETE FROM public.question_embedding_queue WHERE question_id=%s', (qid,))
            conn.commit()
            log.info('Embedded question %s', qid)
        except Exception as exc:
            conn.rollback()
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
        return True


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--once', action='store_true', help='Process pending items once and exit')
    parser.add_argument('--interval', type=int, default=10)
    args = parser.parse_args()
    if args.interval < 1:
        parser.error('--interval must be >= 1')
    dsn = os.getenv('EXAMFLOW_QUESTIONBANK_DSN', '').strip()
    if not dsn:
        parser.error('Missing EXAMFLOW_QUESTIONBANK_DSN in ai-service/.env')
    url = os.getenv('OLLAMA_URL', 'http://127.0.0.1:11434').rstrip('/')
    model = os.getenv('OLLAMA_EMBED_MODEL', 'nomic-embed-text')
    logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s %(message)s')
    with httpx.Client(timeout=120) as client:
        while True:
            try:
                with psycopg2.connect(dsn, connect_timeout=10) as conn:
                    processed = 0
                    while processed < 100 and process_one(conn, client, url, model):
                        processed += 1
                if args.once:
                    break
            except Exception as exc:
                log.warning('Queue unavailable (%s)', type(exc).__name__)
                if args.once:
                    raise
            time.sleep(args.interval)

if __name__ == '__main__':
    main()
