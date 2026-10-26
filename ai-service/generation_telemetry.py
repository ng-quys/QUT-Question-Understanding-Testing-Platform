"""Best-effort local performance telemetry for AI generation jobs."""
import asyncio
import logging
import os
import threading
import time
import json
import shutil
import subprocess
from inference_metrics import CURRENT, RunMetrics
from datetime import datetime, timezone
from pathlib import Path

logger = logging.getLogger("examflow.telemetry")

try:
    import psutil
    from openpyxl import Workbook, load_workbook
    from openpyxl.styles import Font, PatternFill
except ImportError:  # Generation must still work when optional telemetry packages are absent.
    psutil = None
    Workbook = load_workbook = Font = PatternFill = None


HEADERS = [
    "Job token", "Bắt đầu", "Kết thúc", "Trạng thái", "Số câu yêu cầu",
    "Số câu hợp lệ", "Batch size", "Thời gian chờ (giây)",
    "Thời gian xử lý (giây)", "Trung bình giây/câu", "Tốc độ câu/phút",
    "AI CPU trung bình (%)", "AI CPU cao nhất (%)", "AI RAM cao nhất (MB)",
    "Ollama CPU trung bình (%)", "Ollama CPU cao nhất (%)", "Ollama RAM cao nhất (MB)",
    "RAM toàn máy cao nhất (%)", "Số lần tiếp tục", "Lỗi"
]


class TelemetryRun:
    def __init__(self, owner, token, job):
        self.owner, self.token, self.job = owner, token, job
        self.started = time.time()
        self.ai_cpu, self.ollama_cpu = [], []
        self.ai_ram, self.ollama_ram, self.system_ram = [], [], []
        self._stop = False
        self.metrics = RunMetrics({'runId':f'{token}:{job.resume_count}:{time.time_ns()}', 'inferenceBatchSize':getattr(job,'inference_batch_size',1),
            'checkpointBatchSize':job.batch_size, 'modelName':os.getenv('OLLAMA_MODEL','qwen2.5:7b'),
            'modelDigest':None, 'caseId':job.payload.get('benchmarkCaseId'),
            'temperature':None, 'seed':None, 'num_ctx':2048, 'num_predict':850,
            'startCondition':'uncontrolled', 'sampleSeconds':owner.sample_seconds,
            'acceptedAtStart':len(job.questions)})
        self.context_token = CURRENT.set(self.metrics)
        self._task = asyncio.create_task(self._sample())

    async def _sample(self):
        if psutil is None:
            return
        ai = psutil.Process(os.getpid())
        ollama = self.owner.ollama_process()
        ai.cpu_percent(None)
        children = {}
        if ollama:
            ollama.cpu_percent(None)
        while not self._stop:
            try:
                self.ai_cpu.append(ai.cpu_percent(None))
                self.ai_ram.append(ai.memory_info().rss / 1024 / 1024)
                self.system_ram.append(psutil.virtual_memory().percent)
                resource={'elapsedSeconds':time.time()-self.started,
                          'aiCpu':self.ai_cpu[-1], 'aiRamMB':self.ai_ram[-1],
                          'systemRamPercent':self.system_ram[-1],
                          'availableRamMB':psutil.virtual_memory().available/1024/1024,
                          'gpuPercent':None,'vramMB':None,'ollamaCpu':None,'ollamaRamMB':None}
                if ollama and ollama.is_running():
                    self.ollama_cpu.append(ollama.cpu_percent(None))
                    self.ollama_ram.append(ollama.memory_info().rss / 1024 / 1024)
                    for child in ollama.children(recursive=True):
                        if child.pid not in children:
                            children[child.pid]=child;child.cpu_percent(None)
                    for child in children.values():
                        if child.is_running():
                            self.ollama_cpu[-1] += child.cpu_percent(None)
                            self.ollama_ram[-1] += child.memory_info().rss/1024/1024
                    resource.update(ollamaCpu=self.ollama_cpu[-1],ollamaRamMB=self.ollama_ram[-1])
                if shutil.which('nvidia-smi'):
                    gpu=await asyncio.to_thread(self.owner.gpu_sample)
                    resource.update(gpu)
                self.metrics.resources.append(resource)
            except (psutil.Error, OSError):
                pass
            await asyncio.sleep(self.owner.sample_seconds)

    async def finish(self, status, accepted, error):
        self._stop = True
        if not self._task.done():
            await self._task
        ended = time.time()
        processing = max(0.0, ended - self.started)
        queue_wait = max(0.0, self.started - self.job.created_at)
        row = [
            self.token,
            datetime.fromtimestamp(self.started, timezone.utc).astimezone().isoformat(timespec="seconds"),
            datetime.fromtimestamp(ended, timezone.utc).astimezone().isoformat(timespec="seconds"),
            status, self.job.total, accepted, self.job.batch_size,
            round(queue_wait, 3), round(processing, 3),
            round(processing / accepted, 3) if accepted else None,
            round(accepted * 60 / processing, 3) if processing > 0 else None,
            average(self.ai_cpu), maximum(self.ai_cpu), maximum(self.ai_ram),
            average(self.ollama_cpu), maximum(self.ollama_cpu), maximum(self.ollama_ram),
            maximum(self.system_ram), self.job.resume_count, error or ""
        ]
        try:
            await asyncio.to_thread(self.owner.append, row)
            await asyncio.to_thread(self.owner.append_research, row, self.metrics.export())
        except Exception:
            logger.exception("TELEMETRY_WRITE_FAILED token=%s", self.token)
        finally:
            CURRENT.reset(self.context_token)


