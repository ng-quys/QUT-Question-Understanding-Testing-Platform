"""Deterministic outline extraction. stdin is a local file path passed by Backend.

No model, network, database, credentials or AI-service imports. Output is UTF-8 JSON.
Unknown content is never invented; callers must review the draft before saving.
"""
import io
import json
import re
import sys
import unicodedata
import zipfile
from pathlib import Path

MAX_BYTES = 20 * 1024 * 1024
MAX_PAGES = 80
CLO = re.compile(r'CLO\s*\d+(?:\s*\.\s*\d+)*(?:\s*\*)?', re.I)
CHAPTER = re.compile(r'^(Chương\s+(\d+))\s*[.:\-–]?\s+(.+)$', re.I)
TOPIC = re.compile(r'^(\d+\s*\.\s*\d+(?:\s*\.\s*\d+)*)[.)]?\s+(.+)$')
SUSPECT_TOPIC = re.compile(r'^(\d[^\s]*\.[^\s]*)\s+(.+)$')
SECTION = re.compile(r'^\d+\s*\.\s+[A-ZÀ-ỸĐ][A-ZÀ-ỸĐ\s/(),:–-]{5,}$')


def clean(value):
    return re.sub(r'\s+', ' ', unicodedata.normalize('NFC', value or '')).strip()


def read_pdf(data):
    import pdfplumber
    texts, tables = [], []
    with pdfplumber.open(io.BytesIO(data)) as pdf:
        if len(pdf.pages) > MAX_PAGES:
            raise ValueError('Đề cương vượt quá 80 trang. Hãy chọn tài liệu ngắn hơn.')
        for page in pdf.pages:
            texts.append(page.extract_text() or '')
            tables.extend(page.extract_tables())
    if not any(text.strip() for text in texts):
        raise ValueError('PDF scan không có text layer. Hãy dùng PDF có thể chọn chữ hoặc DOCX; hệ thống không thực hiện OCR.')
    warnings = []
    if any(not text.strip() for text in texts):
        warnings.append('Một số trang PDF không có text layer; hãy đối chiếu các trang đó trước khi lưu.')
    return texts, tables, warnings


def read_docx(data):
    from docx import Document
    # Reject zip bombs before python-docx decompresses the archive.
    with zipfile.ZipFile(io.BytesIO(data)) as archive:
        if sum(info.file_size for info in archive.infolist()) > 50 * 1024 * 1024:
            raise ValueError('DOCX có dữ liệu giải nén quá lớn.')
        if 'word/document.xml' not in archive.namelist():
            raise ValueError('File không phải tài liệu DOCX hợp lệ.')
    document = Document(io.BytesIO(data))
    from docx.text.paragraph import Paragraph
    from docx.table import Table
    blocks, tables = [], []
    for child in document.element.body:
        if child.tag.endswith('}p'):
            blocks.append(Paragraph(child, document).text)
        elif child.tag.endswith('}tbl'):
            table = [[cell.text for cell in row.cells] for row in Table(child, document).rows]
            tables.append(table)
            # Keep separate cells on one row, in document order.
            for row in table:
                blocks.append(' '.join(clean(cell) for cell in row if cell))
    return ['\n'.join(blocks)], tables, []


def table_clos(tables):
    result = []
    last = None
    for rows in tables:
        code_col = desc_col = None
        # Only a description table qualifies; never use the CLO/time allocation matrix.
        for index, row in enumerate(rows):
            for col, cell in enumerate(row):
                if re.search(r'mô\s*tả', clean(cell), re.I):
                    desc_col = col
            if desc_col is not None:
                for col, cell in enumerate(row):
                    if col != desc_col and re.search(r'CĐR|CLO|chuẩn đầu ra', clean(cell), re.I):
                        code_col = col
                if code_col is not None:
                    start = index + 1
                    break
        if code_col is None or desc_col is None:
            continue
        for row in rows[start:]:
            if len(row) <= max(code_col, desc_col):
                continue
            code, description = clean(row[code_col]), clean(row[desc_col])
            if CLO.fullmatch(code):
                last = dict(code=code, description=description)
                result.append(last)
            elif not code and description and last:
                last['description'] = clean(last['description'] + ' ' + description)
    return result


