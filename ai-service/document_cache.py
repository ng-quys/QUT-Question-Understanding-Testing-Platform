"""Persistent RAG document cache backed by the three migration-001 tables."""
from __future__ import annotations

import hashlib
import json
import logging
import math
import os
import shlex
import time
import uuid
import threading
from dataclasses import dataclass
from typing import Callable

import httpx
import psycopg2
from psycopg2.extensions import parse_dsn
from langchain_core.documents import Document
from hierarchical_chunker import (
    FIXED_CHUNK_OVERLAP,
    FIXED_CHUNK_SIZE,
    HIERARCHICAL_CHUNKER_VERSION,
    chunk_text,
    infer_hierarchy_metadata,
    rerank_hierarchical,
    validate_strategy,
)

logger = logging.getLogger("examflow.chunking")


EXTRACTOR_VERSION = "examflow-pdf-docx-txt-v1"
CHUNKER_VERSION = "recursive-character-v1"
CHUNK_SIZE = FIXED_CHUNK_SIZE
CHUNK_OVERLAP = FIXED_CHUNK_OVERLAP
DIMENSIONS = 768
_METRICS_LOCK = threading.Lock()
_METRICS = {'cacheHits': 0, 'chunkEmbeddingBatchesStarted': 0,
            'chunkEmbeddingTextsRequested': 0, 'chunkEmbeddingBatchesCompleted': 0}


def document_metrics_snapshot():
    """Process-local counters only; no document text, credentials or database writes."""
    with _METRICS_LOCK:
        return dict(_METRICS)


def _count(**values):
    with _METRICS_LOCK:
        for name, value in values.items():
            _METRICS[name] += value


def sha256(value: bytes | str) -> str:
    if isinstance(value, str):
        value = value.encode("utf-8")
    return hashlib.sha256(value).hexdigest()


def config_hash(text_sha: str, model: str, digest: str, *,
                chunker_version: str = CHUNKER_VERSION) -> str:
    value = {
        "chunkOverlap": CHUNK_OVERLAP,
        "chunkSize": CHUNK_SIZE,
        "chunkerVersion": chunker_version,
        "embeddingDimensions": DIMENSIONS,
        "embeddingModel": model,
        "embeddingModelDigest": digest,
        "extractedTextSha256": text_sha,
        "extractorVersion": EXTRACTOR_VERSION,
    }
    return sha256(json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False))


def vector_text(vector: list[float]) -> str:
    if len(vector) != DIMENSIONS or not all(math.isfinite(v) for v in vector):
        raise ValueError(f"Embedding must contain {DIMENSIONS} finite values")
    return "[" + ",".join(str(v) for v in vector) + "]"


def model_digest(ollama_url: str, model: str) -> str:
    with httpx.Client(timeout=15) as client:
        response = client.get(ollama_url.rstrip("/") + "/api/tags")
        response.raise_for_status()
        for item in response.json().get("models", []):
            if item.get("name") == model or item.get("model") == model:
                digest = str(item.get("digest") or "").strip()
                if digest:
                    return digest
    raise RuntimeError(f"Ollama model digest unavailable for {model}")


def embed_texts(ollama_url: str, model: str, texts: list[str]) -> list[list[float]]:
    with httpx.Client(timeout=180) as client:
        response = client.post(ollama_url.rstrip("/") + "/api/embed", json={"model": model, "input": texts})
        response.raise_for_status()
        vectors = response.json().get("embeddings", [])
    if len(vectors) != len(texts):
        raise RuntimeError("Ollama returned an unexpected embedding count")
    for vector in vectors:
        vector_text(vector)
    return vectors


@dataclass(frozen=True)
class DocumentRef:
    documentId: uuid.UUID
    revision: int
    indexId: uuid.UUID
    configHash: str


