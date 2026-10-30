import io
import json
import unittest
from pathlib import Path
from docx import Document
from extract import extract, parse, table_clos

ROOT = Path(__file__).resolve().parents[2]


def docx_bytes(blocks):
    document = Document()
    for block in blocks:
        if isinstance(block, str):
            document.add_paragraph(block)
        else:
            table = document.add_table(rows=0, cols=len(block[0]))
            for row in block:
                for cell, value in zip(table.add_row().cells, row):
                    cell.text = value
    stream = io.BytesIO(); document.save(stream)
    return stream.getvalue()


class OutlineTests(unittest.TestCase):
    def test_real_nine_page_pdf_matches_every_item(self):
        file = ROOT / 'ĐỀ CƯƠNG HỌC PHẦN THỨ 52(ATTT).pdf'
        if not file.exists():
            self.skipTest('Repository sample PDF is not present')
        actual = extract(file.read_bytes(), '.pdf')
        expected = json.loads((ROOT / 'frontend/scripts/network-administration-outline.json').read_text(encoding='utf-8'))
        self.assertEqual({k: actual['course'][k] for k in ['code', 'name', 'credits']}, expected['course'])
        self.assertEqual(actual['chapters'], expected['chapters'])
        self.assertEqual(actual['clos'], expected['clos'])
        self.assertEqual(sum(len(c['topics']) for c in actual['chapters']), 59)
        self.assertEqual(len(actual['clos']), 7)
        self.assertTrue(actual['clos'][5]['description'].endswith('biết đã đạt được.'))

    def test_docx_tables_multiline_and_star(self):
        data = docx_bytes(['Tên học phần: Mạng máy tính', 'Mã học phần: 00123', 'Số tín chỉ: 3',
            'Chương 1. Tổng quan', '1.1. Hệ thống', 'và quản trị',
            '7. PHƯƠNG PHÁP DẠY VÀ HỌC', [['Mã CLO', 'Mô tả'], ['CLO1.1*', 'Giải thích hệ thống.\nVận dụng đúng.']]])
        draft = extract(data, '.docx')
        self.assertEqual(draft['course']['code'], '00123')
        self.assertEqual(draft['chapters'][0]['topics'][0]['name'], 'Hệ thống và quản trị')
        self.assertEqual(draft['clos'], [{'code':'CLO1.1*', 'description':'Giải thích hệ thống. Vận dụng đúng.'}])

    def test_clo_table_continues_after_page_break_and_header(self):
        header = ['Mã CLO', 'Mô tả CLO']
        self.assertEqual(table_clos([[header, ['CLO1*', 'Phần đầu']], [header, ['', 'phần tiếp theo.'], ['CLO2', 'Nội dung khác.']]]),
            [{'code':'CLO1*','description':'Phần đầu phần tiếp theo.'}, {'code':'CLO2','description':'Nội dung khác.'}])

    def test_missing_clo_does_not_invent(self):
        draft=extract(docx_bytes(['Tên học phần: Mạng', 'Mã học phần: 0001', 'Số tín chỉ: 2', 'Chương 1. Cơ bản', '1.1. DNS']), '.docx')
        self.assertEqual(draft['clos'], [])
        self.assertTrue(any('Không tìm thấy mô tả CLO' in warning for warning in draft['warnings']))
        self.assertNotIn('cloId', draft['chapters'][0]['topics'][0])

    def test_duplicates_are_not_silently_removed(self):
        draft=parse(['Chương 1. Cơ bản\n1.1. DNS\n1.1. DHCP\nCLO1: Mô tả\nCLO1: Mô tả khác'], [])
        self.assertEqual(len(draft['chapters'][0]['topics']),2)
        self.assertEqual(len(draft['clos']),2)

    def test_wrong_format_and_corrupt_docx(self):
        for data,suffix in [(b'not a pdf','.pdf'),(b'PKbroken','.docx'),(b'anything','.exe'),(b'', '.pdf')]:
            with self.assertRaises(Exception):
                extract(data,suffix)

    def test_unknown_structure_requires_review_not_guesses(self):
        with self.assertRaisesRegex(ValueError,'Không nhận diện'):
            extract(docx_bytes(['Đây là thư mời, không phải đề cương.']),'.docx')

    def test_scan_without_text_layer(self):
        # A valid one-page blank PDF: represents the no-extractable-text condition.
        objects=[b'<< /Type /Catalog /Pages 2 0 R >>',b'<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
            b'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 100 100] /Resources << >> >>']
        data=b'%PDF-1.4\n';offsets=[0]
        for n,obj in enumerate(objects,1):
            offsets.append(len(data));data+=str(n).encode()+b' 0 obj\n'+obj+b'\nendobj\n'
        xref=len(data);data+=b'xref\n0 4\n0000000000 65535 f \n'
        for offset in offsets[1:]:data+=f'{offset:010d} 00000 n \n'.encode()
        data+=b'trailer\n<< /Size 4 /Root 1 0 R >>\nstartxref\n'+str(xref).encode()+b'\n%%EOF'
        with self.assertRaisesRegex(ValueError,'PDF scan không có text layer'):
            extract(data,'.pdf')

    def test_paragraph_clo_and_unicode_nfc(self):
        draft=parse(['Tên học phần: Mạng\nMã học phần: 00012\nSố tín chỉ: 3\nChương 1. Cơ bản\n1.1. DNS\n5. CHUẨN ĐẦU RA\nCLO1.1*: Giải thích\nhệ thống.\n6. NỘI DUNG HỌC PHẦN'], [])
        self.assertEqual(draft['course']['name'],'Mạng')
        self.assertEqual(draft['clos'][0]['description'],'Giải thích hệ thống.')

    def test_docx_and_text_keep_all_nested_codes_and_original_names(self):
        codes=['2.1','2.1.1','2.1.2','2.2','2.2.1','2.1.1.1']
        lines=['Tên học phần: Mạng','Mã học phần: 0012','Số tín chỉ: 3','Chương 2. Hệ thống']+[code+'. Tên '+code for code in codes]
        for draft in [parse(['\n'.join(lines[:6]),'\n'.join(lines[6:])],[]),extract(docx_bytes(lines),'.docx')]:
            self.assertEqual(draft['chapters'][0]['topics'],[{'code':code,'name':'Tên '+code} for code in codes])
            self.assertFalse(any('thiếu chủ đề cha' in warning for warning in draft['warnings']))
            self.assertTrue(all('parent_topic_id' not in topic for topic in draft['chapters'][0]['topics']))

    def test_invalid_orphan_duplicate_and_cross_chapter_codes_are_preserved_with_warnings(self):
        draft=parse(['Chương 2. Hệ thống\n2.1.1. Thiếu cha\n2..3 Mã lỗi\n3.1. Sai chương\n2.2. Trùng một\n2.2. Trùng hai'],[])
        self.assertEqual([t['code'] for t in draft['chapters'][0]['topics']],['2.1.1','2..3','3.1','2.2','2.2'])
        for expected in ['thiếu chủ đề cha','không hợp lệ','không khớp chương','bị trùng']:
            self.assertTrue(any(expected in warning for warning in draft['warnings']),expected)


if __name__ == '__main__':
    unittest.main()