def parse(texts, tables, warnings=None):
    warnings = list(warnings or [])
    # Normalize composed accents and whitespace, never convert codes to numbers.
    lines = [clean(line) for text in texts for line in text.splitlines() if clean(line)]
    text = '\n'.join(lines)
    def capture(pattern):
        match = re.search(pattern, text, re.I | re.M)
        return clean(match[1]) if match else ''
    name = capture(r'^Tên học phần(?:\s*\(tiếng Việt\))?\s*[:：]\s*(.+)$')
    code = capture(r'^Mã học phần\s*[:：]\s*([A-Z0-9][A-Z0-9_.\-]*)')
    credits = capture(r'^Số tín chỉ\s*[:：]\s*(\d+)\b')
    if not name:
        name = capture(r'^HỌC PHẦN\s+(.+)$')
    course = dict(name=name, code=code, credits=int(credits) if credits else None, department='')
    chapters, current, target = [], None, None
    # Prefer detailed content, not the preceding summary allocation matrix.
    detail = next((i + 1 for i, line in enumerate(lines) if re.match(r'^\d+(?:\.\d+)*\.?\s*Nội dung chi tiết', line, re.I)), 0)
    # Remove only repeated page headers/footers and standalone page numbers.
    edges = {}
    for page in texts:
        page_lines = [clean(line) for line in page.splitlines() if clean(line)]
        for line in set(page_lines[:1] + page_lines[-1:]):
            edges[line] = edges.get(line, 0) + 1
    for line in lines[detail:]:
        chapter, topic = CHAPTER.match(line), TOPIC.match(line) or SUSPECT_TOPIC.match(line)
        if chapter:
            current = dict(code=chapter[1], name=chapter[3], topics=[])
            chapters.append(current)
            target = current
        elif current and (SECTION.match(line) or re.match(r'^\d+\.?\s*(PHƯƠNG PHÁP|TÀI LIỆU|ĐÁNH GIÁ|HƯỚNG DẪN|CHUẨN ĐẦU RA)', line, re.I)):
            break
        elif topic and current:
            prefix = topic[1].split('.')[0].strip()
            if prefix != re.search(r'\d+', current['code'])[0]:
                warnings.append('Chủ đề không khớp chương: ' + line)
            target = dict(code=topic[1], name=topic[2])
            current['topics'].append(target)
        elif current and target and not re.fullmatch(r'(?:Trang\s*)?\d+(?:\s*/\s*\d+)?', line, re.I) and edges.get(line, 0) < 2:
            if CLO.search(line):
                warnings.append('Không tự gán CLO cho chủ đề: ' + line)
                target = None
            else:
                target['name'] = clean(target['name'] + ' ' + line)
    # Keep every numbered topic as a flat record; hierarchy is only a view derived from segments.
    for chapter in chapters:
        codes = {}
        for topic in chapter['topics']:
            raw = topic['code']
            if not re.fullmatch(r'\d+(?:\s*\.\s*\d+)+', raw):
                warnings.append('Mã chủ đề không hợp lệ, cần sửa trong preview: ' + raw)
                continue
            parts = tuple(part.strip() for part in raw.split('.'))
            codes[parts] = codes.get(parts, 0) + 1
        for parts, count in codes.items():
            if count > 1:
                warnings.append('Mã chủ đề bị trùng: ' + '.'.join(parts))
            if len(parts) > 2 and parts[:-1] not in codes:
                warnings.append('Chủ đề ' + '.'.join(parts) + ': thiếu chủ đề cha ' + '.'.join(parts[:-1]) + '. Không tự tạo chủ đề cha.')
    clos = table_clos(tables)
    if not clos:
        last = None
        for line in lines:
            match = re.match(r'^(CLO\s*\d+(?:\s*\.\s*\d+)*(?:\s*\*)?)\s*[:：–\-]?\s+(.+)$', line, re.I)
            if match:
                last = dict(code=match[1], description=match[2])
                clos.append(last)
            elif CHAPTER.match(line) or SECTION.match(line):
                last = None
            elif last and not re.fullmatch(r'\d+', line) and not CLO.search(line):
                last['description'] = clean(last['description'] + ' ' + line)
    if not chapters and not clos:
        raise ValueError('Không nhận diện được cấu trúc chương hoặc CLO. Hãy dùng đề cương có tiêu đề Chương và mã CLO rõ ràng.')
    for field, label in [('name', 'tên học phần'), ('code', 'mã học phần'), ('credits', 'số tín chỉ')]:
        if not course[field]:
            warnings.append('Không tìm thấy ' + label + '; cần bổ sung trong preview.')
    if not clos:
        warnings.append('Không tìm thấy mô tả CLO. Hệ thống không tự tạo CLO.')
    if not chapters:
        warnings.append('Không tìm thấy chương. Hệ thống không tự tạo chương/chủ đề.')
    return dict(course=course, chapters=chapters, clos=clos, warnings=warnings)


def extract(data, suffix):
    if not data or len(data) > MAX_BYTES:
        raise ValueError('Chọn file đề cương không rỗng, tối đa 20 MB.')
    if suffix.lower() == '.pdf' and data.startswith(b'%PDF-'):
        return parse(*read_pdf(data))
    if suffix.lower() == '.docx' and data.startswith(b'PK'):
        return parse(*read_docx(data))
    raise ValueError('Chỉ hỗ trợ PDF có text layer và DOCX đúng định dạng.')


if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    try:
        file = Path(sys.argv[1])
        draft = extract(file.read_bytes(), file.suffix)
        print(json.dumps(draft, ensure_ascii=False))
    except ImportError:
        print(json.dumps(dict(error='Chưa cài bộ đọc đề cương: cần pdfplumber và python-docx.'), ensure_ascii=False))
        sys.exit(2)
    except Exception as error:
        message = str(error) if isinstance(error, ValueError) else 'Không đọc được tài liệu. File có thể hỏng, được mã hóa hoặc sai định dạng.'
        print(json.dumps(dict(error=message), ensure_ascii=False))
        sys.exit(1)
