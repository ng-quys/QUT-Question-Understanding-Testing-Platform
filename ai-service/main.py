"""ExamFlow RAG microservice adapted from he_thong_AI_sinh_de/main.py.
No legacy pickle index is loaded; each request gets its own in-memory FAISS index.
"""
import json
import asyncio
import logging
import math
import hmac
from uuid import UUID
from credits_runtime import GenerationRegistry
from clo_generation import generate_clo_questions
from durable_telemetry import ExcelTelemetry
from inference_metrics import inference_batch_size, measured_generate
from document_cache import DocumentCache,DocumentRef,ExactDocumentStore,from_environment,document_metrics_snapshot
from hierarchical_chunker import HierarchyAwareStore, chunk_text, validate_strategy
import os
import re
from io import BytesIO
from pathlib import Path

import httpx
import psycopg2
from dotenv import load_dotenv
from docx import Document
from fastapi import FastAPI, File, HTTPException, UploadFile, Depends, Header
from fastapi.middleware.cors import CORSMiddleware
from langchain_community.vectorstores import FAISS
from langchain_ollama import OllamaEmbeddings
from langchain_core.documents import Document as LCDocument
from langchain_text_splitters import RecursiveCharacterTextSplitter
from pydantic import BaseModel, Field, field_validator
from pypdf import PdfReader

load_dotenv()
logger = logging.getLogger('examflow.duplicate')

OLLAMA_URL = os.getenv('OLLAMA_URL', 'http://127.0.0.1:11434').rstrip('/')
MODEL = os.getenv('OLLAMA_MODEL', 'qwen2.5:7b')
EMBED_MODEL = os.getenv('OLLAMA_EMBED_MODEL', 'nomic-embed-text')
CHUNKING_STRATEGY = validate_strategy(os.getenv('AI_CHUNKING_STRATEGY', 'fixed'))
INFERENCE_BATCH_SIZE = inference_batch_size()
SAVED_DOCUMENTS_ENABLED = os.getenv('AI_SAVED_DOCUMENTS_ENABLED', 'false').strip().lower() == 'true'
MAX_QUESTIONS = min(45, int(os.getenv('AI_CREDITS_MAX_QUESTIONS', '45')))
INTERNAL_KEY = os.getenv('AI_INTERNAL_KEY', '')
if len(INTERNAL_KEY) < 32:
    logger.warning('AI Credits unavailable: configure matching AI_INTERNAL_KEY (at least 32 characters) in BE and AI Service before starting jobs')
JOB_STATE_PATH = os.getenv('AI_JOB_STATE_PATH', str(Path(__file__).resolve().parent / '.runtime' / 'credits-registry.json'))
JOB_MAX_CONCURRENT = int(os.getenv('AI_JOB_MAX_CONCURRENT', '1'))
if JOB_MAX_CONCURRENT != 1:
    raise ValueError('AI_JOB_MAX_CONCURRENT must be 1 to protect the local Ollama instance')
METRICS_PATH = str(Path(__file__).resolve().parent / 'benchmarks' / 'ai_generator_results.xlsx')
telemetry = ExcelTelemetry(METRICS_PATH, os.getenv('AI_METRICS_SAMPLE_SECONDS', '1'))
telemetry.ensure()
registry = GenerationRegistry(JOB_STATE_PATH, JOB_MAX_CONCURRENT, telemetry)
MAX_CHARS = int(os.getenv('AI_MAX_SOURCE_CHARS', '120000'))
DUPLICATE_THRESHOLD = float(os.getenv('AI_DUPLICATE_THRESHOLD', '0.85'))
QUESTIONBANK_DSN = os.getenv('EXAMFLOW_QUESTIONBANK_DSN', '')
DUPLICATE_EMBEDDING_WAIT_SECONDS = max(0.0, float(os.getenv('AI_DUPLICATE_EMBEDDING_WAIT_SECONDS', '5')))
DUPLICATE_ON_DEMAND_LIMIT = max(1, int(os.getenv('AI_DUPLICATE_ON_DEMAND_LIMIT', '100')))
DUPLICATE_MAX_ATTEMPTS = int(os.getenv('AI_DUPLICATE_MAX_ATTEMPTS', '3'))
if not 1 <= DUPLICATE_MAX_ATTEMPTS <= 5:
    raise ValueError('AI_DUPLICATE_MAX_ATTEMPTS must be between 1 and 5')
