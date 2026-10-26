import asyncio
import json
import os
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace as NS
from unittest.mock import AsyncMock, patch
from clo_generation import generate_clo_questions
from inference_metrics import CURRENT, RunMetrics, inference_batch_size, measured_generate
from credits_runtime import GenerationRegistry

TEXT='DNS chuyển đổi tên miền thành địa chỉ IP trong hệ thống mạng.'


def question(n,**values):
    return dict(content=f'Câu hỏi mạng số {n}',options=['a','b','c','d'],correctIndex=0,
        explanation='Giải thích có căn cứ.',cloId=1,bloom='understand',evidenceChunkId='chunk-1',evidenceQuote=TEXT)|values


class InferenceBatchTests(unittest.IsolatedAsyncioTestCase):
    async def pipeline(self,responses,count=3,mode=3,initial=None,duplicate=None):
        calls=[];progress=[];metrics=RunMetrics();token=CURRENT.set(metrics)
        iterator=iter(responses)
        async def model(client,prompt):
            calls.append(prompt)
            return next(iterator,'{"questions":[]}')
        store=NS(similarity_search=lambda *a:[NS(page_content=TEXT,metadata={'similarity':.9})])
        embeddings=NS(embed_query=lambda t:[1,0],embed_documents=lambda t:[[1,0] for _ in t])
        try:
            result=await generate_clo_questions(NS(courseId=1,questionCount=count,
                selectedClos=[NS(id=1,code='CLO1',description='DNS')]),store,embeddings,
                model,duplicate or AsyncMock(return_value=({'suspectedDuplicate':False},[1,0])),
                3,lambda qs:progress.append(len(qs)),lambda:False,5,initial,mode)
            return result,calls,progress,metrics
        finally:CURRENT.reset(token)

    async def test_partial_batch_keeps_two_and_retries_one_only(self):
        response=lambda qs:json.dumps({'questions':qs},ensure_ascii=False)
        result,calls,_,metrics=await self.pipeline([response([question(1),question(2),question(3,correctIndex=9)]),response([question(4)])])
        self.assertEqual(3,len(result));self.assertEqual(2,len(calls))
        self.assertIn('Tạo đúng 1 câu',calls[1]);self.assertEqual(1,metrics.retries)
        self.assertEqual(['accepted','accepted','validation:correctIndex','accepted'],[q['decision'] for q in metrics.questions])

    async def test_duplicates_in_one_response_are_flagged_for_teacher_review(self):
        first=json.dumps({'questions':[question(1),question(1),question(2),question(99)]})
        result,_,_,metrics=await self.pipeline([first,json.dumps({'questions':[question(3)]})])
        self.assertEqual(3,len(result))
        self.assertIn('over_limit',[q['decision'] for q in metrics.questions])
        self.assertIn('duplicate_exact_batch',[q['decision'] for q in metrics.questions])
        self.assertEqual('duplicate_exact_batch',result[1]['duplicateWarning']['matchType'])

    async def test_malformed_response_retries_safely_and_retains_prior(self):
        result,_,_,metrics=await self.pipeline(['not json',json.dumps({'questions':[question(1),question(2),question(3)]})])
        self.assertEqual(3,len(result));self.assertEqual(1,metrics.malformed_responses)

    async def test_checkpoint_five_is_independent_of_inference_three_and_resume(self):
        responses=[json.dumps({'questions':[question(i) for i in group]}) for group in [[3,4,5],[6,7,8],[9]]]
        result,calls,checkpoints,_=await self.pipeline(responses,count=9,initial=[question(1),question(2)])
        self.assertEqual(9,len(result));self.assertEqual([5,9],checkpoints);self.assertEqual(3,len(calls))

    async def test_semantic_duplicate_metadata_is_retained_for_review(self):
        match={'questionId':180,'content':'Câu đã có','similarity':.9829,'matchType':'duplicate_semantic_bank','source':'question_bank_embedding','threshold':.85}
        duplicate=AsyncMock(side_effect=[({'suspectedDuplicate':True,'duplicateMatch':match},[1,0]),
            ({'suspectedDuplicate':False},[0,1]),({'suspectedDuplicate':False},[0,1])])
        result,_,_,metrics=await self.pipeline([json.dumps({'questions':[question(1),question(2),question(3)]})],duplicate=duplicate)
        self.assertEqual(3,len(result));self.assertEqual('duplicate_semantic_bank',metrics.questions[0]['decision'])
        self.assertEqual(180,result[0]['duplicateWarning']['questionId'])

    async def test_one_mode_keeps_exactly_one_response_contract(self):
        result,_,_,_=await self.pipeline([json.dumps({'questions':[question(1),question(2)]}),json.dumps({'questions':[question(3)]})],count=1,mode=1)
        self.assertEqual([question(3)['content']],[q['content'] for q in result])

    async def test_evidence_retry_uses_chunk_feedback_and_restores_context_quote(self):
        source='Sử dụng quyền hạn chế nhất ✓ Tránh gán quyền trực tiếp cho từng người dùng.'
        altered='Sử dụng quyền hạn chế nhất. Tránh gán quyền trực tiếp cho từng người dùng.'
        base=question(1,evidenceChunkId='chunk-1',evidenceQuote='Nội dung mô tả CLO không phải nguồn tài liệu')
        valid=question(2,evidenceChunkId='chunk-1',evidenceQuote=altered)
        calls=[];responses=iter([json.dumps({'questions':[base]},ensure_ascii=False),json.dumps({'questions':[valid]},ensure_ascii=False)])
        async def model(client,prompt):calls.append(prompt);return next(responses)
        store=NS(similarity_search=lambda *a:[NS(page_content=source,metadata={'similarity':.9})])
        embeddings=NS(embed_query=lambda t:[1,0],embed_documents=lambda t:[[1,0] for _ in t])
        metrics=RunMetrics();token=CURRENT.set(metrics)
        try:
            result=await generate_clo_questions(NS(courseId=1,questionCount=1,selectedClos=[NS(id=1,code='CLO1',description='DNS')]),
                store,embeddings,model,AsyncMock(return_value=({'suspectedDuplicate':False},[1,0])),3,lambda _:None,lambda:False)
        finally:CURRENT.reset(token)
        self.assertEqual(1,len(result));self.assertIn('✓',result[0]['evidenceQuote'])
        self.assertIn('[CHUNK chunk-1]',calls[0]);self.assertIn('evidence_source',calls[1]);self.assertIn('không ghép hai chunk',calls[1])
        self.assertEqual('missing',metrics.questions[0]['evidenceMatchType'])
        self.assertEqual('quote_not_in_declared_chunk',metrics.questions[0]['evidenceFailureReason'])
        self.assertEqual('canonical_exact',metrics.questions[1]['evidenceMatchType'])
        self.assertEqual('chunk-1',metrics.questions[1]['evidenceChunkAlias'])
        self.assertEqual('chunk-1',metrics.questions[1]['evidenceChunkId'])
        self.assertRegex(metrics.questions[1]['contextFingerprint'],r'^[0-9a-f]{64}$')

    async def test_call_local_alias_and_sanitized_retrieval_manifest_for_mode_three(self):
        response=json.dumps({'questions':[question(1),question(2),question(3)]},ensure_ascii=False)
        calls=[]
        async def model(client,prompt):calls.append(prompt);return response
        store=NS(similarity_search=lambda *a:[NS(page_content=TEXT,metadata={
            'similarity':.91,'indexId':'11111111-1111-1111-1111-111111111111','chunkOrder':7})])
        embeddings=NS(embed_query=lambda t:[1,0],embed_documents=lambda t:[[1,0] for _ in t])
        metrics=RunMetrics();token=CURRENT.set(metrics)
        try:
            result=await generate_clo_questions(NS(courseId=1,questionCount=3,
                selectedClos=[NS(id=1,code='CLO1',description='DNS')]),store,embeddings,model,
                AsyncMock(return_value=({'suspectedDuplicate':False},[1,0])),3,lambda _:None,lambda:False,5,None,3)
        finally:CURRENT.reset(token)
        self.assertEqual(3,len(result));self.assertIn('[CHUNK chunk-1]',calls[0])
        self.assertNotIn('11111111-1111-1111-1111-111111111111',calls[0])
        manifest=metrics.retrieval_manifests[0]
        self.assertEqual({'alias':'chunk-1','id':'11111111-1111-1111-1111-111111111111:7','similarity':.91},manifest['chunks'][0])
        self.assertNotIn('text',manifest['chunks'][0]);self.assertNotIn(TEXT,json.dumps(manifest,ensure_ascii=False))
        self.assertRegex(manifest['contextFingerprint'],r'^[0-9a-f]{64}$')

    async def test_semantic_support_still_rejects_after_exact_source_match(self):
        candidate=question(1,evidenceChunkId='chunk-1')
        response=json.dumps({'questions':[candidate]},ensure_ascii=False)
        store=NS(similarity_search=lambda *a:[NS(page_content=TEXT,metadata={'similarity':.9})])
        def embed(text):return [0,1] if str(text).startswith('DNS chuyển đổi') else [1,0]
        embeddings=NS(embed_query=embed,embed_documents=lambda texts:[[1,0] for _ in texts])
        metrics=RunMetrics();token=CURRENT.set(metrics)
        try:
            result=await generate_clo_questions(NS(courseId=1,questionCount=1,selectedClos=[NS(id=1,code='CLO1',description='DNS')]),
                store,embeddings,AsyncMock(return_value=response),AsyncMock(),2,lambda _:None,lambda:False)
        finally:CURRENT.reset(token)
        self.assertEqual([],result);self.assertEqual(['support','support'],[item['decision'] for item in metrics.questions])
        self.assertTrue(all(item['evidenceMatchType']=='exact' for item in metrics.questions))

    def test_configuration_defaults_and_invalid_values(self):
        with patch.dict(os.environ,{},clear=True):self.assertEqual(1,inference_batch_size())
        for value in ['0','2','4','abc','',True]:
            with self.assertRaises(ValueError):inference_batch_size(value)

    async def test_mode_persists_and_cannot_change_same_job(self):
        with tempfile.TemporaryDirectory() as tmp:
            path=Path(tmp)/'registry.json';reg=GenerationRegistry(path)
            await reg.start('t',{'questionCount':3,'inferenceBatchSize':3},AsyncMock(return_value=[question(1)]))
            await reg.jobs['t'].task
            reloaded=GenerationRegistry(path)
            self.assertEqual(3,reloaded.jobs['t'].inference_batch_size)
            with self.assertRaisesRegex(ValueError,'cannot change'):
                await reg.start('t',{'questionCount':3,'inferenceBatchSize':1},AsyncMock())

    async def test_ollama_raw_timings_collected_without_changing_options(self):
        response=NS(raise_for_status=lambda:None,json=lambda:{'response':'{}','eval_count':7,'eval_duration':1_000_000_000})
        client=NS(post=AsyncMock(return_value=response));metrics=RunMetrics();token=CURRENT.set(metrics)
        try:
            await measured_generate(client,'http://fixture','qwen2.5:7b','prompt',{'num_ctx':2048,'num_predict':850})
        finally:CURRENT.reset(token)
        self.assertEqual(7,metrics.inferences[0]['eval_count'])
        self.assertEqual({'num_ctx':2048,'num_predict':850},client.post.call_args.kwargs['json']['options'])

    def test_invalid_persisted_mode_does_not_erase_registry(self):
        with tempfile.TemporaryDirectory() as tmp:
            path=Path(tmp)/'registry.json'
            data={'registryId':'fixture','jobs':{'x':{'fingerprint':'fixture','state':'paused','inferenceBatchSize':2}}}
            path.write_text(json.dumps(data),encoding='utf-8');before=path.read_bytes()
            with self.assertRaisesRegex(RuntimeError,'left unchanged'):GenerationRegistry(path)
            self.assertEqual(before,path.read_bytes())


if __name__=='__main__':unittest.main()
