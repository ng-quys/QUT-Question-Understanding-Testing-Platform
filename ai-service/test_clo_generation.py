import json
import ast
from pathlib import Path
import unittest
from types import SimpleNamespace as NS
from unittest.mock import AsyncMock
from pydantic import BaseModel, Field, ValidationError, field_validator
from fastapi import HTTPException
from clo_generation import allocate_clos, normalize_clo, generate_clo_questions

CONTEXT = 'DNS chuyển đổi tên miền thành địa chỉ IP trong hệ thống mạng.'


class CloGenerationTests(unittest.IsolatedAsyncioTestCase):
    def test_actual_request_contract_rejects46_empty_or_mismatched_clos(self):
        tree=ast.parse(Path('main.py').read_text(encoding='utf-8'))
        selected=[node for node in tree.body if isinstance(node,(ast.ClassDef,ast.FunctionDef))
                  and node.name in ('Unit','GenerationRequest','SelectedClo','requested_count')]
        ns=dict(BaseModel=BaseModel,Field=Field,field_validator=field_validator,HTTPException=HTTPException,MAX_QUESTIONS=45)
        exec(compile(ast.Module(body=selected,type_ignores=[]),'request_contract','exec'),ns)
        Request=ns['GenerationRequest'];Request.model_rebuild(_types_namespace=ns)
        source=dict(courseId=1,sourceText=CONTEXT,questionCount=1,cloIds=[1],selectedClos=[dict(id=1,code='CLO1',description='DNS')])
        self.assertEqual(ns['requested_count'](Request(**source)),1)
        with self.assertRaises(ValidationError):Request(**(source|dict(questionCount=46)))
        for change in (dict(cloIds=[]),dict(cloIds=[2]),dict(cloIds=[1,1])):
            with self.assertRaises(HTTPException):ns['requested_count'](Request(**(source|change)))
    def question(self, **updates):
        return dict(content='DNS thực hiện nhiệm vụ gì?', options=['a','b','c','d'], correctIndex=0,
                    explanation='Dựa trên chức năng DNS trong tài liệu.', bloom='understand',
                    cloId=1, evidenceQuote=CONTEXT) | updates

    def test_allocation_is_deterministic_weighted_and_exact(self):
        scores = {1: .95, 2: .5, 3: .1}
        self.assertEqual(allocate_clos(scores,10), {1:7,2:3})
        self.assertEqual(allocate_clos(dict(reversed(list(scores.items()))),10),{1:7,2:3})
        self.assertEqual(allocate_clos(scores,1),{1:1})
        self.assertEqual(allocate_clos({1:.1,2:.2},10),{})
        for count in (1,10,45):
            self.assertEqual(sum(allocate_clos(scores,count).values()),count)

    def test_validation_rejects_wrong_clo_bloom_evidence_and_structure(self):
        valid=normalize_clo(json.dumps({'questions':[self.question()]}),1,CONTEXT)
        self.assertEqual(valid['bloom'],'understand')
        for updates in ({'cloId':2},{'bloom':'analyze'},{'bloom':None},{'evidenceQuote':'Nội dung không xuất hiện trong tài liệu'},
                        {'options':['a','A','b','c']},{'correctIndex':True},{'explanation':''}):
            self.assertIsNone(normalize_clo(json.dumps({'questions':[self.question(**updates)]}),1,CONTEXT))
        self.assertIsNone(normalize_clo(json.dumps({'questions':[self.question(),self.question()]}),1,CONTEXT))

    async def run_pipeline(self,count,limit=None,unsupported=False,ids=(1,2)):
        class Store:
            def similarity_search(self,query,n): return [NS(page_content=CONTEXT)]
        class Embeddings:
            def embed_query(self,text): return [1,0] if not unsupported else [-1,0]
            def embed_documents(self,texts): return [[1,0] for _ in texts]
        requests=[]
        async def model(client,prompt):
            requests.append(prompt)
            if limit is not None and len(requests)>limit: return '{"questions":[]}'
            cid=2 if 'cloId=2' in prompt else 1
            return json.dumps({'questions':[self.question(content=f'Câu hỏi DNS {len(requests)}',cloId=cid,
                                                       bloom=['remember','understand','apply'][len(requests)%3])]})
        duplicate=AsyncMock(return_value=({'suspectedDuplicate':False},[1,0]))
        checkpoints=[]
        request=NS(questionCount=count,courseId=9,selectedClos=[NS(id=i,code=f'CLO{i}',description='Giải thích DNS') for i in ids])
        result=await generate_clo_questions(request,Store(),Embeddings(),model,duplicate,3,
                                            lambda qs:checkpoints.append(len(qs)),lambda:False)
        return result,requests,checkpoints,duplicate

    async def test_one_document_multiple_clos_1_10_45(self):
        for count in (1,10,45):
            result,calls,checkpoints,duplicate=await self.run_pipeline(count)
            self.assertEqual(len(result),count)
            self.assertEqual(duplicate.await_count,count)
            if count>1:self.assertEqual({q['cloId'] for q in result},{1,2})
            self.assertEqual(checkpoints,list(range(1,count+1)))

    async def test_single_document_single_clo_single_question(self):
        result,_,_,_=await self.run_pipeline(1,ids=(1,))
        self.assertEqual(len(result),1);self.assertEqual(result[0]['cloId'],1)

    async def test_no_supported_clo_does_not_call_qwen_or_duplicate_checker(self):
        result,calls,_,duplicate=await self.run_pipeline(10,unsupported=True)
        self.assertEqual(result,[]);self.assertEqual(calls,[]);duplicate.assert_not_awaited()

    async def test_partial_response_preserves_valid_questions(self):
        result,_,checkpoints,_=await self.run_pipeline(10,limit=7)
        self.assertEqual(len(result),7);self.assertEqual(checkpoints[-1],7)


if __name__=='__main__': unittest.main()