if not 0.0 <= DUPLICATE_THRESHOLD <= 1.0:
    raise ValueError('AI_DUPLICATE_THRESHOLD must be between 0 and 1')
app = FastAPI(title='ExamFlow AI RAG')
app.add_middleware(CORSMiddleware, allow_origins=os.getenv('AI_CORS_ORIGINS', 'http://localhost:5173').split(','), allow_methods=['GET','POST'], allow_headers=['*'])

class Unit(BaseModel):
    name: str
    chapterId: int | None = None
    cloId: int | None = None
    nb: int = Field(ge=0, le=MAX_QUESTIONS)
    th: int = Field(ge=0, le=MAX_QUESTIONS)
    vd: int = Field(ge=0, le=MAX_QUESTIONS)

class GenerationRequest(BaseModel):
    courseId: int
    sourceText: str | None = None
    # Kept as JSON-compatible dictionaries so durable payloads remain readable
    # by older test/worker tooling; strict fields are validated before use.
    documentRefs: list[dict] | None = None
    instruction: str = ''
    units: list[Unit] | None = None  # Retained for previously stored jobs only.
    questionCount: int | None = Field(default=None, ge=1, le=MAX_QUESTIONS)
    cloIds: list[int] | None = None
    selectedClos: list['SelectedClo'] | None = None
    batchSize: int = 5
    inferenceBatchSize: int | None = None

    @field_validator('inferenceBatchSize')
    @classmethod
    def validate_inference_size(cls, value):
        if value is not None and value not in (1, 3):
            raise ValueError('inferenceBatchSize must be 1 or 3')
        return value

    @field_validator('instruction', mode='before')
    @classmethod
    def normalize_optional_instruction(cls, value):
        # Jackson sends explicit null for this optional legacy field in CLO requests.
        return '' if value is None else value

    @field_validator('batchSize')
    @classmethod
    def validate_batch_size(cls, value):
        if value not in (5, 10):
            raise ValueError('batchSize must be 5 or 10')
        return value

class SelectedClo(BaseModel):
    id: int
    code: str
    description: str = Field(min_length=1)

GenerationRequest.model_rebuild()

class IndexDocumentRequest(BaseModel):
    documentId: UUID
    revision: int = Field(ge=1)
    ownerUserId: int
    courseId: int
    extractedText: str = Field(min_length=50)

class ReindexDocumentRequest(BaseModel):
    documentId: UUID
    ownerUserId: int
    courseId: int

class TelemetrySnapshotRequest(BaseModel):
    jobId: int
    requested: int = Field(ge=0)
    accepted: int = Field(ge=0)
    checkpointBatchSize: int = Field(default=5,ge=1)
    resumeCount: int = Field(default=0,ge=0)
    error: str | None = None

def requested_count(request):
    if request.questionCount is not None:
        if request.units or not request.cloIds or not request.selectedClos or len(set(request.cloIds)) != len(request.cloIds):
            raise HTTPException(400, 'Chọn CLO hợp lệ, không gửi ma trận')
        if sorted(c.id for c in request.selectedClos) != sorted(request.cloIds):
            raise HTTPException(400, 'CLO không khớp danh sách đã chọn')
        return request.questionCount
    return sum(u.nb+u.th+u.vd for u in (request.units or []))


def extract(filename: str, content: bytes) -> str:
    suffix = filename.lower().rsplit('.', 1)[-1]
    if suffix == 'txt':
        return content.decode('utf-8-sig', errors='replace')
    if suffix == 'pdf':
        return '\n'.join(page.extract_text() or '' for page in PdfReader(BytesIO(content)).pages)
    if suffix == 'docx':
        doc = Document(BytesIO(content))
        paragraphs = [p.text for p in doc.paragraphs]
        for table in doc.tables:
            paragraphs.extend(' | '.join(c.text for c in row.cells) for row in table.rows)
        return '\n'.join(paragraphs)
    raise HTTPException(400, f'Không hỗ trợ file {filename}; dùng PDF/DOCX/TXT')

