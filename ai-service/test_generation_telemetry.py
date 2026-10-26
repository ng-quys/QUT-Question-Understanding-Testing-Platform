import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace

from generation_telemetry import ExcelTelemetry, HEADERS


class ExcelTelemetryTests(unittest.TestCase):
    def test_research_sheets_keep_legacy_and_leave_expert_labels_blank(self):
        from openpyxl import load_workbook
        from inference_metrics import RunMetrics
        with tempfile.TemporaryDirectory() as directory:
            path=Path(directory)/'metrics.xlsx';telemetry=ExcelTelemetry(path)
            row=['main-1-1','start','end','succeeded',3,0,5,0,1,None,0]+[None]*6+[None,0,'']
            telemetry.append(row)
            metrics=RunMetrics({'runId':'main-1-1','inferenceBatchSize':1,'checkpointBatchSize':5})
            metrics.question({'content':'=unsafe Excel formula'},'validation',1)
            telemetry.append_research(row,metrics.export())
            book=load_workbook(path)
            self.assertTrue({'AI Jobs','Job Summary','Inference Metrics','Resource Metrics','Question Quality','Comparison','Configuration'}<=set(book.sheetnames))
            self.assertEqual(2,book['AI Jobs'].max_row)
            self.assertTrue(book['Job Summary']['AL2'].value.startswith('=IF'))
            self.assertEqual("'=unsafe Excel formula",book['Question Quality']['D2'].value)
            self.assertTrue(all(book['Question Quality'].cell(2,c).value is None for c in range(15,21)))
            book.close()
    def test_ensure_creates_header_only_workbook(self):
        try:
            from openpyxl import load_workbook
        except ImportError:
            self.skipTest("openpyxl is optional in this test environment")
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "metrics.xlsx"
            telemetry = ExcelTelemetry(path)
            telemetry.ensure()
            telemetry.ensure()
            workbook = load_workbook(path, read_only=True)
            values = list(workbook["AI Jobs"].values)
            workbook.close()
            self.assertEqual([tuple(HEADERS)], values)

    def test_appends_excel_rows_without_overwriting_history(self):
        try:
            from openpyxl import load_workbook
        except ImportError:
            self.skipTest("openpyxl is optional in this test environment")
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "metrics.xlsx"
            telemetry = ExcelTelemetry(path)
            row = ["token-1"] + [None] * (len(HEADERS) - 1)
            telemetry.append(row)
            row[0] = "token-2"
            telemetry.append(row)
            workbook = load_workbook(path, read_only=True)
            values = list(workbook["AI Jobs"].values)
            workbook.close()
            self.assertEqual(tuple(HEADERS), values[0])
            self.assertEqual("token-1", values[1][0])
            self.assertEqual("token-2", values[2][0])


if __name__ == "__main__":
    unittest.main()
