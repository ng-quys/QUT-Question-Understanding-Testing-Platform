import json
import ast
from pathlib import Path
import unittest
from types import SimpleNamespace as NS
from unittest.mock import AsyncMock
from pydantic import BaseModel, Field, ValidationError, field_validator
from fastapi import HTTPException
from clo_generation import allocate_clos, normalize_clo, generate_clo_questions, evidence_match, validation_reason

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
                    cloId=1, evidenceChunkId='chunk-1', evidenceQuote=CONTEXT) | updates

    def test_allocation_is_deterministic_weighted_and_exact(self):
        scores = {1: .95, 2: .5, 3: .1}
        self.assertEqual(allocate_clos(scores,10), {1:7,2:3})
        self.assertEqual(allocate_clos(dict(reversed(list(scores.items()))),10),{1:7,2:3})
        self.assertEqual(allocate_clos(scores,1),{1:1})
        self.assertEqual(allocate_clos({1:.1,2:.2},10),{})
        for count in (1,10,45):
            self.assertEqual(sum(allocate_clos(scores,count).values()),count)

    def test_validation_rejects_wrong_clo_bloom_evidence_and_structure(self):
        legacy=self.question();legacy.pop('evidenceChunkId')
        valid=normalize_clo(json.dumps({'questions':[legacy]}),1,CONTEXT)
        self.assertEqual(valid['bloom'],'understand')
        for updates in ({'cloId':2},{'bloom':'analyze'},{'bloom':None},{'evidenceQuote':'Nội dung không xuất hiện trong tài liệu'},
                        {'options':['a','A','b','c']},{'correctIndex':True},{'explanation':''}):
            candidate=self.question(**updates);candidate.pop('evidenceChunkId',None)
            self.assertIsNone(normalize_clo(json.dumps({'questions':[candidate]}),1,CONTEXT))
        self.assertIsNone(normalize_clo(json.dumps({'questions':[legacy,legacy]}),1,CONTEXT))

    def test_regression_nine_evidence_source_cases(self):
        false_rejections=[
            ('Khi tạo thư mục chia sẻ: Sử dụng quyền truy cập hạn chế nhất có thể ✓ Tránh gán quyền tới người dùng riêng lẻ, sử dụng nhóm bất cứ khi nào có thể',
             'Sử dụng quyền truy cập hạn chế nhất có thể. Tránh gán quyền tới người dùng riêng lẻ, sử dụng nhóm bất cứ khi nào có thể'),
            ('Sử dụng nhóm Authenticated Users và loại bỏ nhóm Everyone từ danh sách quyền chia sẻ (Share Permission) ✓ Xác minh lại quyền',
             '✓ Sử dụng nhóm Authenticated Users và loại bỏ nhóm Everyone từ danh sách quyền chia sẻ (Share Permission)'),
            ('Khi tạo thư mục chia sẻ cần lưu ý: Sử dụng quyền truy cập hạn chế nhất có thể ✓ Tránh gán quyền tới người dùng riêng lẻ, sử dụng nhóm bất cứ khi nào có thể',
             'Khi tạo thư mục chia sẻ cần lưu ý: Sử dụng quyền truy cập hạn chế nhất có thể. Tránh gán quyền tới người dùng riêng lẻ, sử dụng nhóm bất cứ khi nào có thể.'),
            ('Khi gán cho một nhóm quyền ‘Full Control’ phải cân nhắc kỹ trước khi áp dụng',
             "Khi gán cho một nhóm quyền 'Full Control' phải cân nhắc kỹ"),
        ]
        wrong_sources=[
            ('Tránh gán quyền tới người dùng riêng lẻ, sử dụng nhóm bất cứ khi nào có thể',
             '避免 gán quyền tới người dùng riêng lẻ, sử dụng nhóm bất cứ khi nào có thể'),
            ('Dùng công cụ giao diện đồ họa để duyệt thư mục chia sẻ trên mạng Workgroup hoặc Domain',
             'Vận dụng kiến thức có được để sử dụng, khai thác và bảo trì hệ thống mạng máy tính'),
            ('Quyền chia sẻ mặc định là Full Control đối với người dùng được chia sẻ',
             'Có tinh thần hợp tác trong việc học tập môn công nghệ thông tin'),
            ('Dữ liệu quan trọng phải luôn luôn có sẵn và tổ chức phải tuân theo yêu cầu mới nhất',
             'Có thái độ khách quan, trung thực; có tác phong tỉ mỉ, cẩn thận, chính xác'),
            ('Truy cập thư mục chia sẻ thông qua việc ánh xạ ổ đĩa mạng',
             'Vận dụng kiến thức để bảo trì hệ thống hiệu quả theo chuẩn đầu ra môn học'),
        ]
        for context,quote in false_rejections:
            with self.subTest(kind='canonical',quote=quote[:30]):
                match=evidence_match(quote,[{'id':'chunk-7','text':context}],'chunk-7')
                self.assertTrue(match['matched']);self.assertEqual('canonical_exact',match['matchType'])
                self.assertIn('chunk-7',match['chunkId'])
        for context,quote in wrong_sources:
            with self.subTest(kind='wrong-source',quote=quote[:30]):
                self.assertFalse(evidence_match(quote,[{'id':'chunk-7','text':context}],'chunk-7')['matched'])
                self.assertEqual('validation:evidence_source',validation_reason(self.question(evidenceQuote=quote,evidenceChunkId='chunk-7'),1,[{'id':'chunk-7','text':context}]))

    def test_chunk_scope_legacy_compatibility_and_technical_symbols(self):
        technical=r'C++ khác C#; máy chủ IP 192.168.1.10 chạy phiên bản v2.0; toán tử != được dùng trong C:\\Temp\\policy.txt.'
        chunks=[{'id':'technical','text':technical}]
        self.assertEqual('exact',evidence_match(technical,chunks,'technical')['matchType'])
        for changed in ('C+ khác C#; máy chủ IP 192.168.1.10 chạy phiên bản v2.0; toán tử != được dùng trong C:\\Temp\\policy.txt.',
                        r'C++ khác C#; máy chủ IP 192.168.1.11 chạy phiên bản v2.0; toán tử != được dùng trong C:\\Temp\\policy.txt.',
                        r'C++ khác C#; máy chủ IP 192.168.1.10 chạy phiên bản v2.1; toán tử != được dùng trong C:\\Temp\\policy.txt.',
                        r'C++ khác C#; máy chủ IP 192.168.1.10 chạy phiên bản v2.0; toán tử == được dùng trong C:\\Temp\\policy.txt.'):
            self.assertFalse(evidence_match(changed,chunks,'technical')['matched'])
        two=[{'id':'a','text':'Alpha là phần đầu của bằng chứng kỹ thuật.'},{'id':'b','text':'Beta là phần cuối và không được phép ghép.'}]
        self.assertFalse(evidence_match('Alpha là phần đầu của bằng chứng kỹ thuật Beta là phần cuối',two)['matched'])
        self.assertFalse(evidence_match(technical,chunks,'missing-chunk')['matched'])
        self.assertTrue(evidence_match(technical,technical)['matched'])  # old jobs have no chunk ID

    def test_alias_failure_reasons_and_no_cross_chunk_join(self):
        chunks=[
            {'alias':'chunk-1','id':'index-a:7','text':'Alpha là phần đầu của bằng chứng kỹ thuật.'},
            {'alias':'chunk-2','id':'index-a:8','text':'Beta là phần cuối và không được phép ghép.'},
        ]
        cases=[
            ('empty_context', evidence_match('Bằng chứng đủ dài để kiểm tra.',[], 'chunk-1',require_alias=True)),
            ('empty_quote', evidence_match('',chunks,'chunk-1',require_alias=True)),
            ('declared_chunk_not_found', evidence_match(chunks[0]['text'],chunks,'index-a',require_alias=True)),
            ('declared_chunk_not_found', evidence_match(chunks[0]['text'],chunks,None,require_alias=True)),
            ('quote_not_in_declared_chunk', evidence_match(chunks[0]['text'],chunks,'chunk-2',require_alias=True)),
            ('quote_not_in_declared_chunk', evidence_match('Alpha là phần đầu của bằng chứng kỹ thuật Beta là phần cuối',chunks,'chunk-1',require_alias=True)),
        ]
        for expected,result in cases:
            with self.subTest(expected=expected):
                self.assertFalse(result['matched']);self.assertEqual(expected,result['failureReason'])
        matched=evidence_match(chunks[0]['text'],chunks,'chunk-1',require_alias=True)
        self.assertEqual(('exact','chunk-1','index-a:7'),
                         (matched['matchType'],matched['chunkAlias'],matched['chunkId']))

    def test_job28_raw_responses_require_alias_then_source_match_in_isolated_fixture(self):
        """This synthetic fixture is not represented as the historical Job #28 context."""
        index_id='c87990e2-2126-4cd2-a726-79a945d35448'
        contexts=[
            {'alias':'chunk-1','id':index_id+':13','text':'Sử dụng quyền truy cập hạn chế nhất có thể. Sử dụng nhóm Authenticated Users và loại bỏ nhóm Everyone từ danh sách quyền chia sẻ.'},
            {'alias':'chunk-2','id':index_id+':18','text':'Thời gian làm mới: Sau mỗi 90 phút.'},
            {'alias':'chunk-3','id':index_id+':22','text':'• Quản lý lưu trữ bằng FSRM (File Server Resource Manager).'},
        ]
        quotes=[
            ('chunk-2','Thời gian làm mới: Sau mỗi 90 phút'),
            ('chunk-1','Sử dụng nhóm Authenticated Users và loại bỏ nhóm Everyone từ danh sách'),
            ('chunk-3','• Quản lý lưu trữ bằng FSRM (File Server Resource Manager)'),
            ('chunk-2','Thời gian làm mới: Sau mỗi 90 phút'),
            ('chunk-1','Sử dụng quyền truy cập hạn chế nhất có thể'),
            ('chunk-3','Quản lý lưu trữ bằng FSRM (File Server Resource Manager)'),
            ('chunk-2','Thời gian làm mới: Sau mỗi 90 phút'),
            ('chunk-1','Sử dụng quyền truy cập hạn chế nhất có thể'),
            ('chunk-3','Quản lý lưu trữ bằng FSRM (File Server Resource Manager)'),
        ]
        raw_results=[];aliased_results=[]
        for alias,quote in quotes:
            raw_results.append(evidence_match(quote,contexts,index_id,require_alias=True))
            aliased_results.append(evidence_match(quote,contexts,alias,require_alias=True))
        self.assertEqual(9,sum(not result['matched'] for result in raw_results))
        self.assertTrue(all(result['failureReason']=='declared_chunk_not_found' for result in raw_results))
        self.assertEqual(9,sum(result['matched'] for result in aliased_results))
        self.assertTrue(all(result['matchType'] in ('exact','canonical_exact') for result in aliased_results))

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
            expected=list(range(5,count+1,5))
            if not expected or expected[-1]!=count:expected.append(count)
            self.assertEqual(checkpoints,expected)

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