@app.get('/health')
def health():
    return {'status': 'ok', 'ollama_url': OLLAMA_URL, 'model': MODEL, 'registryId': registry.registry_id,
            'savedDocumentsEnabled': bool(globals().get('SAVED_DOCUMENTS_ENABLED', False)),
            'chunkingStrategy': globals().get('CHUNKING_STRATEGY', 'fixed'),
            'inferenceBatchSize': globals().get('INFERENCE_BATCH_SIZE', 1),
            'queue': {'active': sum(j.state == 'running' for j in registry.jobs.values()),
                      'waiting': sum(j.state in ('queued', 'paused') for j in registry.jobs.values()),
                      'maxConcurrent': 1},
            'telemetry': {'enabled': bool(getattr(globals().get('telemetry'), 'available', False)),
                          'format': 'xlsx'}}

@app.post('/extract')
async def extract_documents(files: list[UploadFile] = File(...)):
    if not 1 <= len(files) <= 5:
        raise HTTPException(400, 'Chọn từ 1 đến 5 tài liệu')
    docs = []
    for file in files:
        raw = await file.read()
        if len(raw) > 20 * 1024 * 1024:
            raise HTTPException(413, f'{file.filename}: vượt quá 20 MB')
        try:
            content = extract(file.filename or '', raw).strip()
        except HTTPException:
            raise
        except Exception as exc:
            raise HTTPException(422, f'Không đọc được {file.filename}: {exc}') from exc
        if not content:
            raise HTTPException(422, f'{file.filename}: không có văn bản; PDF scan cần OCR')
        docs.append({'name': file.filename, 'extractedText': content, 'wordCount': len(content.split())})
    return {'documents': docs}


def clean_json(s: str):
    s = re.sub(r'^\s*```(?:json)?\s*|\s*```\s*$', '', s.strip(), flags=re.I)
    return json.loads(s)


def normalize(response: str, bloom: str, unit: Unit):
    root = clean_json(response)
    questions = root.get('questions') if isinstance(root, dict) else root
    if not isinstance(questions, list):
        return []
    valid = []
    for q in questions:
        if not isinstance(q, dict):
            continue
        options = q.get('options')
        if isinstance(options, dict):
            options = [options.get(k) for k in 'ABCD']
        answer = q.get('correctIndex', q.get('answer'))
        if isinstance(answer, str) and answer.upper() in 'ABCD' and len(answer) == 1:
            answer = 'ABCD'.index(answer.upper())
        content = q.get('content') or q.get('question')
        if not isinstance(content, str) or not content.strip() or not isinstance(options, list) or len(options) != 4 or not all(isinstance(o, str) and o.strip() for o in options) or type(answer) is not int or answer not in range(4):
            continue
        valid.append({'content': content.strip(), 'options': options, 'correctIndex': answer, 'explanation': str(q.get('explanation') or ''), 'bloom': bloom, 'chapterId': unit.chapterId, 'cloId': unit.cloId})
    return valid

async def ollama_generate(client: httpx.AsyncClient, prompt: str) -> str:
    return await measured_generate(client, OLLAMA_URL, MODEL, prompt, {'num_ctx': 2048, 'num_predict': 850})

