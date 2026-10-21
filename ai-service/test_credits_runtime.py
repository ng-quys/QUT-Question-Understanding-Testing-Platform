import asyncio
import unittest
import ast
import hmac
import json
import re
from types import SimpleNamespace
from pathlib import Path
from fastapi import Header, HTTPException
from fastapi import FastAPI, Depends
from fastapi.testclient import TestClient
from uuid import UUID
from pydantic import BaseModel, Field, field_validator
from unittest.mock import AsyncMock
from credits_runtime import GenerationRegistry


class CreditsRuntimeTests(unittest.IsolatedAsyncioTestCase):
    async def test_registry_identity_rejects_wrong_instance_before_token_lookup(self):
        tree = ast.parse(Path('main.py').read_text(encoding='utf-8'))
        names = {'require_internal', 'require_registry', 'credit_job_status', 'cancel_credit_job', 'health'}
        nodes = [n for n in tree.body if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef)) and n.name in names]
        owner = GenerationRegistry()
        ns = dict(app=FastAPI(), Header=Header, HTTPException=HTTPException, Depends=Depends,
                  hmac=hmac, UUID=UUID, INTERNAL_KEY='fixture-only-key-at-least-32-characters',
                  registry=owner, OLLAMA_URL='fixture', MODEL='fixture')
        exec(compile(ast.Module(body=nodes, type_ignores=[]), 'registry_routes', 'exec'), ns)
        with TestClient(ns['app']) as client:
            self.assertEqual(owner.registry_id, client.get('/health').json()['registryId'])
            headers = {'X-AI-Internal-Key': ns['INTERNAL_KEY'], 'X-AI-Registry-Id': GenerationRegistry().registry_id}
            url = '/credits/jobs/00000000-0000-0000-0000-000000000001'
            self.assertEqual(409, client.get(url, headers=headers).status_code)
            self.assertEqual(409, client.post(url+'/cancel', headers=headers).status_code)
            headers['X-AI-Registry-Id'] = owner.registry_id
            self.assertEqual(404, client.get(url, headers=headers).status_code)
            self.assertFalse(owner.jobs)

    async def test_other_registry_404_does_not_erase_owners_completed_result(self):
        owner, other = GenerationRegistry(), GenerationRegistry()
        calls = []
        async def generate(progress, cancelled):
            calls.append(1)
            return [{'content': 'retained fixture result'}]
        await owner.start('fixture-token', {'count': 1}, generate)
        await owner.jobs['fixture-token'].task
        with self.assertRaises(KeyError):
            other.status('fixture-token')
        self.assertEqual('succeeded', owner.status('fixture-token')['status'])
        self.assertEqual(1, len(owner.status('fixture-token')['questions']))
        await owner.start('fixture-token', {'count': 1}, generate)
        self.assertEqual(1, len(calls))

    async def test_reload_during_generation_loses_new_registry_but_old_checkpoint_survives_cancellation(self):
        old = GenerationRegistry()
        ready = asyncio.Event()
        async def generate(progress, cancelled):
            progress([{'content': 'checkpoint fixture'}])
            ready.set()
            await asyncio.Event().wait()
        await old.start('fixture-token', {}, generate)
        await ready.wait()
        replacement = GenerationRegistry()
        with self.assertRaises(KeyError):
            replacement.status('fixture-token')
        old.jobs['fixture-token'].task.cancel()
        with self.assertRaises(asyncio.CancelledError):
            await old.jobs['fixture-token'].task
        self.assertEqual('failed', old.status('fixture-token')['status'])
        self.assertEqual(1, len(old.status('fixture-token')['questions']))
        self.assertFalse(replacement.jobs)

    async def test_clo_start_accepts_jackson_null_instruction_without_model_io(self):
        tree = ast.parse(Path('main.py').read_text(encoding='utf-8'))
        names = {'Unit', 'GenerationRequest', 'SelectedClo', 'requested_count',
                 'require_internal', 'require_registry', 'start_credit_job'}
        nodes = [n for n in tree.body if isinstance(n, (ast.ClassDef, ast.FunctionDef, ast.AsyncFunctionDef))
                 and n.name in names]
        registry = SimpleNamespace(start=AsyncMock(return_value={'status': 'running', 'questions': []}))
        ns = dict(app=FastAPI(), BaseModel=BaseModel, Field=Field, field_validator=field_validator,
                  Header=Header, HTTPException=HTTPException, Depends=Depends, hmac=hmac,
                  UUID=UUID, MAX_QUESTIONS=45, INTERNAL_KEY='test-only-key-at-least-32-characters',
                  registry=registry, _generate=AsyncMock())
        exec(compile(ast.Module(body=nodes, type_ignores=[]), 'actual_clo_start', 'exec'), ns)
        ns['GenerationRequest'].model_rebuild(_types_namespace=ns)
        payload = dict(courseId=11, provider='qwen', instruction=None, units=None,
                       sourceText='Synthetic DNS document. ' * 10, questionCount=10,
                       cloIds=[25], selectedClos=[dict(id=25, code='CLO1', description='Explain DNS')],
                       sourceProof='synthetic-proof', defaultScore=0.5)
        with TestClient(ns['app']) as client:
            url = '/credits/jobs/00000000-0000-0000-0000-000000000001'
            headers = {'X-AI-Internal-Key': ns['INTERNAL_KEY']}
            for instruction in (None, '', 'Additional guidance'):
                response = client.post(url, json=payload | dict(instruction=instruction), headers=headers)
                self.assertEqual(202, response.status_code, response.text)
                forwarded = registry.start.call_args.args[1]
                self.assertEqual(instruction or '', forwarded['instruction'])
                self.assertEqual(10, forwarded['questionCount'])
                self.assertEqual([25], forwarded['cloIds'])
            for invalid in (dict(instruction=42), dict(questionCount=46), dict(cloIds=[26])):
                before = registry.start.call_count
                self.assertIn(client.post(url, json=payload | invalid, headers=headers).status_code, (400, 422))
                self.assertEqual(before, registry.start.call_count)
        ns['_generate'].assert_not_called()

    def pipeline(self, valid_limit=None):
        """Execute the actual generation loop with all external I/O substituted."""
        module = ast.parse(Path("main.py").read_text(encoding="utf-8"))
        selected = [node for node in module.body if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef))
                    and node.name in ("clean_json", "normalize", "_generate")]
        calls = []
        class Splitter:
            def __init__(self, **kwargs):
                pass
            def split_documents(self, docs):
                return docs
        class Store:
            def similarity_search(self, query, count):
                return [SimpleNamespace(page_content="Synthetic context; no uploaded data")]
        class Client:
            def __init__(self, **kwargs):
                pass
            async def __aenter__(self):
                return self
            async def __aexit__(self, *args):
                pass
        async def model(client, prompt):
            calls.append(prompt)
            if valid_limit is not None and len(calls) > valid_limit:
                return '{"questions":[]}'
            return json.dumps({"questions": [{"content": "Synthetic question " + str(len(calls)),
                "options": ["one", "two", "three", "four"], "correctIndex": 0, "explanation": "Synthetic"}]})
        async def duplicate_report(course_id, content, vectors):
            return {"suspectedDuplicate": False, "bankMatches": [], "maxBatchSimilarity": 0.0}, [0.1, 0.2]
        quiet = lambda *args, **kwargs: None
        namespace = dict(json=json, re=re, asyncio=asyncio, Unit=SimpleNamespace,
            GenerationRequest=SimpleNamespace, MAX_QUESTIONS=45, MAX_CHARS=120000,
            DUPLICATE_MAX_ATTEMPTS=3, QUESTIONBANK_DSN="not-a-connection",
            OLLAMA_URL="not-an-endpoint", EMBED_MODEL="unchanged-test-placeholder",
            HTTPException=HTTPException, RecursiveCharacterTextSplitter=Splitter,
            LCDocument=SimpleNamespace, OllamaEmbeddings=lambda **kwargs: object(),
            FAISS=SimpleNamespace(from_documents=lambda docs, embeddings: Store()),
            httpx=SimpleNamespace(AsyncClient=Client, Timeout=lambda *args, **kwargs: None, HTTPError=RuntimeError),
            logger=SimpleNamespace(info=quiet, warning=quiet, exception=quiet),
            ollama_generate=model, _duplicate_report=duplicate_report)
        exec(compile(ast.Module(body=selected, type_ignores=[]), "generation_loop", "exec"), namespace)
        def request(count):
            return SimpleNamespace(courseId=1, sourceText="Synthetic document text. " * 10,
                instruction="", units=[SimpleNamespace(name="Unit", chapterId=2, cloId=3, nb=count, th=0, vd=0)])
        return namespace["_generate"], request, calls

    async def test_actual_generation_loop_accepts_1_10_30_45_and_rejects_46(self):
        for count in (1, 10, 30, 45):
            generate, request, calls = self.pipeline()
            questions = await generate(request(count))
            self.assertEqual(len(questions), count)
            self.assertEqual(len(calls), count)
            self.assertTrue(all(q["chapterId"] == 2 and q["cloId"] == 3 and q["bloom"] == "remember" for q in questions))
        generate, request, calls = self.pipeline()
        with self.assertRaises(HTTPException) as rejected:
            await generate(request(46))
        self.assertEqual(rejected.exception.status_code, 400)
        self.assertFalse(calls)

    async def test_actual_generation_loop_returns_only_valid_partial_questions(self):
        generate, request, calls = self.pipeline(valid_limit=3)
        checkpoints = []
        questions = await generate(request(5), lambda accepted: checkpoints.append(len(accepted)))
        self.assertEqual(len(questions), 3)
        self.assertEqual(checkpoints, [1, 2, 3])
        self.assertEqual(len(calls), 9)

    async def test_duplicate_token_starts_model_only_once(self):
        registry = GenerationRegistry()
        done = asyncio.Event()
        calls = []
        async def generate(progress, cancelled):
            calls.append(1)
            await done.wait()
            return [{"content": "accepted"}]
        await registry.start("token", {"count": 1}, generate)
        await registry.start("token", {"count": 1}, generate)
        await asyncio.sleep(0)
        self.assertEqual(len(calls), 1)
        with self.assertRaises(ValueError):
            await registry.start("token", {"count": 2}, generate)
        done.set()
        await registry.jobs["token"].task
        self.assertEqual(registry.status("token")["status"], "succeeded")

    async def test_failure_keeps_partial_accepted_results(self):
        registry = GenerationRegistry()
        async def generate(progress, cancelled):
            progress([{"content": "valid"}])
            raise RuntimeError("provider failed")
        await registry.start("partial", {}, generate)
        await registry.jobs["partial"].task
        result = registry.status("partial")
        self.assertEqual(result["status"], "failed")
        self.assertEqual(len(result["questions"]), 1)

    async def test_provider_timeout_keeps_checkpoint_and_does_not_replay(self):
        registry = GenerationRegistry()
        calls = []
        async def generate(progress, cancelled):
            calls.append(True)
            progress([{'content': 'accepted before timeout'}])
            raise TimeoutError('synthetic upstream timeout')
        await registry.start('timeout', {'questionCount': 10}, generate)
        await registry.jobs['timeout'].task
        again = await registry.start('timeout', {'questionCount': 10}, generate)
        self.assertEqual('failed', again['status'])
        self.assertEqual(1, len(again['questions']))
        self.assertEqual(1, len(calls))

    async def test_cancel_waits_for_current_call_and_preserves_checkpoints(self):
        registry = GenerationRegistry()
        waiting = asyncio.Event()
        finish = asyncio.Event()
        async def generate(progress, cancelled):
            progress([{"content": "accepted before cancel"}])
            waiting.set()
            await finish.wait()
            self.assertTrue(cancelled())
            return [{"content": "accepted before cancel"}]
        await registry.start("cancel", {}, generate)
        await waiting.wait()
        self.assertEqual(registry.cancel("cancel")["status"], "running")
        finish.set()
        await registry.jobs["cancel"].task
        self.assertEqual(registry.status("cancel")["status"], "cancelled")
        self.assertEqual(len(registry.status("cancel")["questions"]), 1)

    async def test_unknown_token_is_not_restarted_by_status_or_cancel(self):
        registry = GenerationRegistry()
        with self.assertRaises(KeyError):
            registry.status("missing")
        with self.assertRaises(KeyError):
            registry.cancel("missing")
        self.assertFalse(registry.jobs)

    async def test_internal_key_is_required_without_loading_model(self):
        module = ast.parse(Path("main.py").read_text(encoding="utf-8"))
        guard = next(node for node in module.body if isinstance(node, ast.FunctionDef) and node.name == "require_internal")
        namespace = {"HTTPException": HTTPException, "Header": Header, "hmac": hmac, "INTERNAL_KEY": "test-internal-key-at-least-32-characters"}
        exec(compile(ast.Module(body=[guard], type_ignores=[]), "internal_guard", "exec"), namespace)
        with self.assertRaises(HTTPException) as rejected:
            namespace["require_internal"]("wrong")
        self.assertEqual(rejected.exception.status_code, 403)
        self.assertIsNone(namespace["require_internal"](namespace["INTERNAL_KEY"]))
        namespace["INTERNAL_KEY"] = ""
        with self.assertRaises(HTTPException) as missing:
            namespace["require_internal"]("")
        self.assertEqual(missing.exception.status_code, 503)

    async def test_job_http_auth_503_403_and_restart_404(self):
        tree = ast.parse(Path('main.py').read_text(encoding='utf-8'))
        nodes = [n for n in tree.body if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef))
                 and n.name in ('require_internal', 'require_registry', 'credit_job_status', 'cancel_credit_job')]
        namespace = dict(app=FastAPI(), Header=Header, HTTPException=HTTPException,
            Depends=Depends, hmac=hmac, UUID=UUID, INTERNAL_KEY='', registry=GenerationRegistry())
        exec(compile(ast.Module(body=nodes, type_ignores=[]), 'actual_job_routes', 'exec'), namespace)
        with TestClient(namespace['app']) as client:
            url='/credits/jobs/00000000-0000-0000-0000-000000000001'
            missing=client.get(url)
            self.assertEqual(503, missing.status_code)
            self.assertEqual('AI_INTERNAL_KEY must be configured before generation', missing.json()['detail'])
            namespace['INTERNAL_KEY']='test-only-internal-key-at-least-32-characters'
            self.assertEqual(403,client.get(url).status_code)
            # A fresh registry after restart cannot recreate the old job through GET.
            self.assertEqual(404,client.get(url,headers={'X-AI-Internal-Key':namespace['INTERNAL_KEY']}).status_code)
            self.assertEqual(404,client.post(url+'/cancel',headers={'X-AI-Internal-Key':namespace['INTERNAL_KEY']}).status_code)
            self.assertFalse(namespace['registry'].jobs)


if __name__ == "__main__":
    unittest.main()
