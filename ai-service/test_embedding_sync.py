"""No real databases, model calls or queue writes in these tests."""
import importlib.util
import io
import json
from pathlib import Path
import unittest
from unittest.mock import MagicMock, patch

spec = importlib.util.spec_from_file_location('embedding_sync', Path(__file__).parent/'tools/sync_question_embeddings.py')
sync = importlib.util.module_from_spec(spec)
with patch('dotenv.load_dotenv'):
    spec.loader.exec_module(sync)


class EmbeddingSyncTests(unittest.TestCase):
    def connection(self, item=None):
        conn = MagicMock()
        cur = conn.cursor.return_value.__enter__.return_value
        cur.fetchone.return_value = item
        return conn, cur

    def test_default_cli_is_read_only_and_does_not_call_ollama(self):
        conn, cur = self.connection()
        cur.fetchone.side_effect = [('vector(768)',), (149,32,0), (32,32,0,0), (0,)]
        cur.fetchall.return_value = [(1,), (2,)]
        with patch.object(sync.psycopg2,'connect',return_value=conn), \
             patch.object(sync.httpx,'Client') as http, \
             patch.object(sync.os,'getenv',side_effect=lambda k,d='': 'host=reader dbname=bank user=app' if k=='EXAMFLOW_QUESTIONBANK_DSN' else d), \
             patch.object(sync.logging,'basicConfig'), \
             patch('sys.argv',['sync','--batch-size','5']), patch('sys.stdout',new_callable=io.StringIO) as output:
            sync.main()
            report=json.loads(output.getvalue())
        self.assertEqual(32,report['missing']);self.assertEqual(32,report['due'])
        conn.set_session.assert_called_once_with(readonly=True)
        conn.close.assert_called_once();http.assert_not_called()
        for call in cur.execute.call_args_list:
            sql=call.args[0].strip().upper()
            self.assertTrue(sql.startswith('SELECT'));self.assertNotIn('FOR UPDATE',sql)

    def test_apply_requires_separate_same_database_writer(self):
        reader='host=qb port=5432 dbname=bank user=app'
        with self.assertRaises(ValueError):sync.writer_dsn(reader,'')
        with self.assertRaises(ValueError):sync.writer_dsn(reader,'host=main port=5432 dbname=bank user=app')
        writer=reader+' password=synthetic-test-only'
        self.assertEqual(writer,sync.writer_dsn(reader,writer))

    def test_readonly_writer_is_not_overridden_or_written(self):
        conn,cur=self.connection(('on',))
        dsn='host=qb dbname=bank user=app'
        env={'EXAMFLOW_QUESTIONBANK_DSN':dsn,'EXAMFLOW_EMBEDDING_SYNC_DSN':dsn}
        with patch.object(sync.os,'getenv',side_effect=lambda k,d='':env.get(k,d)), \
             patch.object(sync.psycopg2,'connect',return_value=conn), \
             patch.object(sync.httpx,'Client'),patch.object(sync,'run_batch') as batch, \
             patch.object(sync.logging,'basicConfig'),patch('sys.argv',['sync','--apply','--once']):
            with self.assertRaisesRegex(SystemExit,'read-only'):sync.main()
        batch.assert_not_called();conn.set_session.assert_not_called();conn.close.assert_called_once()

    def test_apply_interruption_closes_connection_for_safe_resume(self):
        conn,cur=self.connection(('off',))
        dsn='host=qb dbname=bank user=app'
        env={'EXAMFLOW_QUESTIONBANK_DSN':dsn,'EXAMFLOW_EMBEDDING_SYNC_DSN':dsn}
        with patch.object(sync.os,'getenv',side_effect=lambda k,d='':env.get(k,d)), \
             patch.object(sync.psycopg2,'connect',return_value=conn), \
             patch.object(sync.httpx,'Client'),patch.object(sync,'run_batch',side_effect=KeyboardInterrupt), \
             patch.object(sync.logging,'basicConfig'),patch('sys.argv',['sync','--apply','--once']):
            with self.assertRaises(KeyboardInterrupt):sync.main()
        conn.close.assert_called_once();conn.commit.assert_not_called()

    def test_batch_stops_on_first_error(self):
        with patch.object(sync,'process_one',return_value='errors') as process:
            result=sync.run_batch(MagicMock(),MagicMock(),'http://test','nomic-embed-text',5)
        self.assertEqual(1,process.call_count);self.assertEqual(1,result['errors'])

    def test_missing_only_never_overwrites_or_dequeues_concurrent_embedding(self):
        conn,cur=self.connection((3,'Synthetic question',0,False))
        cur.rowcount=0
        with patch.object(sync,'vector_for',return_value='[1,0]'):
            self.assertEqual('skipped',sync.process_one(conn,MagicMock(),'http://test','nomic-embed-text',True,[3]))
        sql=' '.join(c.args[0] for c in cur.execute.call_args_list)
        self.assertIn('ON CONFLICT(question_id) DO NOTHING',sql)
        self.assertNotIn('DO UPDATE',sql);self.assertNotIn('DELETE FROM',sql)
        self.assertEqual((True,[3],[3]),cur.execute.call_args_list[0].args[1])
        conn.rollback.assert_called_once();conn.commit.assert_not_called()

    def test_missing_only_preserves_existing_embedding_without_model_call(self):
        conn,cur=self.connection((3,'Synthetic question',0,True))
        with patch.object(sync,'vector_for') as model:
            self.assertEqual('skipped',sync.process_one(conn,MagicMock(),'http://test','nomic-embed-text',True,[3]))
        model.assert_not_called();conn.commit.assert_not_called()

    def test_batch_stops_when_queue_empty(self):
        with patch.object(sync,'process_one',side_effect=['created','updated',None]) as process:
            result=sync.run_batch(MagicMock(),MagicMock(),'http://test','nomic-embed-text',5)
        self.assertEqual(3,process.call_count);self.assertEqual(1,result['created']);self.assertEqual(1,result['updated'])

    def test_apply_uses_locked_queue_and_atomic_upsert_and_dequeue(self):
        for existed,expected in ((False,'created'),(True,'updated')):
            conn,cur=self.connection((3,'Synthetic question',0,existed))
            with patch.object(sync,'vector_for',return_value='[1,0]'):
                self.assertEqual(expected,sync.process_one(conn,MagicMock(),'http://test','nomic-embed-text'))
            sql=' '.join(c.args[0] for c in cur.execute.call_args_list)
            self.assertIn('FOR UPDATE OF j SKIP LOCKED',sql)
            self.assertIn('ON CONFLICT(question_id) DO UPDATE',sql)
            self.assertIn('DELETE FROM public.question_embedding_queue',sql)
            self.assertNotIn('DELETE FROM public.question_embeddings',sql)
            conn.commit.assert_called_once()

    def test_failure_retains_queue_lock_and_schedules_retry(self):
        conn,cur=self.connection((3,'Synthetic question',0,False))
        with patch.object(sync,'vector_for',side_effect=TimeoutError('synthetic timeout')):
            self.assertEqual('errors',sync.process_one(conn,MagicMock(),'http://test','nomic-embed-text'))
        sql=' '.join(c.args[0] for c in cur.execute.call_args_list)
        self.assertIn('ROLLBACK TO SAVEPOINT embedding_item',sql)
        self.assertNotIn('DELETE FROM',sql);conn.rollback.assert_not_called()
        retry=conn.cursor.return_value.__enter__.return_value
        self.assertTrue(any('attempts=attempts+1' in c.args[0] for c in retry.execute.call_args_list))
        conn.commit.assert_called_once()

    def test_interrupt_does_not_commit_or_dequeue(self):
        conn,cur=self.connection((3,'Synthetic question',0,False))
        with patch.object(sync,'vector_for',side_effect=KeyboardInterrupt):
            with self.assertRaises(KeyboardInterrupt):sync.process_one(conn,MagicMock(),'http://test','nomic-embed-text')
        conn.commit.assert_not_called()
        self.assertFalse(any('DELETE FROM' in c.args[0] for c in cur.execute.call_args_list))

    def test_vectors_reject_wrong_dimension_nan_infinite_boolean_and_zero(self):
        client=MagicMock()
        for vector in ([1]*767,[float('nan')]*768,[float('inf')]*768,[True]*768,[0]*768):
            client.post.return_value.json.return_value={'embeddings':[vector]}
            with self.assertRaises(ValueError):sync.vector_for(client,'http://test','nomic-embed-text','synthetic')
        client.post.return_value.json.return_value={'embeddings':[[1.0]*768]}
        self.assertTrue(sync.vector_for(client,'http://test','nomic-embed-text','synthetic').startswith('[1,'))

    def test_invalid_batch_size_does_not_connect(self):
        with patch('sys.argv',['sync','--batch-size','21']), patch.object(sync.psycopg2,'connect') as connect, \
             patch('sys.stderr',new_callable=io.StringIO):
            with self.assertRaises(SystemExit):sync.main()
        connect.assert_not_called()

    def test_queue_metrics_reports_pending_failed_and_lag_read_only(self):
        conn,cur=self.connection((17,17,2,42.5))
        with patch.object(sync.psycopg2,'connect',return_value=conn):
            report=sync.queue_metrics('host=synthetic')
        self.assertEqual({'pendingCount':17,'dueCount':17,'failedCount':2,'oldestQueueLagSeconds':42.5},report)
        conn.set_session.assert_called_once_with(readonly=True)
        self.assertTrue(cur.execute.call_args.args[0].strip().upper().startswith('SELECT'))


if __name__=='__main__':unittest.main()