def _nearest_questions(course_id: int, vector: list[float], limit: int = 3) -> list[dict]:
    """Read-only vector search. A question is compared only within its course."""
    if not QUESTIONBANK_DSN:
        raise RuntimeError('EXAMFLOW_QUESTIONBANK_DSN is not configured')
    if len(vector) != 768 or not all(math.isfinite(x) for x in vector):
        raise ValueError('Embedding must contain 768 finite values')
    vector_text = '[' + ','.join(str(x) for x in vector) + ']'
    with psycopg2.connect(QUESTIONBANK_DSN, connect_timeout=8) as conn:
        with conn.cursor() as cursor:
            cursor.execute('''
                SELECT q.id, q.content, 1 - (e.embedding <=> %s::extensions.vector) AS similarity
                FROM public.question_embeddings e
                JOIN public.questions q ON q.id = e.question_id
                WHERE q.course_id = %s AND e.model_name = %s
                ORDER BY e.embedding <=> %s::extensions.vector
                LIMIT %s
            ''', (vector_text, course_id, EMBED_MODEL, vector_text, limit))
            return [{'questionId': row[0], 'content': row[1], 'similarity': float(row[2])}
                    for row in cursor.fetchall()]


def _duplicate_bank_snapshot(course_id: int) -> list[dict]:
    """Read all course questions and embedding availability; never mutates the queue."""
    if not QUESTIONBANK_DSN:
        raise RuntimeError('EXAMFLOW_QUESTIONBANK_DSN is not configured')
    with psycopg2.connect(QUESTIONBANK_DSN, connect_timeout=8) as conn:
        conn.set_session(readonly=True)
        with conn.cursor() as cursor:
            cursor.execute('''
                SELECT q.id,q.content,e.embedding IS NOT NULL AND e.model_name=%s,
                       j.attempts,j.last_error,j.queued_at
                FROM public.questions q
                LEFT JOIN public.question_embeddings e ON e.question_id=q.id
                LEFT JOIN public.question_embedding_queue j ON j.question_id=q.id
                WHERE q.course_id=%s ORDER BY q.id
            ''', (EMBED_MODEL, course_id))
            return [dict(questionId=row[0],content=row[1] or '',embedded=bool(row[2]),
                         attempts=row[3],lastError=row[4],queuedAt=row[5]) for row in cursor.fetchall()]


def _exact_key(text: str) -> str:
    return re.sub(r'\W+', '', (text or '').casefold())


async def _wait_for_bank_snapshot(course_id: int) -> list[dict]:
    deadline = asyncio.get_running_loop().time() + DUPLICATE_EMBEDDING_WAIT_SECONDS
    while True:
        rows = await asyncio.to_thread(_duplicate_bank_snapshot, course_id)
        missing = [row for row in rows if not row['embedded']]
        if not missing or asyncio.get_running_loop().time() >= deadline:
            if len(missing) > DUPLICATE_ON_DEMAND_LIMIT:
                raise RuntimeError('Question embedding backlog exceeds controlled on-demand limit')
            return rows
        await asyncio.sleep(min(0.5, max(0.0, deadline-asyncio.get_running_loop().time())))


def _cosine(a: list[float], b: list[float]) -> float:
    dot = sum(x * y for x, y in zip(a, b))
    aa = math.sqrt(sum(x*x for x in a))
    bb = math.sqrt(sum(y*y for y in b))
    return dot / (aa * bb) if aa and bb else 0.0


async def _embed_question(text: str) -> list[float]:
    async with httpx.AsyncClient(timeout=90) as client:
        response = await client.post(f'{OLLAMA_URL}/api/embed', json={
            'model': EMBED_MODEL, 'input': text
        })
        response.raise_for_status()
        values = response.json()['embeddings'][0]
        if len(values) != 768:
            raise ValueError(f'Expected 768 embedding dimensions, got {len(values)}')
        return values


