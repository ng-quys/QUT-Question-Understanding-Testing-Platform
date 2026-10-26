import unittest
import uuid
from unittest.mock import MagicMock

from document_cache import DIMENSIONS, DocumentCache, DocumentRef, ExactDocumentStore, config_hash, sha256, document_metrics_snapshot


class FakeCursor:
    def __init__(self, results): self.results=iter(results);self.current=[];self.rowcount=1
    def execute(self, sql, params=()): self.current=next(self.results,[])
    def fetchone(self): return self.current[0] if self.current else None
    def fetchall(self): return self.current
    def __enter__(self): return self
    def __exit__(self,*args): pass

class FakeConnection:
    def __init__(self, results): self.cursor_value=FakeCursor(results)
    def cursor(self): return self.cursor_value
    def __enter__(self): return self
    def __exit__(self,*args): pass


class DocumentCacheTest(unittest.TestCase):
    def test_config_hash_is_stable_and_model_digest_sensitive(self):
        text=sha256('same text')
        self.assertEqual(config_hash(text,'nomic-embed-text','digest-a'),config_hash(text,'nomic-embed-text','digest-a'))
        self.assertNotEqual(config_hash(text,'nomic-embed-text','digest-a'),config_hash(text,'nomic-embed-text','digest-b'))

    def test_ready_cache_hit_embeds_zero_chunks(self):
        doc,index=uuid.uuid4(),uuid.uuid4();embed=MagicMock(side_effect=AssertionError('must not embed cache hit'))
        connect=MagicMock(return_value=FakeConnection([[(index,3)]]))
        cache=DocumentCache('host=read dbname=q user=u','host=write dbname=q user=u','ollama','nomic-embed-text',embedder=embed,digest_loader=lambda:'digest',connect=connect)
        before=document_metrics_snapshot()
        result=cache.index(doc,1,7,11,'Document content with enough text to pass the minimum length requirement. '*2)
        self.assertTrue(result['cacheHit']);self.assertEqual(0,result['chunkEmbeddingCalls']);embed.assert_not_called()
        after=document_metrics_snapshot()
        self.assertEqual(before['chunkEmbeddingBatchesStarted'],after['chunkEmbeddingBatchesStarted'])
        self.assertEqual(before['chunkEmbeddingTextsRequested'],after['chunkEmbeddingTextsRequested'])
        self.assertEqual(before['cacheHits']+1,after['cacheHits'])

    def test_new_document_embeds_chunks_once_and_reports_timing(self):
        doc,index=uuid.uuid4(),uuid.uuid4();vectors=[]
        def embed(texts):
            vectors.append(list(texts));return [[0.01]*DIMENSIONS for _ in texts]
        connections=[FakeConnection([[]]),FakeConnection([[(1,)],[(index,)]]),FakeConnection([[],[],[]])]
        cache=DocumentCache('host=read dbname=q user=u','host=write dbname=q user=u','ollama','nomic',
            embedder=embed,digest_loader=lambda:'digest',connect=MagicMock(side_effect=connections))
        result=cache.index(doc,1,7,11,'A sufficiently long document about DNS and network administration. '*20)
        self.assertFalse(result['cacheHit']);self.assertEqual(1,result['chunkEmbeddingCalls']);self.assertGreaterEqual(result['preparationMs'],0)
        self.assertEqual(1,len(vectors));self.assertEqual(result['chunkCount'],len(vectors[0]))

    def test_writer_dsn_cannot_be_read_only(self):
        cache=DocumentCache('host=r dbname=q user=u',"host=w dbname=q user=u options='-c default_transaction_read_only=on'",'o','m')
        with self.assertRaisesRegex(RuntimeError,'read-only'): cache._connection(write=True)

    def test_exact_store_embeds_query_only_and_searches_pinned_refs(self):
        doc,index=uuid.uuid4(),uuid.uuid4();calls=[]
        cache=MagicMock(spec=DocumentCache)
        cache.embedder=lambda texts:(calls.append(texts) or [[0.0]*DIMENSIONS])
        cache.search.return_value=[]
        ref=DocumentRef(doc,1,index,'a'*64)
        ExactDocumentStore(cache,[ref]).similarity_search('CLO query',4)
        self.assertEqual([['CLO query']],calls);cache.search.assert_called_once()

    def test_validate_refs_rejects_more_than_five_before_database(self):
        cache=DocumentCache('read','write','ollama','nomic',connect=MagicMock())
        refs=[DocumentRef(uuid.uuid4(),1,uuid.uuid4(),'a'*64) for _ in range(6)]
        with self.assertRaises(ValueError): cache.validate_refs(refs)
        cache.connect.assert_not_called()

if __name__=='__main__': unittest.main()
