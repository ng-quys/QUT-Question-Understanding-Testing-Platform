import tempfile
import unittest
import os
import asyncio
import json
from pathlib import Path
from unittest.mock import patch

from openpyxl import load_workbook
from durable_telemetry import ExcelTelemetry


class DurableTelemetryTests(unittest.TestCase):
    def temporary(self):
        root=Path(__file__).resolve().parent/'.test-tmp';root.mkdir(exist_ok=True)
        return tempfile.TemporaryDirectory(dir=root)
    def event(self,status='unknown',accepted=2):
        return {'legacy':['token-22','start','end',status,3,accepted,5,None,None,None,None,None,None,None,None,None,None,None,0,''],
                'jobId':22,'metricsAvailable':False,'configuration':{},'inferences':[],
                'resources':[],'questions':[],'retries':None,'malformedResponses':None,
                'regenerationRequests':None,'retrievalSeconds':None,'duplicateSeconds':None}

    def test_fixed_workbook_has_six_sheets_and_upserts_job_token(self):
        with self.temporary() as directory:
            path=Path(directory)/'ai_generator_results.xlsx';telemetry=ExcelTelemetry(path,retry_seconds=0)
            telemetry.record(self.event());telemetry.record(self.event('succeeded'))
            book=load_workbook(path)
            self.assertEqual(['Job Summary','Inference Metrics','Resource Metrics','Question Quality','Comparison','Configuration'],book.sheetnames)
            self.assertEqual(2,book['Job Summary'].max_row)
            self.assertEqual('succeeded',book['Job Summary']['D2'].value)
            self.assertEqual(22,book['Job Summary']['U2'].value)
            self.assertEqual('N/A',book['Job Summary']['AE2'].value)
            self.assertTrue(book['Comparison']._charts)
            book.close()

    def test_locked_excel_keeps_spool_and_later_flushes(self):
        with self.temporary() as directory:
            path=Path(directory)/'ai_generator_results.xlsx';telemetry=ExcelTelemetry(path,retry_seconds=0)
            import benchmark_workbook
            real=benchmark_workbook.write
            with patch('benchmark_workbook.write',side_effect=PermissionError('open in Excel')):
                telemetry.record(self.event())
            self.assertEqual(1,len(list((path.parent/'.telemetry-pending').glob('*.json'))))
            with patch('benchmark_workbook.write',side_effect=real):self.assertTrue(telemetry.flush_pending())
            self.assertEqual(0,len(list((path.parent/'.telemetry-pending').glob('*.json'))))
            self.assertTrue(path.exists())

    def test_late_unknown_snapshot_does_not_downgrade_terminal_measurement(self):
        with self.temporary() as directory:
            path=Path(directory)/'ai_generator_results.xlsx';telemetry=ExcelTelemetry(path,retry_seconds=0)
            event=self.event('succeeded',2);event.update(metricsAvailable=True,
                configuration={'runId':'run-22','inferenceBatchSize':3},inferences=[],resources=[],questions=[])
            telemetry.record(event);telemetry.record(self.event('unknown',2))
            book=load_workbook(path,read_only=True);summary=book['Job Summary']
            self.assertEqual(2,summary.max_row);self.assertEqual('succeeded',summary['D2'].value)
            self.assertEqual(3,summary['V2'].value);book.close()

    def test_existing_unrelated_job_is_preserved(self):
        with self.temporary() as directory:
            path=Path(directory)/'ai_generator_results.xlsx';telemetry=ExcelTelemetry(path,retry_seconds=0)
            telemetry.record(self.event())
            other=self.event('failed',0);other['jobId']=23;other['legacy'][0]='token-23'
            telemetry.record(other);telemetry.record(self.event('succeeded'))
            book=load_workbook(path,read_only=True)
            self.assertEqual(3,book['Job Summary'].max_row);book.close()

    def test_existing_detail_rows_repair_only_factual_summary_values(self):
        with self.temporary() as directory:
            path=Path(directory)/'ai_generator_results.xlsx';telemetry=ExcelTelemetry(path,retry_seconds=0)
            event=self.event('succeeded',2);event.update(metricsAvailable=True,startedEpoch=100,endedEpoch=110,
                legacy=['token-22','start','end','succeeded',3,2,5,2,10,5,12,None,None,None,None,None,None,None,0,''],
                configuration={'runId':'run-22','inferenceBatchSize':1},
                inferences=[{'callId':1,'prompt_eval_count':11,'eval_count':7,'wallSeconds':3}],resources=[],questions=[])
            telemetry.record(event)
            # Simulate an older workbook/template that did not carry the aggregates.
            book=load_workbook(path);summary=book['Job Summary'];summary['AR2']='N/A';summary['AS2']='N/A';summary['BA2']='N/A';book.save(path);book.close()
            telemetry.flush_pending()
            # ensure() also performs maintenance when there is no pending event.
            from benchmark_workbook import write
            write(path,[])
            book=load_workbook(path,data_only=False);summary=book['Job Summary']
            self.assertEqual(11,summary['AR2'].value);self.assertEqual(7,summary['AS2'].value)
            self.assertEqual(12,summary['BA2'].value);book.close()

    def test_rejected_questions_include_code_and_human_reason(self):
        with self.temporary() as directory:
            path=Path(directory)/'ai_generator_results.xlsx';telemetry=ExcelTelemetry(path,retry_seconds=0)
            event=self.event('succeeded',1);event.update(metricsAvailable=True,
                configuration={'runId':'run-reasons','inferenceBatchSize':1,'checkpointBatchSize':5},
                questions=[
                    {'candidate':None,'normalized':None,'decision':'response_ValueError','callId':1},
                    {'candidate':{'content':'Câu trùng'},'normalized':None,'decision':'duplicate_semantic','callId':2},
                    {'candidate':{'content':'Sai CLO','cloId':99},'normalized':None,'decision':'validation:CLO','callId':3},
                    {'candidate':{'content':'Thiếu nguồn'},'normalized':None,'decision':'validation:evidenceQuote','callId':4,
                     'evidenceMatchType':'missing','evidenceChunkId':'chunk-4','contextFingerprint':'a'*64}],
                inferences=[],resources=[])
            telemetry.record(event);book=load_workbook(path,read_only=True);sheet=book['Question Quality']
            self.assertEqual(['response_ValueError','duplicate_semantic','validation:CLO','validation:evidenceQuote'],
                             [sheet.cell(row,4).value for row in range(2,6)])
            self.assertIn('JSON',sheet.cell(2,5).value);self.assertIn('CLO',sheet.cell(4,5).value)
            self.assertIn('nguồn',sheet.cell(5,5).value);book.close()

    def test_evidence_audit_columns_do_not_store_context(self):
        with self.temporary() as directory:
            path=Path(directory)/'ai_generator_results.xlsx';telemetry=ExcelTelemetry(path,retry_seconds=0)
            event=self.event('succeeded',1);event.update(metricsAvailable=True,
                configuration={'runId':'run-evidence','inferenceBatchSize':3},inferences=[],resources=[],
                questions=[{'candidate':{'content':'Q'},'normalized':{'content':'Q','options':[]},'decision':'accepted','callId':1,
                            'evidenceMatchType':'canonical_exact','evidenceFailureReason':None,
                            'evidenceChunkAlias':'chunk-1','evidenceChunkId':'index:7','contextFingerprint':'b'*64}],
                retrievalManifests=[{'callId':1,'cloId':2,'contextFingerprint':'b'*64,
                    'chunks':[{'alias':'chunk-1','id':'index:7','similarity':.9}]}])
            telemetry.record(event);book=load_workbook(path,read_only=True);sheet=book['Question Quality']
            headers={sheet.cell(1,c).value:c for c in range(1,sheet.max_column+1)}
            self.assertEqual('canonical_exact',sheet.cell(2,headers['Evidence match type']).value)
            self.assertEqual('chunk-1',sheet.cell(2,headers['Evidence chunk alias']).value)
            self.assertEqual('index:7',sheet.cell(2,headers['Evidence chunk ID']).value)
            self.assertEqual('b'*64,sheet.cell(2,headers['Context fingerprint']).value)
            self.assertNotIn('Context text',headers)
            config=list(book['Configuration'].iter_rows(min_row=2,values_only=True))
            manifest=json.loads(next(row[2] for row in config if str(row[1]).startswith('retrievalManifest.call-1')))
            self.assertNotIn('text',manifest['chunks'][0]);self.assertEqual('index:7',manifest['chunks'][0]['id']);book.close()


if __name__=='__main__':unittest.main()