async def _duplicate_report(course_id: int, content: str, batch_vectors: list[list[float]]) -> tuple[dict, list[float]]:
    snapshot = await _wait_for_bank_snapshot(course_id)
    vector = await _embed_question(content)
    matches = await asyncio.to_thread(_nearest_questions, course_id, vector)
    embedded_ids = {row['questionId'] for row in matches}
    # Questions waiting for the worker remain visible via controlled, read-only
    # on-demand embeddings. Nothing is written to the embedding table or queue.
    missing = [row for row in snapshot if not row['embedded']]
    for row in missing:
        candidate_vector = await _embed_question(row['content'])
        matches.append({'questionId': row['questionId'], 'content': row['content'],
                        'similarity': _cosine(vector, candidate_vector), 'source': 'question_bank_on_demand'})
    for row in matches:
        row.setdefault('source', 'question_bank_embedding')
    matches.sort(key=lambda row: row['similarity'], reverse=True)
    matches = matches[:3]
    exact = next((row for row in snapshot if _exact_key(row['content']) == _exact_key(content)), None)
    batch_score = max((_cosine(vector, other) for other in batch_vectors), default=0.0)
    bank_score = matches[0]['similarity'] if matches else 0.0
    best = None
    if exact:
        best = {'questionId': exact['questionId'], 'content': exact['content'], 'similarity': 1.0,
                'matchType': 'duplicate_exact_bank', 'source': 'question_bank', 'threshold': DUPLICATE_THRESHOLD}
    elif bank_score >= DUPLICATE_THRESHOLD:
        top = matches[0]
        best = {'questionId': top['questionId'], 'content': top['content'], 'similarity': top['similarity'],
                'matchType': 'duplicate_semantic_bank', 'source': top['source'], 'threshold': DUPLICATE_THRESHOLD}
    return ({'suspectedDuplicate': bool(best) or batch_score >= DUPLICATE_THRESHOLD,
             'threshold': DUPLICATE_THRESHOLD, 'bankMatches': matches,
             'maxBatchSimilarity': batch_score, 'duplicateMatch': best,
             'embeddingReadiness': {'pendingCount': len(missing),
                 'failedCount': sum(1 for row in missing if row.get('lastError'))}}, vector)


class DuplicateCheckRequest(BaseModel):
    courseId: int
    content: str = Field(min_length=3)


@app.post('/duplicate-check')
async def duplicate_check(request: DuplicateCheckRequest):
    """Explicit diagnostics endpoint; does not write any question or embedding."""
    try:
        report, _ = await _duplicate_report(request.courseId, request.content, [])
        return report
    except Exception as exc:
        logger.exception('Duplicate check unavailable')
        raise HTTPException(503, 'Duplicate checking unavailable; inspect ai-service logs') from exc


def require_saved_documents():
    if not SAVED_DOCUMENTS_ENABLED:
        raise HTTPException(503, 'AI Saved Documents is disabled; AI_SAVED_DOCUMENTS_ENABLED must be true')