class DocumentCache:
    def __init__(self, read_dsn: str, write_dsn: str, ollama_url: str, model: str,
                 embedder: Callable[[list[str]], list[list[float]]] | None = None,
                 digest_loader: Callable[[], str] | None = None,
                 connect: Callable[..., object] = psycopg2.connect,
                 chunking_strategy: str = "fixed"):
        self.read_dsn, self.write_dsn = read_dsn, write_dsn
        self.ollama_url, self.model, self.connect = ollama_url, model, connect
        self.embedder = embedder or (lambda texts: embed_texts(ollama_url, model, texts))
        self.digest_loader = digest_loader or (lambda: model_digest(ollama_url, model))
        self.chunking_strategy = validate_strategy(chunking_strategy)

    def _connection(self, write: bool = False):
        dsn = self.write_dsn if write else self.read_dsn
        if not dsn:
            raise RuntimeError("Question Bank writer DSN is not configured" if write else "Question Bank DSN is not configured")
        if "://" in dsn:
            params=parse_dsn(dsn)
        else:
            params={}
            for token in shlex.split(dsn,posix=True):
                if "=" not in token: raise RuntimeError("Invalid Question Bank DSN")
                key,value=token.split("=",1);params[key]=value
            params.pop("default_transaction_read_only",None)
        if write and "default_transaction_read_only=on" in params.get("options","").replace(" ",""):
            raise RuntimeError("Question Bank writer DSN is configured read-only")
        params.update(connect_timeout=10,application_name="ExamFlow-AI-DocumentCache")
        return self.connect(**params)

    def index(self, document_id: uuid.UUID, revision: int, owner: int, course: int, text: str,
              *, force: bool = False) -> dict:
        started = time.perf_counter()
        clean = text.strip()
        if len(clean) < 50:
            raise ValueError("Extracted document must contain at least 50 characters")
        digest = self.digest_loader()
        text_sha = sha256(clean)
        chunker_version = (HIERARCHICAL_CHUNKER_VERSION
                           if self.chunking_strategy == "hierarchical" else CHUNKER_VERSION)
        cfg = config_hash(text_sha, self.model, digest, chunker_version=chunker_version)
        with self._connection() as conn, conn.cursor() as cur:
            cur.execute("""
                SELECT i.id,i.chunk_count FROM public.ai_document_indexes i
                JOIN public.ai_source_documents d ON d.id=i.document_id AND d.revision=i.document_revision
                WHERE i.document_id=%s AND i.document_revision=%s AND i.config_hash=%s
                  AND i.status='ready' AND i.ready_at IS NOT NULL AND d.owner_user_id=%s AND d.course_id=%s
                  AND d.deleted_at IS NULL AND i.chunk_count=(SELECT count(*) FROM public.ai_document_chunks c WHERE c.index_id=i.id)
            """, (str(document_id), revision, cfg, owner, course))
            hit = cur.fetchone()
            if hit and not force:
                _count(cacheHits=1)
                return {"documentId": str(document_id), "revision": revision, "indexId": str(hit[0]),
                        "configHash": cfg, "status": "ready", "chunkCount": hit[1], "cacheHit": True,
                        "preparationMs": round((time.perf_counter()-started)*1000), "chunkEmbeddingCalls": 0}
        chunk_documents, chunking_stats = chunk_text(
            clean, source_file=str(document_id), strategy=self.chunking_strategy,
            chunk_size=CHUNK_SIZE, chunk_overlap=CHUNK_OVERLAP,
        )
        chunks = [document.page_content for document in chunk_documents]
        logger.info("DOCUMENT_CHUNKING document=%s strategy=%s chunks=%s chapters=%s sections=%s subsections=%s fallback=%s processing_ms=%s",
                    document_id, chunking_stats.strategy, chunking_stats.chunk_count,
                    chunking_stats.chapter_count, chunking_stats.section_count,
                    chunking_stats.subsection_count, chunking_stats.fallback,
                    chunking_stats.processing_ms)
        index_id = uuid.uuid4()
        with self._connection(write=True) as conn, conn.cursor() as cur:
            cur.execute("""
                SELECT 1 FROM public.ai_source_documents WHERE id=%s AND revision=%s AND owner_user_id=%s
                  AND course_id=%s AND deleted_at IS NULL FOR UPDATE
            """, (str(document_id), revision, owner, course))
            if not cur.fetchone():
                raise PermissionError("Document ownership or revision mismatch")
            cur.execute("""
                INSERT INTO public.ai_document_indexes
                (id,document_id,document_revision,extracted_text,extracted_text_sha256,extractor_version,
                 embedding_model,embedding_model_digest,embedding_dimensions,chunker_version,chunk_size,
                 chunk_overlap,config_hash,status)
                VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,'indexing')
                ON CONFLICT (document_id,document_revision,config_hash) DO NOTHING RETURNING id
            """, (str(index_id), str(document_id), revision, clean, text_sha, EXTRACTOR_VERSION,
                  self.model, digest, DIMENSIONS, chunker_version, CHUNK_SIZE, CHUNK_OVERLAP, cfg))
            inserted = cur.fetchone()
            if not inserted:
                cur.execute("SELECT id,status,chunk_count FROM public.ai_document_indexes WHERE document_id=%s AND document_revision=%s AND config_hash=%s",
                            (str(document_id), revision, cfg))
                existing = cur.fetchone()
                return {"documentId": str(document_id), "revision": revision, "indexId": str(existing[0]),
                        "configHash": cfg, "status": existing[1], "chunkCount": existing[2], "cacheHit": existing[1] == "ready",
                        "preparationMs": round((time.perf_counter()-started)*1000), "chunkEmbeddingCalls": 0}
        try:
            _count(chunkEmbeddingBatchesStarted=1, chunkEmbeddingTextsRequested=len(chunks))
            vectors = self.embedder(chunks)
            _count(chunkEmbeddingBatchesCompleted=1)
            with self._connection(write=True) as conn, conn.cursor() as cur:
                for order, (content, vector) in enumerate(zip(chunks, vectors)):
                    cur.execute("""
                        INSERT INTO public.ai_document_chunks(index_id,chunk_order,content,content_sha256,embedding)
                        VALUES (%s,%s,%s,%s,%s::extensions.vector)
                    """, (str(index_id), order, content, sha256(content), vector_text(vector)))
                cur.execute("""
                    UPDATE public.ai_document_indexes SET status='ready',chunk_count=%s,ready_at=current_timestamp,updated_at=current_timestamp
                    WHERE id=%s AND status='indexing'
                """, (len(chunks), str(index_id)))
                if cur.rowcount != 1:
                    raise RuntimeError("Document index state changed while indexing")
        except Exception as exc:
            with self._connection(write=True) as conn, conn.cursor() as cur:
                cur.execute("""
                    UPDATE public.ai_document_indexes SET status='failed',error_code='EMBEDDING_FAILED',
                      error_message=%s,updated_at=current_timestamp WHERE id=%s AND ready_at IS NULL
                """, (str(exc)[:500], str(index_id)))
            raise
        return {"documentId": str(document_id), "revision": revision, "indexId": str(index_id),
                "configHash": cfg, "status": "ready", "chunkCount": len(chunks), "cacheHit": False,
                "preparationMs": round((time.perf_counter()-started)*1000), "chunkEmbeddingCalls": 1}

    def reindex(self, document_id: uuid.UUID, owner: int, course: int) -> dict:
        with self._connection() as conn, conn.cursor() as cur:
            cur.execute("""
                SELECT d.revision,i.extracted_text FROM public.ai_source_documents d
                JOIN public.ai_document_indexes i ON i.document_id=d.id AND i.document_revision=d.revision
                WHERE d.id=%s AND d.owner_user_id=%s AND d.course_id=%s AND d.deleted_at IS NULL
                  AND i.extracted_text IS NOT NULL ORDER BY i.created_at DESC LIMIT 1
            """, (str(document_id), owner, course))
            row = cur.fetchone()
        if not row:
            raise LookupError("No extracted text is available for reindex")
        return self.index(document_id, row[0], owner, course, row[1])

    def validate_refs(self, refs: list[DocumentRef]) -> None:
        if not 1 <= len(refs) <= 5 or len({r.indexId for r in refs}) != len(refs):
            raise ValueError("Select between one and five distinct document indexes")
        with self._connection() as conn, conn.cursor() as cur:
            for ref in refs:
                cur.execute("""
                    SELECT count(*) FROM public.ai_document_indexes i
                    JOIN public.ai_source_documents d ON d.id=i.document_id AND d.revision=i.document_revision
                    WHERE d.id=%s AND d.revision=%s AND i.id=%s AND i.config_hash=%s
                      AND i.status='ready' AND i.ready_at IS NOT NULL
                      AND i.chunk_count=(SELECT count(*) FROM public.ai_document_chunks c WHERE c.index_id=i.id)
                """, (str(ref.documentId), ref.revision, str(ref.indexId), ref.configHash))
                if cur.fetchone()[0] != 1:
                    raise ValueError("Document index is missing, stale, failed, or incomplete")

    def search(self, refs: list[DocumentRef], query_vector: list[float], limit: int = 4) -> list[Document]:
        self.validate_refs(refs)
        ids = [str(r.indexId) for r in refs]
        with self._connection() as conn, conn.cursor() as cur:
            cur.execute("""
                SELECT content,index_id,chunk_order,1-(embedding OPERATOR(extensions.<=>) %s::extensions.vector) similarity
                FROM public.ai_document_chunks WHERE index_id=ANY(%s::uuid[])
                ORDER BY embedding OPERATOR(extensions.<=>) %s::extensions.vector LIMIT %s
            """, (vector_text(query_vector), ids, vector_text(query_vector), limit))
            return [Document(page_content=row[0], metadata={
                "indexId": str(row[1]), "chunkOrder": row[2], "similarity": float(row[3]),
                "source_file": str(row[1]), "chunk_id": f"{row[1]}:{row[2]}",
                **infer_hierarchy_metadata(row[0]),
            }) for row in cur.fetchall()]


class ExactDocumentStore:
    hierarchical = False

    def __init__(self, cache: DocumentCache, refs: list[DocumentRef]):
        self.cache, self.refs = cache, refs
        self.hierarchical = getattr(cache, "chunking_strategy", "fixed") == "hierarchical"
    def similarity_search(self, query: str, k: int = 4):
        vector = self.cache.embedder([query])[0]
        candidates = self.cache.search(self.refs, vector, max(k * 3, k) if self.hierarchical else k)
        return rerank_hierarchical(query, candidates, k) if self.hierarchical else candidates


def from_environment() -> DocumentCache:
    return DocumentCache(
        os.getenv("EXAMFLOW_QUESTIONBANK_DSN", ""),
        os.getenv("EXAMFLOW_QUESTIONBANK_WRITER_DSN", ""),
        os.getenv("OLLAMA_URL", "http://127.0.0.1:11434"),
        os.getenv("OLLAMA_EMBED_MODEL", "nomic-embed-text"),
        chunking_strategy=os.getenv("AI_CHUNKING_STRATEGY", "fixed"),
    )
