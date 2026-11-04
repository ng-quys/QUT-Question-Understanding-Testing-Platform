"""Experimental, local PDF layout parser. Not wired to production endpoints.

An outline is optional caller-supplied data, never fetched using database credentials.
CLO data is deliberately ignored. Content remains verbatim extracted text.
"""
from dataclasses import dataclass, field
import hashlib
import logging
import re
import time
import unicodedata
from pathlib import Path
from io import BytesIO

from pypdf import PdfReader
from langchain_core.documents import Document
from langchain_text_splitters import RecursiveCharacterTextSplitter

logger = logging.getLogger('examflow.chunking.pdf')


def key(text):
    text = unicodedata.normalize('NFC', text).casefold()
    text = re.sub(r'^\s*\d+[.)]\s*', '', text)
    return ' '.join(re.findall(r'\w+', text))


@dataclass
class Slide:
    page: int
    text: str
    titles: list[str] = field(default_factory=list)
    layout_available: bool = True
    image_count: int = 0


def read_slides(path):
    slides = []
    for number, page in enumerate(PdfReader(path).pages, 1):
        fragments = []
        def visit(text, cm, tm, font, size):
            # Text matrix -> page user space (PDF rotations/transforms included).
            x = tm[4]*cm[0] + tm[5]*cm[2] + cm[4]
            y = tm[4]*cm[1] + tm[5]*cm[3] + cm[5]
            if text.strip() and size >= 30 and y >= float(page.mediabox.height)*.70:
                fragments.append(text.strip())
        text = page.extract_text(visitor_text=visit) or ''
        # pypdf's logical order sometimes separates the number from the title.
        lines = [line.strip() for line in text.splitlines() if line.strip()]
        titles = []
        if fragments:
            for length in range(1, min(4, len(lines))+1):
                candidate = ' '.join(lines[:length])
                # Require that the candidate is actually present in the large
                # upper-page text, not a body bullet following a short heading.
                if key(candidate).replace(' ', '') in key(' '.join(fragments)).replace(' ', ''):
                    titles.append(candidate)
        resources = page.get('/Resources', {})
        if hasattr(resources, 'get_object'):
            resources = resources.get_object()
        objects = resources.get('/XObject', {})
        if hasattr(objects, 'get_object'):
            objects = objects.get_object()
        images = sum(obj.get_object().get('/Subtype') == '/Image' for obj in objects.values())
        slides.append(Slide(number, text, titles, bool(fragments), images))
    return slides


def is_toc(slide):
    lines = [line.strip() for line in slide.text.splitlines() if line.strip()]
    return bool(lines and key(lines[0]) in {'nội dung', 'mục lục', 'contents'})


def outline_links(title, outline):
    """Return candidates only; multiple matches never silently select a chapter."""
    matches = []
    for chapter in (outline or {}).get('chapters', []):
        for topic in chapter.get('topics', []):
            if key(topic.get('name', '')) == key(title):
                matches.append({'course_chapter_id': chapter.get('id'),
                                'course_chapter_code': chapter.get('code'),
                                'topic_id': topic.get('id'), 'topic_code': topic.get('code')})
    return matches


def analyze_slides(slides, outline=None):
    toc = {}
    for slide in slides:
        if is_toc(slide):
            for line in slide.text.splitlines():
                match = re.match(r'^\s*(\d+)[.)]\s+(.+?)\s*$', line)
                if match:
                    identity = key(match[2])
                    toc.setdefault(identity, {'number': match[1], 'title': match[2]})
    boundaries, warnings, seen = [], [], set()
    chapter_numbers = set()
    for slide in slides:
        for line in slide.text.splitlines():
            match = re.fullmatch(r'\s*chương\s+(\d+)\s*', line, re.I)
            if match:
                chapter_numbers.add(match[1])
        if is_toc(slide):
            continue
        matches = {key(title) for title in slide.titles if key(title) in toc}
        if len(matches) > 1:
            warnings.append({'page': slide.page, 'reason': 'ambiguous_title'})
            continue
        if not matches:
            continue
        identity = next(iter(matches))
        if identity in seen:
            # Repeated agenda/section introduction remains inside the section.
            continue
        item = toc[identity]
        if boundaries and int(item['number']) <= int(boundaries[-1]['number']):
            warnings.append({'page': slide.page, 'reason': 'non_monotonic_section'})
            continue
        links = outline_links(item['title'], outline)
        boundaries.append(item | {'page': slide.page, 'evidence': ['toc_exact_title', 'upper_page_large_font'],
                                   'outline_candidates': links,
                                   # A name match is a proposal, not an approved
                                   # mapping between two different curricula.
                                   'course_chapter_id': None})
        seen.add(identity)
    missing = [item for identity,item in toc.items() if identity not in seen]
    for item in missing:
        warnings.append({'section': item['title'], 'reason': 'toc_without_confirmed_boundary'})
    if len(chapter_numbers) != 1:
        warnings.append({'reason': 'missing_or_ambiguous_pdf_chapter'})
    if not toc:
        warnings.append({'reason': 'no_numbered_toc'})
    for warning in warnings:
        logger.warning('PDF_HIERARCHY_REVIEW %s', warning)
    return {'pdf_chapter_number': next(iter(chapter_numbers)) if len(chapter_numbers)==1 else None,
            'toc': list(toc.values()), 'boundaries': boundaries, 'missing': missing, 'warnings': warnings}