async def _generate(request: GenerationRequest, progress=lambda items: None, cancelled=lambda: False,
                    initial_questions=None):
    if getattr(request, 'documentRefs', None):
        require_saved_documents()
    automatic = getattr(request, 'questionCount', None) is not None
    total = requested_count(request) if automatic else sum(u.nb + u.th + u.vd for u in (request.units or []))
    if total < 1 or total > MAX_QUESTIONS:
        raise HTTPException(400, f'Số câu phải từ 1 đến {MAX_QUESTIONS}')
    legacy = bool(request.sourceText and request.sourceText.strip())
    raw_refs = getattr(request,'documentRefs',None)
    saved = bool(raw_refs)
    if legacy == saved:
        raise HTTPException(400, 'Chọn đúng một nguồn tài liệu: sourceText hoặc documentRefs')
    refs=[]
    if saved:
        try:
            refs=[DocumentRef(UUID(str(r['documentId'])),int(r['revision']),UUID(str(r['indexId'])),str(r['configHash'])) for r in raw_refs]
        except (KeyError,TypeError,ValueError) as exc:
            raise HTTPException(400,'Tham chiếu tài liệu không hợp lệ') from exc
        if len(refs)>5 or len({r.indexId for r in refs})!=len(refs) or any(r.revision<1 or not re.fullmatch(r'[0-9a-f]{64}',r.configHash) for r in refs):
            raise HTTPException(400, 'Chọn tối đa 5 tài liệu đã lưu, không trùng lặp')
    try:
        embeddings = OllamaEmbeddings(base_url=OLLAMA_URL, model=EMBED_MODEL)
        if saved:
            cache=from_environment()
            await asyncio.to_thread(cache.validate_refs,refs)
            store=ExactDocumentStore(cache,refs)
        else:
            if len(request.sourceText.strip()) < 50:
                raise HTTPException(400, 'Nội dung tài liệu quá ngắn; vui lòng tải tài liệu thực')
            # The globals fallback retains compatibility with the isolated legacy
            # generation-loop harness that compiles this function by itself.
            chunker = globals().get('chunk_text')
            strategy = globals().get('CHUNKING_STRATEGY', 'fixed')
            if chunker:
                chunks, chunking_stats = chunker(request.sourceText[:MAX_CHARS], source_file='source-text',
                                                  strategy=strategy)
                logger.info('RAG_CHUNKING strategy=%s chunks=%s chapters=%s sections=%s subsections=%s fallback=%s processing_ms=%s',
                            chunking_stats.strategy, chunking_stats.chunk_count, chunking_stats.chapter_count,
                            chunking_stats.section_count, chunking_stats.subsection_count,
                            chunking_stats.fallback, chunking_stats.processing_ms)
            else:
                chunks = RecursiveCharacterTextSplitter(chunk_size=800, chunk_overlap=150).split_documents(
                    [LCDocument(page_content=request.sourceText[:MAX_CHARS])])
            base_store = await asyncio.to_thread(FAISS.from_documents, chunks, embeddings)
            adapter = globals().get('HierarchyAwareStore')
            store = adapter(base_store) if strategy == 'hierarchical' and adapter else base_store
    except Exception as exc:
        raise HTTPException(502, f'Embedding/FAISS thất bại: {str(exc)[:250]}') from exc
    if cancelled():
        return []
    # Fail closed: never silently bypass duplicate detection during generation.
    if not QUESTIONBANK_DSN:
        raise HTTPException(503, 'Chưa cấu hình Question Bank để kiểm tra trùng')
    if automatic:
        return await generate_clo_questions(request, store, embeddings, ollama_generate, _duplicate_report,
                                            DUPLICATE_MAX_ATTEMPTS, progress, cancelled,
                                            getattr(request, 'batchSize', 5), initial_questions,
                                            getattr(request, 'inferenceBatchSize', None) or globals().get('INFERENCE_BATCH_SIZE', 1))
    result = list(initial_questions or [])
    seen = {re.sub(r'\W+', '', q['content'].lower()) for q in result}
    batch_vectors = []
    async with httpx.AsyncClient(timeout=httpx.Timeout(240.0, connect=10.0)) as client:
        for unit in request.units:
            for bloom, count in [('remember', unit.nb), ('understand', unit.th), ('apply', unit.vd)]:
                already = sum(q.get('chapterId') == unit.chapterId and q.get('cloId') == unit.cloId
                              and q.get('bloom') == bloom for q in result)
                for index in range(already, count):
                    if cancelled():
                        return result
                    query = f'{unit.name} {request.instruction} {bloom}'
                    retrieved = await asyncio.to_thread(store.similarity_search, query, 4)
                    context = '\n---\n'.join(d.page_content for d in retrieved)[:4800]
                    prompt = f'''Bạn là giảng viên. Dựa CHỈ trên tài liệu dưới đây, tạo ĐÚNG 1 câu hỏi trắc nghiệm tiếng Việt.
Chủ đề: {unit.name}. Bloom: {bloom} (remember=nhớ, understand=hiểu, apply=vận dụng).
Yêu cầu bổ sung: {request.instruction}. Câu hỏi thứ {index+1} trong nhóm này.
Trả về JSON THUẦN đúng dạng {{"questions":[{{"content":"...","options":["...","...","...","..."],"correctIndex":0,"explanation":"..."}}]}}.
Đúng 4 đáp án, đúng một đáp án, không viết A/B/C/D trong options, giải thích có căn cứ trong tài liệu.
TÀI LIỆU:\n{context}'''
                    accepted = None
                    rejected_contents = []
                    last_error = ''
                    for attempt in range(DUPLICATE_MAX_ATTEMPTS):
                        if cancelled():
                            return result
                        retry_instruction = ''
                        if rejected_contents:
                            examples = '\n'.join(f'- {x[:250]}' for x in rejected_contents[-3:])
                            retry_instruction = (f'\nCÁC CÂU ĐÃ BỊ TỪ CHỐI VÌ TRÙNG/QUÁ GIỐNG:\n{examples}'
                                                 '\nHãy kiểm tra một kiến thức KHÁC trong tài liệu, không chỉ đổi cách diễn đạt.'
                                                 '\nChỉ xuất JSON hợp lệ, đúng một câu.')
                        try:
                            raw = await ollama_generate(client, prompt + retry_instruction)
                            if cancelled():
                                return result
                            candidates = normalize(raw, bloom, unit)
                        except (ValueError, httpx.HTTPError) as exc:
                            last_error = str(exc)
                            logger.warning('GENERATION_RETRY course=%s bloom=%s attempt=%s reason=model_or_json',
                                           request.courseId, bloom, attempt + 1)
                            continue
                        if not candidates:
                            last_error = 'AI trả JSON không có câu hỏi hợp lệ'
                            continue
                        for item in candidates:
                            fingerprint = re.sub(r'\W+', '', item['content'].lower())
                            if fingerprint in seen:
                                rejected_contents.append(item['content'])
                                last_error = 'Câu hỏi trùng nguyên văn trong cùng lượt'
                                continue
                            try:
                                report, vector = await _duplicate_report(request.courseId, item['content'], batch_vectors)
                            except Exception as exc:
                                logger.exception('DUPLICATE_CHECK_FAILED course=%s', request.courseId)
                                raise HTTPException(503, 'Không thể kiểm tra trùng; chưa trả câu hỏi để tránh bỏ qua kiểm tra') from exc
                            logger.info('DUPLICATE_AUDIT course=%s bloom=%s attempt=%s suspected=%s bank_top=%s batch_max=%.4f',
                                        request.courseId, bloom, attempt + 1, report['suspectedDuplicate'],
                                        [(m['questionId'], round(m['similarity'], 4)) for m in report['bankMatches']],
                                        report['maxBatchSimilarity'])
                            if report['suspectedDuplicate']:
                                rejected_contents.append(item['content'])
                                last_error = 'Câu hỏi nghi trùng ngữ nghĩa'
                                continue
                            accepted = item
                            seen.add(fingerprint)
                            batch_vectors.append(vector)  # Only accepted questions count in this batch.
                            break
                        if accepted is not None:
                            break
                    if accepted is None:
                        # Preserve accepted questions; skip this unfilled matrix slot.
                        logger.warning('GENERATION_EXHAUSTED course=%s bloom=%s index=%s attempts=%s reason=%s',
                                       request.courseId, bloom, index + 1, DUPLICATE_MAX_ATTEMPTS, last_error)
                        continue
                    result.append(accepted)
                    if len(result) % getattr(request, 'batchSize', 5) == 0:
                        progress(result)
    if result and len(result) % getattr(request, 'batchSize', 5):
        progress(result)
    return result


