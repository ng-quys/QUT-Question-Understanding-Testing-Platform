"""Real FastAPI routes, isolated registry; no main-module startup or Production env."""
import ast
import asyncio
import hmac
import os
import tempfile
import unittest
from pathlib import Path
from uuid import UUID, uuid4
from unittest.mock import AsyncMock, MagicMock, patch

from fastapi import FastAPI, Depends, Header, HTTPException
from fastapi.testclient import TestClient
from pydantic import BaseModel, Field, field_validator
from credits_runtime import GenerationRegistry, GenerationJob


class SavedDocumentsGuardTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.state = Path(self.tmp.name) / 'registry.json'
        registry = GenerationRegistry(self.state)
        names = {'Unit', 'GenerationRequest', 'SelectedClo', 'IndexDocumentRequest',
                 'ReindexDocumentRequest', 'requested_count', 'require_internal',
                 'require_registry', 'require_saved_documents', 'index_document',
                 'reindex_document', 'generate', 'start_credit_job', 'health',
                 'credit_job_status', 'cancel_credit_job', 'saved_document_metrics'}
        tree = ast.parse(Path('main.py').read_text(encoding='utf-8'))
        nodes = [n for n in tree.body if isinstance(n, (ast.ClassDef, ast.FunctionDef, ast.AsyncFunctionDef)) and n.name in names]
        self.ns = dict(app=FastAPI(), BaseModel=BaseModel, Field=Field,
            field_validator=field_validator, UUID=UUID, HTTPException=HTTPException,
            Depends=Depends, Header=Header, hmac=hmac, asyncio=asyncio,
            MAX_QUESTIONS=45, SAVED_DOCUMENTS_ENABLED=False,
            INTERNAL_KEY='isolated-test-key-at-least-32-characters', registry=registry,
            OLLAMA_URL='isolated', MODEL='isolated', from_environment=MagicMock(),
            _generate=AsyncMock(return_value=[]), logger=MagicMock(),
            document_metrics_snapshot=MagicMock(return_value={'chunkEmbeddingBatchesStarted':0}))
        exec(compile(ast.Module(body=nodes, type_ignores=[]), 'actual_saved_routes', 'exec'), self.ns)
        self.ns['GenerationRequest'].model_rebuild(_types_namespace=self.ns)
        self.client = TestClient(self.ns['app'])  # No startup/resume hook is included.
        self.addCleanup(self.client.close)
        self.headers = {'X-AI-Internal-Key': self.ns['INTERNAL_KEY']}
        self.ref = dict(documentId=str(uuid4()), revision=1, indexId=str(uuid4()), configHash='a'*64)
        self.request = dict(courseId=11, documentRefs=[self.ref], questionCount=1,
            cloIds=[1], selectedClos=[dict(id=1, code='CLO1', description='DNS')])
        self.index = dict(documentId=self.ref['documentId'], revision=1,
            ownerUserId=7, courseId=11, extractedText='Synthetic DNS document. '*10)

    def test_flag_defaults_off_and_only_true_enables(self):
        tree = ast.parse(Path('main.py').read_text(encoding='utf-8'))
        node = next(n for n in tree.body if isinstance(n, ast.Assign)
                    and any(isinstance(t, ast.Name) and t.id=='SAVED_DOCUMENTS_ENABLED' for t in n.targets))
        for value, expected in [(None, False), ('false', False), ('0', False), ('true', True), ('TRUE', True)]:
            with patch.dict(os.environ, {}, clear=True):
                if value is not None: os.environ['AI_SAVED_DOCUMENTS_ENABLED'] = value
                ns = {'os': os}
                exec(compile(ast.Module(body=[node], type_ignores=[]), 'flag', 'exec'), ns)
                self.assertEqual(expected, ns['SAVED_DOCUMENTS_ENABLED'])

    def test_disabled_routes_never_touch_cache_generator_or_registry(self):
        before = self.state.read_bytes()
        with patch.object(self.ns['registry'], 'start', new_callable=AsyncMock) as start:
            for url, payload in [('/documents/index', self.index),
                    ('/documents/reindex', {k:v for k,v in self.index.items() if k in ('documentId','ownerUserId','courseId')}),
                    ('/generate', self.request), ('/credits/jobs/'+str(uuid4()), self.request)]:
                response = self.client.post(url, json=payload, headers=self.headers)
                self.assertEqual(503, response.status_code, response.text)
                self.assertIn('AI_SAVED_DOCUMENTS_ENABLED', response.json()['detail'])
            start.assert_not_called()
        self.ns['from_environment'].assert_not_called()
        self.ns['_generate'].assert_not_called()
        self.assertEqual(before, self.state.read_bytes())
        self.assertFalse(self.ns['registry'].jobs)

    def test_direct_generation_guard_precedes_embedding_and_database(self):
        tree = ast.parse(Path('main.py').read_text(encoding='utf-8'))
        node = next(n for n in tree.body if isinstance(n, ast.AsyncFunctionDef) and n.name=='_generate')
        ns = dict(self.ns)
        exec(compile(ast.Module(body=[node], type_ignores=[]), 'actual_generation', 'exec'), ns)
        with self.assertRaises(HTTPException) as error:
            asyncio.run(ns['_generate'](self.ns['GenerationRequest'](**self.request)))
        self.assertEqual(503, error.exception.status_code)
        self.ns['from_environment'].assert_not_called()

    def test_enabled_index_and_reindex_reach_cache(self):
        self.ns['SAVED_DOCUMENTS_ENABLED'] = True
        cache = self.ns['from_environment'].return_value
        cache.index.return_value = cache.reindex.return_value = {'status':'ready'}
        self.assertEqual(200, self.client.post('/documents/index', json=self.index, headers=self.headers).status_code)
        payload = {k:v for k,v in self.index.items() if k in ('documentId','ownerUserId','courseId')}
        self.assertEqual(200, self.client.post('/documents/reindex', json=payload, headers=self.headers).status_code)
        cache.index.assert_called_once()
        cache.reindex.assert_called_once()

    def test_enabled_refs_reach_generator_and_credit_admission(self):
        self.ns['SAVED_DOCUMENTS_ENABLED'] = True
        self.assertEqual(200, self.client.post('/generate', json=self.request, headers=self.headers).status_code)
        self.ns['_generate'].assert_awaited_once()
        with patch.object(self.ns['registry'], 'start', new_callable=AsyncMock, return_value={'status':'queued'}) as start:
            self.assertEqual(202, self.client.post('/credits/jobs/'+str(uuid4()), json=self.request, headers=self.headers).status_code)
            start.assert_awaited_once()

    def test_disabled_flag_preserves_legacy_and_health_status_routes(self):
        legacy = dict(self.request)
        legacy.pop('documentRefs')
        legacy['sourceText'] = 'Synthetic legacy DNS text. '*10
        self.assertEqual(200, self.client.post('/generate', json=legacy, headers=self.headers).status_code)
        self.ns['_generate'].assert_awaited_once()
        with patch.object(self.ns['registry'], 'start', new_callable=AsyncMock, return_value={'status':'queued'}) as start:
            self.assertEqual(202, self.client.post('/credits/jobs/'+str(uuid4()), json=legacy, headers=self.headers).status_code)
            start.assert_awaited_once()
        self.assertEqual(200, self.client.get('/health').status_code)
        url = '/credits/jobs/'+str(uuid4())
        self.assertEqual(404, self.client.get(url, headers=self.headers).status_code)
        self.assertEqual(404, self.client.post(url+'/cancel', headers=self.headers).status_code)

    def test_internal_auth_still_required_when_enabled(self):
        self.ns['SAVED_DOCUMENTS_ENABLED'] = True
        self.assertEqual(403, self.client.post('/documents/index', json=self.index).status_code)
        self.ns['from_environment'].assert_not_called()

    def test_metrics_are_read_only_and_require_internal_auth(self):
        self.assertEqual(403,self.client.get('/documents/metrics').status_code)
        self.ns['document_metrics_snapshot'].assert_not_called()
        response=self.client.get('/documents/metrics',headers=self.headers)
        self.assertEqual(200,response.status_code)
        self.assertEqual(0,response.json()['chunkEmbeddingBatchesStarted'])
        self.ns['from_environment'].assert_not_called()

    def test_admission_pins_configured_inference_mode_without_changing_checkpoint(self):
        self.ns['SAVED_DOCUMENTS_ENABLED']=True
        for mode in (1,3):
            self.ns['INFERENCE_BATCH_SIZE']=mode
            with patch.object(self.ns['registry'],'start',new_callable=AsyncMock,return_value={'status':'queued'}) as start:
                response=self.client.post('/credits/jobs/'+str(uuid4()),json=self.request,headers=self.headers)
                self.assertEqual(202,response.status_code)
                payload=start.call_args.args[1]
                self.assertEqual(mode,payload['inferenceBatchSize'])
                self.assertEqual(5,payload['batchSize'])

    def test_reposted_token_keeps_persisted_mode_after_config_change(self):
        from types import SimpleNamespace
        self.ns['SAVED_DOCUMENTS_ENABLED']=True
        self.ns['INFERENCE_BATCH_SIZE']=1
        token=str(uuid4());self.ns['registry'].jobs[token]=SimpleNamespace(inference_batch_size=3)
        with patch.object(self.ns['registry'],'start',new_callable=AsyncMock,return_value={'status':'queued'}) as start:
            self.assertEqual(202,self.client.post('/credits/jobs/'+token,json=self.request,headers=self.headers).status_code)
            self.assertEqual(3,start.call_args.args[1]['inferenceBatchSize'])

    def test_disabled_resume_preserves_saved_checkpoint_and_resumes_legacy(self):
        tree = ast.parse(Path('main.py').read_text(encoding='utf-8'))
        node = next(n for n in tree.body if isinstance(n, ast.AsyncFunctionDef) and n.name=='resume_durable_jobs')
        registry = self.ns['registry']
        saved = GenerationJob('saved', payload=self.request, state='paused', questions=[{'content':'checkpoint'}])
        legacy = GenerationJob('legacy', payload={'sourceText':'legacy'}, state='paused')
        registry.jobs.update(saved=saved, legacy=legacy)
        registry._save()
        before = dict(vars(saved))
        generator = AsyncMock(return_value=[])
        self.ns['_job_generator'] = MagicMock(return_value=generator)
        exec(compile(ast.Module(body=[node], type_ignores=[]), 'actual_startup', 'exec'), self.ns)
        async def run():
            await self.ns['resume_durable_jobs']()
            await legacy.task
        asyncio.run(run())
        self.assertEqual(before, vars(saved))
        self.assertEqual('succeeded', legacy.state)
        self.ns['_job_generator'].assert_called_once_with(legacy.payload if legacy.payload else {'sourceText':'legacy'}, [])


if __name__ == '__main__': unittest.main()