_INDEPENDENT = re.compile(
    r'^(?:demo\b|thực hành\b|bài tập\b|câu hỏi ôn tập\b|một số dịch vụ khác\b|'
    r'các dịch vụ khác\b|tổng kết\b|kết luận\b)', re.I)

# Human-reviewed continuations from PDF_HIERARCHY_FALLBACK_CAUSES.md. Only
# exact PDF bytes select these spans. They cannot establish a new section or
# extend past their inclusive end. Tuple: parent start, first/last page, title.
_REVIEWED_SPANS = {
    '76c164860916483f501397d0fca5a30090647c083e755224ee5374a2d1d17add': (
        (10,11,14,'Hệ thống là gì?'), (23,27,42,'Hệ thống tập tin'),
        (46,48,56,'Mạng')),
    '7817125656e7eb38a552c5a1f26022b2d431303f6985a8801d1ee7f8bd678e44': (
        (3,12,22,'System startup and shutdown'),),
    '61d816689c90c27fa21b4fe13fc1e236b69af0f05a91332bc8136f6fc2b3734a': (
        (3,4,15,'MÔI TRƯỜNG QUẢN TRỊ'), (49,58,70,'QUẢN LÝ LƯU TRỮ')),
    '22026a9dba372ef8ba62207e9c27d3d312f7fc66eee73281a005b64682a4b0e1': (
        (15,29,33,'Dịch vụ Active Directory'), (34,43,49,'Dịch vụ DHCP')),
}
_REVIEWED_UNRESOLVED = {
    '22026a9dba372ef8ba62207e9c27d3d312f7fc66eee73281a005b64682a4b0e1': (14,),
}


def reviewed_span(pdf_sha256, active, page):
    if not active:
        return None
    for parent, first, last, title in _REVIEWED_SPANS.get(pdf_sha256, ()):
        if active['page']==parent and key(active['title'])==key(title) and first<=page<=last:
            return {'parent_start_page':parent,'start_page':first,'end_page':last,
                    'section':title,'evidence':'reviewed_pdf_sha256_page_span'}
    return None


def title_support(slide, active, entry_slide=None, verified_children=(), adjacent=()):
    """Lexical/sequence support only; no fuzzy acceptance or CLO inference."""
    phrases = [key(active['title']),re.sub(r'^(?:các )?dịch vụ ', '',key(active['title']))]
    if entry_slide:
        phrases.extend(key(line.lstrip(' •–-✓')) for line in entry_slide.text.splitlines()
                       if line.strip().startswith(('•','–','✓')))
    phrases.extend(verified_children)
    matches = set()
    for title in slide.titles:
        normalized = key(title)
        if any(len(phrase)>=3 and f' {phrase} ' in f' {normalized} ' for phrase in phrases):
            matches.add(normalized)
        # Neighbour continuity can corroborate an already verified child; it
        # cannot make an unknown title a child merely through repetition.
        if normalized in verified_children and any(normalized in {key(t) for t in s.titles} for s in adjacent):
            matches.add(normalized)
    return matches


def scope_end_reason(slide, active, entry_slide=None, *, is_last=False):
    """Structural end evidence, not fuzzy topic classification.

    Ordinary or sparse content-slide titles alone do not prove a section change.
    Explicit demo/exercise/other-topic transitions provide independent evidence.
    Once closed, a section cannot resume through incidental words in body text.
    """
    if active is None:
        return None
    for title in slide.titles:
        normalized = key(title)
        if normalized == key(active['title']):
            continue
        if _INDEPENDENT.match(normalized):
            return 'independent_transition_title'
        if re.match(r'^\s*\d+[.)]\s+\S',title):
            return 'unconfirmed_numbered_section'
    if not slide.text.strip() and is_last:
        return 'page_without_text_layer'
    return None


