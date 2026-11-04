"""Structure-aware chunking for Vietnamese teaching material.

The public API deliberately returns LangChain ``Document`` objects so the same
chunker can feed an in-memory FAISS index and the persistent pgvector cache.
No database schema is required for hierarchy metadata.
"""
from __future__ import annotations

from dataclasses import asdict, dataclass
import hashlib
import logging
import re
import time
import unicodedata

from langchain_core.documents import Document
from langchain_text_splitters import RecursiveCharacterTextSplitter


logger = logging.getLogger("examflow.chunking")
FIXED_CHUNK_SIZE = 800
FIXED_CHUNK_OVERLAP = 150
HIERARCHICAL_CHUNKER_VERSION = "hierarchical-heading-v1"

_CHAPTER = re.compile(
    r"^\s*(?:ch(?:ương|uong))\s+((?:\d+)|(?:[ivxlcdm]+))(?:\s*[:.\-–—]\s*|\s+)?(.*?)\s*$",
    re.IGNORECASE,
)
_NUMBERED = re.compile(r"^\s*(\d+(?:\.\d+){1,2})[.)]?\s+(.+?)\s*$")
_NUMBER_ONLY = re.compile(r"^\s*(\d+(?:\.\d+){1,2})[.)]?\s*$")
_QUESTION = re.compile(r"^\s*(?:câu|question|bài\s+tập)\s*\d+\b", re.IGNORECASE)
_QUESTION_LIKE_TITLE = re.compile(
    r"^\s*(?:câu\b|question\b|bài\s+tập\b|hãy\b|chọn\b|đáp\s+án\b|phát\s+biểu\s+nào\b)",
    re.IGNORECASE,
)
_OPTION = re.compile(r"^\s*(?:[a-dA-D][.)]|\([a-dA-D]\))\s+")


@dataclass(frozen=True)
class ChunkingStats:
    strategy: str
    chunk_count: int
    chapter_count: int
    section_count: int
    subsection_count: int
    fallback: bool
    fallback_ratio: float
    processing_ms: float


def validate_strategy(value: str | None) -> str:
    strategy = (value or "fixed").strip().lower()
    if strategy not in {"fixed", "hierarchical"}:
        raise ValueError("AI_CHUNKING_STRATEGY must be fixed or hierarchical")
    return strategy


def _display(value: str) -> str:
    return " ".join(unicodedata.normalize("NFC", value or "").split())


def _plausible_title(title: str, full_line: str) -> bool:
    title = _display(title)
    if not title or len(title) > 160 or len(title.split()) > 20:
        return False
    if ("?" in full_line or _QUESTION.match(full_line) or _QUESTION_LIKE_TITLE.match(title)
            or _OPTION.match(full_line)):
        return False
    # Numbered prose/list items commonly end in sentence punctuation. A colon
    # remains valid because many lecture headings use it.
    if title.endswith((".", ";", "!")):
        return False
    return any(character.isalpha() for character in title)


def detect_heading(line: str) -> tuple[int, str, str] | None:
    """Return ``(level, key, title)`` or None for ordinary/question text."""
    normalized = unicodedata.normalize("NFC", line or "").strip()
    if not normalized or _QUESTION.match(normalized) or _OPTION.match(normalized):
        return None
    chapter = _CHAPTER.match(normalized)
    if chapter and _plausible_title(chapter.group(2) or normalized, normalized):
        return 1, chapter.group(1).upper(), _display(normalized)
    number_only = _NUMBER_ONLY.match(normalized)
    if number_only:
        number = number_only.group(1)
        return (2 if number.count(".") == 1 else 3), number, normalized
    numbered = _NUMBERED.match(normalized)
    if not numbered or not _plausible_title(numbered.group(2), normalized):
        return None
    number = numbered.group(1)
    level = 2 if number.count(".") == 1 else 3
    return level, number, _display(normalized)


def _metadata(source_file: str, chapter: str | None, section: str | None,
              subsection: str | None, ordinal: int, content: str) -> dict:
    material = "\0".join((source_file, chapter or "", section or "", subsection or "",
                           str(ordinal), content))
    chunk_id = hashlib.sha256(material.encode("utf-8")).hexdigest()[:24]
    return {
        "source_file": source_file,
        "chapter": chapter,
        "section": section,
        "subsection": subsection,
        "chunk_id": chunk_id,
    }


def _fixed(text: str, source_file: str) -> list[Document]:
    splitter = RecursiveCharacterTextSplitter(
        chunk_size=FIXED_CHUNK_SIZE, chunk_overlap=FIXED_CHUNK_OVERLAP
    )
    pieces = splitter.split_text(text)
    return [Document(page_content=piece,
                     metadata=_metadata(source_file, None, None, None, ordinal, piece))
            for ordinal, piece in enumerate(pieces)]


