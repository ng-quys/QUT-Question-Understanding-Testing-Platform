"""Transport lifecycle around the existing generator; contains no model/RAG logic."""
import asyncio
import hashlib
import json
import time
from dataclasses import dataclass, field


@dataclass
class GenerationJob:
    fingerprint: str
    state: str = "running"
    questions: list = field(default_factory=list)
    error: str | None = None
    cancel_requested: bool = False
    heartbeat: float = field(default_factory=time.time)
    task: asyncio.Task | None = None

    def snapshot(self):
        return {"status": self.state, "questions": list(self.questions),
                "error": self.error, "heartbeat": self.heartbeat,
                "cancelRequested": self.cancel_requested}


class GenerationRegistry:
    def __init__(self):
        self.jobs = {}

    async def start(self, key, payload, generate):
        # No await occurs between lookup and registration: atomic on this event loop.
        fingerprint = hashlib.sha256(json.dumps(payload, sort_keys=True,
            ensure_ascii=False, separators=(",", ":")).encode()).hexdigest()
        existing = self.jobs.get(key)
        if existing:
            if existing.fingerprint != fingerprint:
                raise ValueError("Execution token already used with another payload")
            return existing.snapshot()
        # Bounded terminal cache; never evict an active task.
        if len(self.jobs) >= 500:
            for old_key, old in list(self.jobs.items()):
                if old.state != "running" and time.time() - old.heartbeat > 86400:
                    del self.jobs[old_key]
            if len(self.jobs) >= 500:
                raise RuntimeError("AI job registry is full; reconcile retained jobs first")
        job = GenerationJob(fingerprint)
        self.jobs[key] = job

        def progress(questions):
            job.questions = list(questions)
            job.heartbeat = time.time()

        async def heartbeat():
            while True:
                job.heartbeat = time.time()
                await asyncio.sleep(5)

        async def run():
            pulse = asyncio.create_task(heartbeat())
            try:
                result = await generate(progress, lambda: job.cancel_requested)
                progress(result)
                job.state = "cancelled" if job.cancel_requested else "succeeded"
            except asyncio.CancelledError:
                job.error = "AI worker stopped; backend must reconcile saved checkpoints"
                job.state = "failed"
                raise
            except Exception as exc:
                # Accepted checkpoints survive an error; backend decides the bill.
                job.error = str(exc)[:500]
                job.state = "failed"
            finally:
                pulse.cancel()
                job.heartbeat = time.time()

        job.task = asyncio.create_task(run())
        return job.snapshot()

    def status(self, key):
        if key not in self.jobs:
            raise KeyError(key)
        return self.jobs[key].snapshot()

    def cancel(self, key):
        if key not in self.jobs:
            raise KeyError(key)
        # Do not cancel a model call blindly: wait for it to return/timeout.
        self.jobs[key].cancel_requested = True
        return self.jobs[key].snapshot()
