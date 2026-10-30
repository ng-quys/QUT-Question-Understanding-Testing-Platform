"""Durable telemetry facade: spool first, one cross-process Excel writer, safe retry."""
import asyncio
import hashlib
import json
import logging
import os
import shutil
import subprocess
import threading
import time
from datetime import datetime, timezone
from pathlib import Path
from inference_metrics import CURRENT, RunMetrics

logger=logging.getLogger('examflow.telemetry')
try:
    import psutil
    from openpyxl import Workbook
except ImportError:
    psutil=Workbook=None

class TelemetryRun:
    def __init__(self,owner,token,job):
        self.owner,self.token,self.job=owner,token,job;self.started=time.time();self._stop=False
        self.ai_cpu=[];self.ollama_cpu=[];self.ai_ram=[];self.ollama_ram=[];self.system_ram=[]
        job_id=job.payload.get('_jobId')
        self.metrics=RunMetrics({'runId':f'{job_id or "NA"}:{token}:{job.resume_count}:{time.time_ns()}','inferenceBatchSize':getattr(job,'inference_batch_size',1),'checkpointBatchSize':job.batch_size,'modelName':os.getenv('OLLAMA_MODEL','qwen2.5:7b'),'modelDigest':None,'caseId':job.payload.get('benchmarkCaseId'),'temperature':None,'seed':None,'num_ctx':2048,'num_predict':850,'startCondition':'uncontrolled','sampleSeconds':owner.sample_seconds,'acceptedAtStart':len(job.questions)})
        self.context_token=CURRENT.set(self.metrics);self._task=asyncio.create_task(self._sample())

    async def _sample(self):
        if psutil is None:return
        ai=psutil.Process(os.getpid());ollama=self.owner.ollama_process();children={};ai.cpu_percent(None)
        if ollama:ollama.cpu_percent(None)
        while not self._stop:
            try:
                self.ai_cpu.append(ai.cpu_percent(None));self.ai_ram.append(ai.memory_info().rss/1048576);memory=psutil.virtual_memory();self.system_ram.append(memory.percent)
                resource={'elapsedSeconds':time.time()-self.started,'aiCpu':self.ai_cpu[-1],'aiRamMB':self.ai_ram[-1],'systemRamPercent':self.system_ram[-1],'availableRamMB':memory.available/1048576,'gpuPercent':None,'vramMB':None,'ollamaCpu':None,'ollamaRamMB':None}
                if ollama and ollama.is_running():
                    cpu=ollama.cpu_percent(None);ram=ollama.memory_info().rss/1048576
                    for child in ollama.children(recursive=True):
                        if child.pid not in children:children[child.pid]=child;child.cpu_percent(None)
                    for child in children.values():
                        if child.is_running():cpu+=child.cpu_percent(None);ram+=child.memory_info().rss/1048576
                    self.ollama_cpu.append(cpu);self.ollama_ram.append(ram);resource.update(ollamaCpu=cpu,ollamaRamMB=ram)
                if shutil.which('nvidia-smi'):resource.update(await asyncio.to_thread(self.owner.gpu_sample))
                self.metrics.resources.append(resource)
            except (psutil.Error,OSError):pass
            await asyncio.sleep(self.owner.sample_seconds)

    async def finish(self,status,accepted,error):
        self._stop=True
        if not self._task.done():await self._task
        ended=time.time();processing=max(0,ended-self.started);waiting=max(0,self.started-self.job.created_at)
        row=[self.token,_stamp(self.started),_stamp(ended),status,self.job.total,accepted,self.job.batch_size,round(waiting,3),round(processing,3),round(processing/accepted,3) if accepted else None,round(accepted*60/processing,3) if processing else None,_avg(self.ai_cpu),_max(self.ai_cpu),_max(self.ai_ram),_avg(self.ollama_cpu),_max(self.ollama_cpu),_max(self.ollama_ram),_max(self.system_ram),self.job.resume_count,error or '']
        try:await asyncio.to_thread(self.owner.record,{'legacy':row,'jobId':self.job.payload.get('_jobId'),'startedEpoch':self.started,'endedEpoch':ended,'metricsAvailable':True,**self.metrics.export()})
        except Exception:logger.exception('TELEMETRY_WRITE_FAILED token=%s',self.token)
        finally:CURRENT.reset(self.context_token)