class ExcelTelemetry:
    def __init__(self, path, sample_seconds=1.0):
        self.path = Path(path).resolve()
        self.sample_seconds = max(0.2, float(sample_seconds))
        self._lock = threading.Lock()

    @property
    def available(self):
        return psutil is not None and Workbook is not None

    def begin(self, token, job):
        return TelemetryRun(self, token, job) if self.available else None

    @staticmethod
    def gpu_sample():
        try:
            run=subprocess.run(['nvidia-smi','--query-gpu=utilization.gpu,memory.used',
                '--format=csv,noheader,nounits'],capture_output=True,text=True,timeout=2)
            if run.returncode: return {}
            values=[list(map(float,line.split(','))) for line in run.stdout.splitlines() if line.strip()]
            return {'gpuPercent':max(v[0] for v in values),'vramMB':sum(v[1] for v in values)}
        except (OSError,ValueError,subprocess.TimeoutExpired):return {}

    def append_research(self, legacy_row, metrics):
        from research_export import append_research_workbook
        with self._lock:
            event={'legacy':legacy_row, **metrics}
            # Preserve raw response/candidate/resource observations independently of Excel.
            with self.path.with_suffix('.research.jsonl').open('a',encoding='utf-8') as stream:
                stream.write(json.dumps(event,ensure_ascii=False,allow_nan=False)+'\n')
            append_research_workbook(self.path,event)

    @staticmethod
    def ollama_process():
        if psutil is None:
            return None
        for process in psutil.process_iter(["name", "cmdline"]):
            try:
                command = " ".join(process.info.get("cmdline") or []).lower()
                if (process.info.get("name") or "").lower() == "ollama.exe" and "serve" in command:
                    return process
            except (psutil.Error, OSError):
                continue
        return None

    def append(self, row):
        with self._lock:
            self.path.parent.mkdir(parents=True, exist_ok=True)
            if self.path.exists():
                workbook = load_workbook(self.path)
                sheet = workbook["AI Jobs"]
            else:
                workbook, sheet = self._new_workbook()
            sheet.append(row)
            for column in range(1, len(HEADERS) + 1):
                sheet.column_dimensions[sheet.cell(1, column).column_letter].width = min(
                    32, max(12, len(HEADERS[column - 1]) + 2))
            temporary = self.path.with_name(self.path.stem + ".tmp.xlsx")
            workbook.save(temporary)
            workbook.close()
            os.replace(temporary, self.path)

    def ensure(self):
        if not self.available or self.path.exists():
            return
        with self._lock:
            if self.path.exists():
                return
            self.path.parent.mkdir(parents=True, exist_ok=True)
            workbook, _ = self._new_workbook()
            temporary = self.path.with_name(self.path.stem + ".tmp.xlsx")
            workbook.save(temporary)
            workbook.close()
            os.replace(temporary, self.path)

    @staticmethod
    def _new_workbook():
        workbook = Workbook()
        sheet = workbook.active
        sheet.title = "AI Jobs"
        sheet.append(HEADERS)
        fill = PatternFill("solid", fgColor="172B4D")
        for cell in sheet[1]:
            cell.font = Font(color="FFFFFF", bold=True)
            cell.fill = fill
        sheet.freeze_panes = "A2"
        sheet.auto_filter.ref = "A1:T1"
        return workbook, sheet


def average(values):
    return round(sum(values) / len(values), 3) if values else None


def maximum(values):
    return round(max(values), 3) if values else None
