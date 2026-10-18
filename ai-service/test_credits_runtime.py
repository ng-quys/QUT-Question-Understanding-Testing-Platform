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
from credits_runtime import GenerationRegistry


class CreditsRuntimeTests(unittest.IsolatedAsyncioTestCase):
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
                 and n.name in ('require_internal', 'credit_job_status', 'cancel_credit_job')]
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