class ExcelTelemetry:
    def __init__(self,path,sample_seconds=1.0,retry_seconds=10.0):
        self.path=Path(path).resolve();self.sample_seconds=max(.2,float(sample_seconds));self.pending=self.path.parent/'.telemetry-pending';self.lock_path=self.path.with_suffix('.lock');self._lock=threading.Lock();self.retry_seconds=float(retry_seconds);self._closed=False
        if self.available and self.retry_seconds>0:threading.Thread(target=self._retry_loop,name='ai-telemetry-writer',daemon=True).start()
    @property
    def available(self):return psutil is not None and Workbook is not None
    def begin(self,token,job):return TelemetryRun(self,token,job) if self.available else None
    def record(self,event):
        if not self.available:return False
        try:
            self.pending.mkdir(parents=True,exist_ok=True);identity=f'{event.get("jobId") or "NA"}:{(event.get("legacy") or ["NA"])[0]}';stem=hashlib.sha256(identity.encode()).hexdigest();target=self.pending/(f'{stem}-{time.time_ns()}-{os.getpid()}.json');temporary=target.with_suffix(f'.{threading.get_ident()}.tmp');temporary.write_text(json.dumps(event,ensure_ascii=False,allow_nan=False),encoding='utf-8');os.replace(temporary,target);return self.flush_pending()
        except (OSError,ValueError,TypeError):
            # Telemetry is deliberately best-effort and must never change the AI job
            # or its credit settlement. The caller can continue normally.
            logger.warning('TELEMETRY_SPOOL_FAILED path=%s',self.pending,exc_info=True)
            return False
    def record_snapshot(self,job_id,token,status,requested,accepted,checkpoint_batch=5,resume_count=0,error=None,created_at=None,ended_at=None):
        ended=ended_at or time.time();row=[str(token),_stamp(created_at) if created_at else 'N/A',_stamp(ended),status,requested,accepted,checkpoint_batch,None,None,None,None,None,None,None,None,None,None,None,resume_count,error or '']
        self.record({'legacy':row,'jobId':job_id,'startedEpoch':created_at,'endedEpoch':ended,'metricsAvailable':False,'configuration':{},'inferences':[],'resources':[],'questions':[],'retries':None,'malformedResponses':None,'regenerationRequests':None,'retrievalSeconds':None,'duplicateSeconds':None})
    def flush_pending(self):
        from benchmark_workbook import write
        with self._lock:
            handle=self._acquire()
            if handle is None:return False
            try:
                files=sorted(self.pending.glob('*.json')) if self.pending.exists() else [];events=[json.loads(file.read_text(encoding='utf-8')) for file in files]
                if events or not self.path.exists():write(self.path,events)
                for file in files:file.unlink(missing_ok=True)
                return True
            except (OSError,PermissionError,ValueError,json.JSONDecodeError):logger.warning('TELEMETRY_DEFERRED path=%s',self.path,exc_info=True);return False
            finally:self._release(handle)
    def ensure(self):
        if self.available:self.flush_pending()
    def close(self):self._closed=True
    def _retry_loop(self):
        while not self._closed:
            time.sleep(self.retry_seconds)
            try:self.flush_pending()
            except Exception:logger.exception('TELEMETRY_RETRY_FAILED')
    def _acquire(self):
        self.lock_path.parent.mkdir(parents=True,exist_ok=True)
        try:return os.open(self.lock_path,os.O_CREAT|os.O_EXCL|os.O_WRONLY)
        except FileExistsError:
            try:
                if time.time()-self.lock_path.stat().st_mtime>300:self.lock_path.unlink();return self._acquire()
            except OSError:pass
            return None
    def _release(self,handle):
        if handle is not None:
            os.close(handle)
            try:self.lock_path.unlink()
            except OSError:pass
    @staticmethod
    def gpu_sample():
        try:
            run=subprocess.run(['nvidia-smi','--query-gpu=utilization.gpu,memory.used','--format=csv,noheader,nounits'],capture_output=True,text=True,timeout=2);values=[list(map(float,line.split(','))) for line in run.stdout.splitlines() if line.strip()] if not run.returncode else []
            return {'gpuPercent':max(v[0] for v in values),'vramMB':sum(v[1] for v in values)} if values else {}
        except (OSError,ValueError,subprocess.TimeoutExpired):return {}
    @staticmethod
    def ollama_process():
        if psutil is None:return None
        for process in psutil.process_iter(['name','cmdline']):
            try:
                if (process.info.get('name') or '').lower()=='ollama.exe' and 'serve' in ' '.join(process.info.get('cmdline') or []).lower():return process
            except (psutil.Error,OSError):continue
        return None

def _stamp(epoch):return datetime.fromtimestamp(epoch,timezone.utc).astimezone().isoformat(timespec='seconds')
def _avg(values):return round(sum(values)/len(values),3) if values else None
def _max(values):return round(max(values),3) if values else None
