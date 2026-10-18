"""Exercise the real extract functions/route without loading model or DB modules."""
import ast
from io import BytesIO
from pathlib import Path
import unittest

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.testclient import TestClient
from pypdf import PdfReader, PdfWriter
from pypdf.generic import DictionaryObject, NameObject, DecodedStreamObject
from docx import Document


def text_pdf(padding=0):
    writer = PdfWriter()
    page = writer.add_blank_page(width=300, height=300)
    font = DictionaryObject({NameObject('/Type'): NameObject('/Font'),
        NameObject('/Subtype'): NameObject('/Type1'), NameObject('/BaseFont'): NameObject('/Helvetica')})
    page[NameObject('/Resources')] = DictionaryObject({NameObject('/Font'):
        DictionaryObject({NameObject('/F1'): writer._add_object(font)})})
    stream = DecodedStreamObject()
    stream.set_data(b'BT /F1 12 Tf 20 200 Td (ExamFlow upload contract test) Tj ET')
    page[NameObject('/Contents')] = writer._add_object(stream)
    if padding:
        writer.add_metadata({'/ContractPadding': 'x' * padding})
    output = BytesIO()
    writer.write(output)
    return output.getvalue()


def client():
    tree = ast.parse(Path(__file__).with_name('main.py').read_text(encoding='utf-8'))
    functions = [n for n in tree.body if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef))
        and n.name in ('extract', 'extract_documents')]
    namespace = dict(app=FastAPI(), File=File, HTTPException=HTTPException,
        UploadFile=UploadFile, PdfReader=PdfReader, BytesIO=BytesIO, Document=Document)
    exec(compile(ast.Module(body=functions, type_ignores=[]), 'real_extract_endpoint', 'exec'), namespace)
    return TestClient(namespace['app'])


class ExtractContractTest(unittest.TestCase):
    def test_pdf_7_7_mb_with_text(self):
        response = client().post('/extract', files=[('files', ('contract.pdf', text_pdf(7_700_000), 'application/pdf'))])
        self.assertEqual(200, response.status_code, response.text)
        self.assertIn('ExamFlow upload contract test', response.json()['documents'][0]['extractedText'])

    def test_missing_file_response_body(self):
        response = client().post('/extract')
        self.assertEqual(422, response.status_code)
        self.assertEqual(['body', 'files'], response.json()['detail'][0]['loc'])
        self.assertEqual('missing', response.json()['detail'][0]['type'])

    def test_wrong_field_is_missing_files(self):
        response = client().post('/extract', files={'file': ('contract.pdf', text_pdf(), 'application/pdf')})
        self.assertEqual(422, response.status_code)
        self.assertEqual(['body', 'files'], response.json()['detail'][0]['loc'])

    def test_unsupported_extension(self):
        response = client().post('/extract', files={'files': ('contract.exe', b'not a document')})
        self.assertEqual(400, response.status_code)

    def test_corrupt_pdf(self):
        response = client().post('/extract', files={'files': ('contract.pdf', b'%PDF-broken', 'application/pdf')})
        self.assertEqual(422, response.status_code)
        self.assertTrue(response.json()['detail'].startswith('Không đọc được'))

    def test_pdf_without_text_requires_ocr(self):
        output = BytesIO()
        writer = PdfWriter()
        writer.add_blank_page(300, 300)
        writer.write(output)
        response = client().post('/extract', files={'files': ('scan.pdf', output.getvalue(), 'application/pdf')})
        self.assertEqual(422, response.status_code)
        self.assertIn('PDF scan cần OCR', response.json()['detail'])


if __name__ == '__main__':
    unittest.main()