def chunk_slides(slides, source_file='source-text', outline=None, *, pdf_sha256=None):
    started = time.perf_counter()
    analysis = analyze_slides(slides, outline)
    starts = {item['page']: item for item in analysis['boundaries']}
    by_page = {slide.page:slide for slide in slides}
    regions, active, pending = [], None, []
    scope_ends = []
    scope_reviews, continuations = [], []
    children, last_reviewed, needs_reconfirmation = set(), None, False
    def flush():
        if pending:
            regions.append((active, list(pending)))
            pending.clear()
    for slide in slides:
        if slide.page in starts:
            flush()
            active = starts[slide.page]
            children, last_reviewed, needs_reconfirmation = set(), None, False
        else:
            reason = scope_end_reason(slide,active,by_page.get(active['page']) if active else None,
                                      is_last=slide.page==slides[-1].page)
            if active and slide.page in _REVIEWED_UNRESOLVED.get(pdf_sha256, ()):
                reason = reason or 'reviewed_unresolved_page'
            if active and last_reviewed and slide.page>last_reviewed['end_page']:
                reason = reason or 'reviewed_span_limit'
            if reason:
                flush()
                scope_ends.append({'page':slide.page,'previous_section':active['title'],
                                   'reason':reason})
                logger.warning('PDF_HIERARCHY_SCOPE_END page=%s section=%s reason=%s',
                               slide.page,active['title'],reason)
                active = None
                children, last_reviewed, needs_reconfirmation = set(), None, False
        if active and not is_toc(slide):
            span = reviewed_span(pdf_sha256,active,slide.page)
            support = title_support(slide,active,by_page.get(active['page']),children,
                [by_page[p] for p in (slide.page-1,slide.page+1) if p in by_page and p not in starts])
            if span:
                if span not in continuations:
                    continuations.append(span)
                last_reviewed = span
                children.update(key(t) for t in slide.titles)
                needs_reconfirmation = False
            elif support:
                children.update(support)
                needs_reconfirmation = False
            elif ((needs_reconfirmation or not slide.text.strip() or (slide.layout_available and slide.titles and
                  any(key(slide.text)==key(t) for t in slide.titles))) and slide.page not in starts):
                # Uncertainty isolates this page, not the rest of the section.
                # Images/low text alone neither close nor justify a parent label.
                flush()
                regions.append((None,[slide]))
                reason = ('no_text_layer_pending_review' if not slide.text.strip() else
                          'unconfirmed_continuation_after_ambiguous_page' if needs_reconfirmation else
                          'ambiguous_title_only_page')
                scope_reviews.append({'page':slide.page,'reason':reason,
                                      'image_count':slide.image_count})
                logger.warning('PDF_HIERARCHY_PAGE_FALLBACK page=%s reason=%s',slide.page,reason)
                needs_reconfirmation = True
                continue
        if is_toc(slide):
            flush()
            regions.append((None, [slide]))
        else:
            pending.append(slide)
    flush()
    documents = []
    splitter = RecursiveCharacterTextSplitter(chunk_size=800, chunk_overlap=150, add_start_index=True)
    fallback_chars = total_chars = 0
    for section, pages in regions:
        text = '\n'.join(page.text for page in pages)
        total_chars += len(text)
        if section is None:
            fallback_chars += len(text)
            logger.info('PDF_HIERARCHY_FALLBACK pages=%s-%s', pages[0].page, pages[-1].page)
        for document in splitter.create_documents([text]):
            start = document.metadata['start_index']
            end = start + len(document.page_content)
            if start < 0 or text[start:end] != document.page_content:
                raise ValueError('Chunk source offset could not be verified')
            spans, offset = [], 0
            for page in pages:
                stop = offset + len(page.text)
                lo, hi = max(start,offset), min(end,stop)
                if hi > lo:
                    spans.append({'page':page.page,'start':lo-offset,'end':hi-offset,
                                  'page_text_sha256':hashlib.sha256(page.text.encode('utf-8')).hexdigest()})
                offset = stop + 1
            identity = f'{Path(source_file).name}:{pages[0].page}:{start}'
            document.metadata.update(source_file=Path(source_file).name,
                pdf_chapter_number=analysis['pdf_chapter_number'],
                chapter=analysis['pdf_chapter_number'], section=section['title'] if section else None,
                subsection=None, course_chapter_id=section['course_chapter_id'] if section else None,
                outline_candidates=section['outline_candidates'] if section else [],
                chunk_id=hashlib.sha256(identity.encode()).hexdigest()[:24],
                region_start_page=pages[0].page, region_end_page=pages[-1].page,
                page_spans=spans, section_status='confirmed' if section else 'unresolved',
                pdf_sha256=pdf_sha256,
                reviewed_continuations=[c for c in continuations if section and c['parent_start_page']==section['page']
                                        and any(c['start_page']<=s['page']<=c['end_page'] for s in spans)],
                fallback=section is None)
            documents.append(document)
    analysis.update(chunk_count=len(documents), fallback_regions=sum(section is None for section,_ in regions),
                    scope_ends=scope_ends,
                    scope_reviews=scope_reviews,reviewed_continuations=continuations,
                    pdf_sha256=pdf_sha256,
                    section_scopes=[{'section':section['title'],'start_page':pages[0].page,'end_page':pages[-1].page}
                                    for section,pages in regions if section],
                    page_inventory=[{'page':s.page,'characters':len(s.text),
                                     'text_sha256':hashlib.sha256(s.text.encode('utf-8')).hexdigest(),
                                     'status':'text' if s.text.strip() else 'no_text_layer'} for s in slides],
                    fallback_character_ratio=round(fallback_chars/total_chars,6) if total_chars else 1.0,
                    processing_ms=round((time.perf_counter()-started)*1000,3))
    return documents, analysis


def chunk_pdf(path, outline=None):
    started = time.perf_counter()
    # Hash and parse the same bytes: a replaced file cannot reuse a prior hash.
    data = Path(path).read_bytes()
    documents, analysis = chunk_slides(read_slides(BytesIO(data)),Path(path).name,outline,
                                      pdf_sha256=hashlib.sha256(data).hexdigest())
    analysis['processing_ms'] = round((time.perf_counter()-started)*1000,3)
    return documents, analysis