def chunk_text(text: str, *, source_file: str = "source-text", strategy: str = "fixed",
               chunk_size: int = FIXED_CHUNK_SIZE,
               chunk_overlap: int = FIXED_CHUNK_OVERLAP) -> tuple[list[Document], ChunkingStats]:
    """Chunk one extracted document without crossing recognized unit boundaries."""
    started = time.perf_counter()
    strategy = validate_strategy(strategy)
    clean = unicodedata.normalize("NFC", text or "").strip()
    if strategy == "fixed":
        documents = _fixed(clean, source_file)
        return documents, ChunkingStats("fixed", len(documents), 0, 0, 0, False, 0.0,
                                        round((time.perf_counter() - started) * 1000, 3))

    current = {"chapter": None, "section": None, "subsection": None}
    units: list[tuple[dict, list[str]]] = []
    buffer: list[str] = []
    heading_counts = {1: set(), 2: set(), 3: set()}

    def flush() -> None:
        nonlocal buffer
        content = "\n".join(buffer).strip()
        if content:
            units.append((dict(current), [content]))
        buffer = []

    for raw_line in clean.splitlines():
        line = raw_line.strip()
        heading = detect_heading(line)
        if heading:
            flush()
            level, key, title = heading
            heading_counts[level].add(key)
            if level == 1:
                current.update(chapter=title, section=None, subsection=None)
            elif level == 2:
                current.update(section=title, subsection=None)
            else:
                current.update(subsection=title)
            buffer.append(title)
        elif line:
            buffer.append(line)
    flush()

    # A lone accidental numbered line is weaker evidence than a real document
    # hierarchy. Require either a chapter or at least two numbered headings.
    recognized = bool(heading_counts[1]) or sum(len(value) for value in heading_counts.values()) >= 2
    if not recognized:
        documents = _fixed(clean, source_file)
        elapsed = round((time.perf_counter() - started) * 1000, 3)
        logger.warning("HIERARCHICAL_CHUNKING_FALLBACK source=%s chars=%s chunks=%s",
                       source_file, len(clean), len(documents))
        return documents, ChunkingStats("hierarchical", len(documents), 0, 0, 0, True, 1.0, elapsed)

    documents: list[Document] = []
    for hierarchy, values in units:
        unit_text = "\n".join(values).strip()
        path = [hierarchy[key] for key in ("chapter", "section", "subsection") if hierarchy[key]]
        first_line, _, remainder = unit_text.partition("\n")
        body = remainder if path and first_line == path[-1] else unit_text
        prefix = "\n".join(path)
        complete = "\n".join(value for value in (prefix, body) if value).strip()
        if len(complete) <= chunk_size:
            pieces = [complete]
        else:
            # Repeat the hierarchy path in every continuation. This keeps
            # pgvector chunks self-describing despite the existing table not
            # having a JSON metadata column.
            body_size = max(100, chunk_size - len(prefix) - 1)
            splitter = RecursiveCharacterTextSplitter(
                chunk_size=body_size, chunk_overlap=min(chunk_overlap, body_size - 1)
            )
            pieces = ["\n".join(value for value in (prefix, piece) if value).strip()
                      for piece in splitter.split_text(body)]
        for piece in pieces:
            ordinal = len(documents)
            documents.append(Document(
                page_content=piece,
                metadata=_metadata(source_file, hierarchy["chapter"], hierarchy["section"],
                                   hierarchy["subsection"], ordinal, piece),
            ))
    elapsed = round((time.perf_counter() - started) * 1000, 3)
    stats = ChunkingStats("hierarchical", len(documents), len(heading_counts[1]),
                          len(heading_counts[2]), len(heading_counts[3]), False, 0.0, elapsed)
    logger.info("HIERARCHICAL_CHUNKING_STATS %s", asdict(stats) | {"source_file": source_file})
    return documents, stats


def hierarchy_terms(document: Document) -> set[str]:
    values = [document.metadata.get(key) for key in ("chapter", "section", "subsection")]
    return {token.casefold() for value in values if value
            for token in re.findall(r"[\wÀ-ỹ]+", str(value)) if len(token) > 1}


def infer_hierarchy_metadata(content: str) -> dict:
    """Best-effort metadata recovery for the existing metadata-less chunk table."""
    result = {"chapter": None, "section": None, "subsection": None}
    for line in (content or "").splitlines()[:8]:
        heading = detect_heading(line)
        if not heading:
            continue
        level, _, title = heading
        if level == 1:
            result.update(chapter=title, section=None, subsection=None)
        elif level == 2:
            result["section"] = title
        else:
            result["subsection"] = title
    return result


def rerank_hierarchical(query: str, documents: list[Document], limit: int) -> list[Document]:
    """Prefer matching hierarchy labels while preserving vector order as tie-breaker."""
    wanted = {token.casefold() for token in re.findall(r"[\wÀ-ỹ]+", query or "") if len(token) > 1}
    ranked = sorted(enumerate(documents),
                    key=lambda row: (-len(wanted & hierarchy_terms(row[1])), row[0]))
    return [document for _, document in ranked[:limit]]


class HierarchyAwareStore:
    """Small removable adapter around any LangChain-compatible vector store."""
    hierarchical = True

    def __init__(self, store):
        self.store = store

    def similarity_search(self, query: str, k: int = 4):
        candidates = self.store.similarity_search(query, max(k * 3, k))
        return rerank_hierarchical(query, candidates, k)