def _job_generator(payload, initial_questions=None):
    request = GenerationRequest.model_validate(payload)
    return lambda progress, cancelled: _generate(request, progress, cancelled, initial_questions)


@app.on_event('startup')
async def resume_durable_jobs():
    await registry.resume_all(_job_generator,
        can_resume=lambda payload: SAVED_DOCUMENTS_ENABLED or not payload.get('documentRefs'))


def require_internal(x_ai_internal_key: str = Header(default='')):
    if len(INTERNAL_KEY) < 32:
        raise HTTPException(503, 'AI_INTERNAL_KEY must be configured before generation')
    if not hmac.compare_digest(x_ai_internal_key, INTERNAL_KEY):
        raise HTTPException(403, 'Generation is available only through authenticated ExamFlow backend')


def require_registry(x_ai_registry_id: str | None = Header(default=None)):
    # Older clients remain compatible; DB coordination requires all Backends to upgrade.
    if x_ai_registry_id is not None and x_ai_registry_id != registry.registry_id:
        raise HTTPException(409, 'AI execution registry mismatch')


@app.get('/documents/metrics', dependencies=[Depends(require_internal)])
def saved_document_metrics():
    return document_metrics_snapshot()


@app.post('/documents/index', dependencies=[Depends(require_internal)])
async def index_document(request: IndexDocumentRequest):
    require_saved_documents()
    try:
        cache=from_environment()
        return await asyncio.to_thread(cache.index,request.documentId,request.revision,
                                       request.ownerUserId,request.courseId,request.extractedText)
    except PermissionError as exc:
        raise HTTPException(403,'Document ownership or revision mismatch') from exc
    except ValueError as exc:
        raise HTTPException(400,str(exc)) from exc
    except Exception as exc:
        logger.exception('DOCUMENT_INDEX_FAILED document=%s',request.documentId)
        raise HTTPException(503,'Document indexing failed; inspect AI Service logs') from exc


