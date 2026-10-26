"""Durable asynchronous generation queue; contains no model/RAG logic."""
import asyncio
import hashlib
import json
import os
import time
from pathlib import Path
from uuid import uuid4
from dataclasses import dataclass, field
from inference_metrics import inference_batch_size


@dataclass
class GenerationJob:
    fingerprint: str
    payload: dict = field(default_factory=dict)
    batch_size: int = 5
    total: int = 0
    state: str = "queued"
    questions: list = field(default_factory=list)
    error: str | None = None
    cancel_requested: bool = False
    heartbeat: float = field(default_factory=time.time)
    created_at: float = field(default_factory=time.time)
    resume_count: int = 0
    task: asyncio.Task | None = None
    inference_batch_size: int = 1

    def snapshot(self, queue_position=0):
        accepted = len(self.questions)
        total_batches = (self.total + self.batch_size - 1) // self.batch_size if self.total else 0
        completed_batches = min(total_batches, accepted // self.batch_size)
        if self.state in ("succeeded", "failed", "cancelled") and accepted:
            completed_batches = min(total_batches, (accepted + self.batch_size - 1) // self.batch_size)
        return {"status": self.state, "questions": list(self.questions),
                "error": self.error, "heartbeat": self.heartbeat,
                "cancelRequested": self.cancel_requested, "batchSize": self.batch_size,
                "completedBatches": completed_batches, "totalBatches": total_batches,
                "queuePosition": queue_position,
                "inferenceBatchSize":self.inference_batch_size,
                "checkpointBatchSize":self.batch_size}


class GenerationRegistry:
    def __init__(self, state_path=None, max_concurrent=1, telemetry=None):
        self.jobs = {}
        self.state_path = Path(state_path).resolve() if state_path else None
        self.registry_id = str(uuid4())
        self._slots = asyncio.Semaphore(max(1, int(max_concurrent)))
        self.telemetry = telemetry
        self._load()
        self._save()

    def _load(self):
        if not self.state_path or not self.state_path.exists():
            return
        try:
            data = json.loads(self.state_path.read_text(encoding="utf-8"))
            self.registry_id = str(data["registryId"])
            for key, row in data.get("jobs", {}).items():
                state = row.get("state", "failed")
                cancelled = bool(row.get("cancelRequested"))
                if state in ("running", "queued"):
                    state = "cancelled" if cancelled else "paused"
                self.jobs[key] = GenerationJob(
                    fingerprint=row["fingerprint"], payload=row.get("payload") or {},
                    batch_size=int(row.get("batchSize", 5)), total=int(row.get("total", 0)),
                    state=state, questions=list(row.get("questions") or []),
                    error=row.get("error"), cancel_requested=cancelled,
                    heartbeat=float(row.get("heartbeat", time.time())),
                    created_at=float(row.get("createdAt", row.get("heartbeat", time.time()))),
                    resume_count=int(row.get("resumeCount", 0)))
                job = self.jobs[key]
                try:
                    job.inference_batch_size = inference_batch_size(row.get('inferenceBatchSize', job.payload.get('inferenceBatchSize') or 1))
                except ValueError as exc:
                    raise RuntimeError('Invalid persisted inference mode; registry left unchanged') from exc
                if job.payload:
                    job.payload['inferenceBatchSize'] = job.inference_batch_size
        except (OSError, ValueError, KeyError, TypeError):
            self.jobs = {}
            self.registry_id = str(uuid4())

    def _save(self):
        if not self.state_path:
            return
        self.state_path.parent.mkdir(parents=True, exist_ok=True)
        data = {"version": 1, "registryId": self.registry_id, "jobs": {
            key: {"fingerprint": job.fingerprint, "payload": job.payload,
                  "batchSize": job.batch_size, "total": job.total, "state": job.state,
                  "questions": job.questions, "error": job.error,
                  "cancelRequested": job.cancel_requested, "heartbeat": job.heartbeat,
                  "createdAt": job.created_at, "resumeCount": job.resume_count,
                  "inferenceBatchSize": job.inference_batch_size}
            for key, job in self.jobs.items()}}
        temporary = self.state_path.with_name(self.state_path.name + ".tmp")
        temporary.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
        os.replace(temporary, self.state_path)

    def _queue_position(self, key):
        queued = [candidate for candidate, job in self.jobs.items()
                  if job.state in ("queued", "paused")]
        return queued.index(key) + 1 if key in queued else 0

    async def _launch(self, key, job, generate):
        async def run():
            telemetry_run = None
            try:
                async with self._slots:
                    if job.cancel_requested:
                        job.state = "cancelled"
                        return
                    job.state = "running"
                    job.error = None
                    job.heartbeat = time.time()
                    self._save()
                    telemetry_run = self.telemetry.begin(key, job) if self.telemetry else None

                    def progress(questions):
                        job.questions = list(questions)
                        job.heartbeat = time.time()
                        self._save()

                    async def heartbeat():
                        while True:
                            job.heartbeat = time.time()
                            await asyncio.sleep(5)

                    pulse = asyncio.create_task(heartbeat())
                    try:
                        result = await generate(progress, lambda: job.cancel_requested)
                        progress(result)
                        job.state = "cancelled" if job.cancel_requested else "succeeded"
                    finally:
                        pulse.cancel()
            except asyncio.CancelledError:
                job.state = "paused"
                job.error = None
                job.heartbeat = time.time()
                self._save()
                raise
            except Exception as exc:
                job.error = str(exc)[:500]
                job.state = "failed"
            finally:
                if telemetry_run:
                    await telemetry_run.finish(job.state, len(job.questions), job.error)
                elif self.telemetry and job.state in ("succeeded", "failed", "cancelled"):
                    # A queued cancellation or sampler startup failure still gets a factual
                    # lifecycle row; unavailable measurements remain N/A.
                    await asyncio.to_thread(self.telemetry.record_snapshot,
                        job.payload.get('_jobId'),key,job.state,job.total,len(job.questions),
                        job.batch_size,job.resume_count,job.error,job.created_at,time.time())
                if job.state != "paused":
                    job.heartbeat = time.time()
                    if job.state in ("succeeded", "failed", "cancelled"):
                        # The fingerprint keeps POST idempotent; source text is no longer needed.
                        job.payload = {}
                    self._save()

        job.state = "queued"
        job.task = asyncio.create_task(run())

    async def start(self, key, payload, generate):
        # Internal inference mode is pinned separately; keep legacy idempotency hashes.
        fingerprint_payload = {k:v for k,v in payload.items() if k not in ('inferenceBatchSize','_jobId')}
        fingerprint = hashlib.sha256(json.dumps(fingerprint_payload, sort_keys=True,
            ensure_ascii=False, separators=(",", ":")).encode()).hexdigest()
        existing = self.jobs.get(key)
        if existing:
            if payload.get('inferenceBatchSize') not in (None, existing.inference_batch_size):
                raise ValueError('Inference mode cannot change within a job')
            if existing.fingerprint != fingerprint:
                raise ValueError("Execution token already used with another payload")
            if existing.state == "paused" and (existing.task is None or existing.task.done()):
                await self._launch(key, existing, generate)
            return self.status(key)
        if len(self.jobs) >= 500:
            for old_key, old in list(self.jobs.items()):
                if old.state in ("succeeded", "failed", "cancelled") and time.time() - old.heartbeat > 86400:
                    del self.jobs[old_key]
            if len(self.jobs) >= 500:
                raise RuntimeError("AI job registry is full; reconcile retained jobs first")
        batch_size = int(payload.get("batchSize", 5))
        if batch_size not in (5, 10):
            raise ValueError("Batch size must be 5 or 10")
        total = int(payload.get("questionCount") or sum(
            int(unit.get("nb", 0))+int(unit.get("th", 0))+int(unit.get("vd", 0))
            for unit in payload.get("units") or []))
        mode = inference_batch_size(payload.get('inferenceBatchSize') or 1)
        pinned = dict(payload, inferenceBatchSize=mode)
        job = GenerationJob(fingerprint, pinned, batch_size, total, inference_batch_size=mode)
        self.jobs[key] = job
        self._save()
        await self._launch(key, job, generate)
        return self.status(key)

    async def resume_all(self, factory, can_resume=None):
        for key, job in self.jobs.items():
            if job.state == "paused" and not job.cancel_requested:
                # Feature-gated payloads stay paused, with checkpoints intact.
                if can_resume is not None and not can_resume(job.payload):
                    continue
                try:
                    job.resume_count += 1
                    await self._launch(key, job, factory(job.payload, list(job.questions)))
                except Exception as exc:
                    job.state = "failed"
                    job.error = str(exc)[:500]
                    self._save()

    def status(self, key):
        if key not in self.jobs:
            raise KeyError(key)
        return self.jobs[key].snapshot(self._queue_position(key))

    def cancel(self, key):
        if key not in self.jobs:
            raise KeyError(key)
        self.jobs[key].cancel_requested = True
        self.jobs[key].heartbeat = time.time()
        self._save()
        return self.status(key)