@app.post('/documents/reindex', dependencies=[Depends(require_internal)])
async def reindex_document(request: ReindexDocumentRequest):
    require_saved_documents()
    try:
        cache=from_environment()
        return await asyncio.to_thread(cache.reindex,request.documentId,request.ownerUserId,request.courseId)
    except (PermissionError,LookupError) as exc:
        raise HTTPException(404,'Document or extracted text is unavailable') from exc
    except Exception as exc:
        logger.exception('DOCUMENT_REINDEX_FAILED document=%s',request.documentId)
        raise HTTPException(503,'Document reindex failed; inspect AI Service logs') from exc


@app.post('/generate', dependencies=[Depends(require_internal)])
async def generate(request: GenerationRequest):
    if request.documentRefs:
        require_saved_documents()
    return await _generate(request)


@app.post('/credits/jobs/{token}', status_code=202, dependencies=[Depends(require_internal), Depends(require_registry)])
async def start_credit_job(token: UUID, request: GenerationRequest,
                           x_examflow_job_id: int | None = Header(default=None)):
    # Reject before registry.start can persist or schedule a job.
    if request.documentRefs:
        require_saved_documents()
    existing = getattr(registry, 'jobs', {}).get(str(token))
    mode = (getattr(existing, 'inference_batch_size', 1) if existing else
            request.inferenceBatchSize or globals().get('INFERENCE_BATCH_SIZE', 1))
    request = request.model_copy(update={'inferenceBatchSize': mode})
    total = requested_count(request)
    if not 1 <= total <= MAX_QUESTIONS:
        raise HTTPException(400, f'Số câu phải từ 1 đến {MAX_QUESTIONS}')
    try:
        payload = request.model_dump()
        if x_examflow_job_id is not None:
            payload['_jobId'] = x_examflow_job_id
        return await registry.start(str(token), payload,
            lambda progress, cancelled: _generate(request, progress, cancelled, []))
    except ValueError as exc:
        raise HTTPException(409, str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(503, str(exc)) from exc


@app.get('/credits/jobs/{token}', dependencies=[Depends(require_internal), Depends(require_registry)])
async def credit_job_status(token: UUID):
    try:
        return registry.status(str(token))
    except KeyError as exc:
        raise HTTPException(404, 'Unknown execution token; backend reconciliation required') from exc

@app.post('/telemetry/jobs/{token}/unknown', dependencies=[Depends(require_internal)])
async def credit_job_unknown_telemetry(token: UUID, request: TelemetrySnapshotRequest):
    # Observability only: it never mutates the execution registry, credits or result.
    await asyncio.to_thread(telemetry.record_snapshot,request.jobId,str(token),'unknown',
        request.requested,request.accepted,request.checkpointBatchSize,request.resumeCount,request.error)
    return {'recorded':True}


@app.post('/credits/jobs/{token}/cancel', dependencies=[Depends(require_internal), Depends(require_registry)])
async def cancel_credit_job(token: UUID):
    try:
        return registry.cancel(str(token))
    except KeyError as exc:
        raise HTTPException(404, 'Unknown execution token; backend reconciliation required') from exc
