"""Bounded, server-wide round robin. No camera, model or cloud imports here."""
import base64
import queue
import threading
import time
from collections import OrderedDict
from dataclasses import dataclass, field
from uuid import uuid4
from datetime import datetime, timezone


@dataclass
class Session:
    attempt: int
    student: int
    room: int
    deadline: float
    reference: bytes
    seen: float
    frame: object = None
    last_received: float = 0
    last_processed: float = 0
    error: str = ""
    camera_bad_since: float = 0
    camera_good_since: float = 0
    camera_good_frames: int = 0
    camera_state: str = "checking"
    camera_reason: str = "checking"
    identity_lock_evidence_saved: bool = False
    generation: int = 0
    context: dict = field(default_factory=dict)


class BatchMonitor:
    def __init__(self, factory, group_size=5, slice_seconds=10, capacity=300,
                 clock=time.time, heartbeat_seconds=45):
        if not 1 <= group_size <= 5 or not 5 <= slice_seconds <= 120 or not 5 <= capacity <= 2000:
            raise ValueError("Invalid monitoring limits")
        self.factory, self.clock = factory, clock
        self.group_size, self.slice_seconds, self.capacity = group_size, slice_seconds, capacity
        self.heartbeat_seconds = heartbeat_seconds
        self.sessions = OrderedDict()
        self.lock = threading.RLock()
        self.stop_event = threading.Event()
        self.selected = ()
        self.offset, self.generation = 0, 0
        self.rotated = clock()
        self.model_status = "starting"
        self.thread = None
        self.cursor = 0
        self.preflights = queue.Queue(maxsize=16)
        self.offline_jobs = queue.Queue(maxsize=16)
        self.last_offline = 0

    def offline_analysis(self, data):
        if self.model_status != "ready":
            return {"ok": False, "reason": "ai_unavailable"}
        image = base64.b64decode(data["jpeg"], validate=True)
        reference = base64.b64decode(data["referencePhotoBase64"], validate=True)
        if not 4 <= len(image) <= 250000 or not image.startswith(b"\xff\xd8") or not 4 <= len(reference) <= 2*1024*1024 or not reference.startswith(b"\xff\xd8"):
            raise ValueError("Invalid offline JPEG")
        job = {"image": image, "reference": reference, "done": threading.Event(), "expires": self.clock()+8}
        try:
            self.offline_jobs.put_nowait(job)
        except queue.Full:
            return {"ok": False, "reason": "busy"}
        if not job["done"].wait(8):
            job["done"].set()
        return job.get("result", {"ok": False, "reason": "busy"})

    def process_offline(self, evaluator, live_busy=False):
        # Preflight always wins; live cameras keep their turn. At most one backfill
        # frame per ten seconds while live inference is busy, using the same models.
        if not self.preflights.empty() or (live_busy and self.clock()-self.last_offline < 10):
            return False
        try:
            job = self.offline_jobs.get_nowait()
        except queue.Empty:
            return False
        try:
            if not job["done"].is_set() and self.clock() < job["expires"]:
                self.last_offline = self.clock()
                job["result"] = evaluator.analyze_offline(job["image"], job["reference"])
        except Exception:
            job["result"] = {"ok": False, "reason": "analysis_failed"}
        finally:
            job["done"].set()
            self.offline_jobs.task_done()
        return True

    def preflight(self, data):
        if self.model_status != "ready":
            return {"verified": False, "reason": "ai_unavailable"}
        image = base64.b64decode(data["jpeg"], validate=True)
        reference = base64.b64decode(data["referencePhotoBase64"], validate=True)
        if not 4 <= len(image) <= 250000 or not image.startswith(b"\xff\xd8") or not 4 <= len(reference) <= 2*1024*1024 or not reference.startswith(b"\xff\xd8"):
            raise ValueError("Invalid verification image")
        job = {"image": image, "reference": reference, "done": threading.Event(), "expires": self.clock()+8}
        try:
            self.preflights.put_nowait(job)
        except queue.Full:
            return {"verified": False, "reason": "busy"}
        if not job["done"].wait(8):
            job["done"].set()
            return {"verified": False, "reason": "busy"}
        return job.get("result", {"verified": False, "reason": "ai_unavailable"})

    def process_preflight(self, evaluator):
        try:
            job = self.preflights.get_nowait()
        except queue.Empty:
            return False
        try:
            if not job["done"].is_set() and self.clock() < job["expires"]:
                job["result"] = evaluator.verify_identity(job["image"], job["reference"])
        except Exception:
            job["result"] = {"verified": False, "reason": "invalid_image"}
        finally:
            job["done"].set()
            self.preflights.task_done()
        return True

    def start(self):
        if self.thread is None:
            self.thread = threading.Thread(target=self.run, daemon=True, name="qut-shared-models")
            self.thread.start()

    def register(self, data):
        attempt, student = int(data["attemptId"]), int(data["studentId"])
        if attempt <= 0 or student <= 0:
            raise ValueError("Invalid identity")
        reference = base64.b64decode(data["referencePhotoBase64"], validate=True)
        if not 4 <= len(reference) <= 2 * 1024 * 1024 or not reference.startswith(b"\xff\xd8"):
            raise ValueError("Invalid reference JPEG")
        deadline = min(self.clock() + max(0, min(float(data["remainingSeconds"]), 86400)),
                       datetime.fromisoformat(data["sessionEnd"].replace("Z", "+00:00")).timestamp())
        with self.lock:
            self.tick()
            current = self.sessions.get(attempt)
            if current:
                if current.student != student:
                    raise ValueError("Attempt identity mismatch")
                current.seen = self.clock()
                current.deadline = min(current.deadline, deadline)  # retries never extend the exam
            else:
                if deadline <= self.clock():
                    raise ValueError("Exam ended")
                if len(self.sessions) >= self.capacity:
                    raise ValueError("Monitoring capacity reached")
                self.sessions[attempt] = Session(attempt, student, int(data.get("roomId") or 0),
                                                 deadline, reference, self.clock())
            return self.status(attempt)

    def tick(self):
        now = self.clock()
        for key, item in list(self.sessions.items()):
            if now >= item.deadline or now - item.seen > self.heartbeat_seconds:
                del self.sessions[key]
        keys = list(self.sessions)
        if keys and now - self.rotated >= self.slice_seconds:
            self.offset = self.offset + self.group_size if self.offset + self.group_size < len(keys) else 0
            self.rotated = now
        if self.offset >= len(keys):
            self.offset = 0
        selected = tuple(keys[self.offset:self.offset + self.group_size])
        if selected != self.selected:
            self.generation += 1
            for item in self.sessions.values():
                item.frame = None  # never process an image from a previous turn
            self.selected = selected
            self.rotated = now

    def status(self, attempt=None, touch=True):
        with self.lock:
            if touch and attempt in self.sessions:
                self.sessions[attempt].seen = self.clock()
            self.tick()
            if attempt is None:
                return {"ok": True, "mode": "batch", "modelStatus": self.model_status,
                        "groupSize": self.group_size, "sliceSeconds": self.slice_seconds,
                        "sessions": [self.status(key, False) for key in self.sessions]}
            item = self.sessions.get(attempt)
            result = {"ok": True, "mode": "batch", "attemptId": attempt, "ready": False,
                      "captureAllowed": False, "lease": self.generation,
                      "pollAfterMs": 1500, "frameIntervalMs": 250}
            if item is None:
                return dict(result, status="unregistered", message="Chưa kết nối giám sát")
            result.update(cameraState=item.camera_state, cameraReason=item.camera_reason,
                          cameraBadSince=item.camera_bad_since or None)
            selected = attempt in self.selected
            allowed = selected and self.model_status == "ready"
            result.update(captureAllowed=allowed, lastProcessedAt=item.last_processed or None,
                          lastReceivedAt=item.last_received or None,
                          groupSize=self.group_size, sliceSeconds=self.slice_seconds)
            if self.model_status != "ready":
                return dict(result, status=self.model_status, message="Giám sát chưa sẵn sàng")
            if not selected:
                return dict(result, status="waiting", message="Đang chờ lượt giám sát")
            if item.error:
                return dict(result, status="error", message=item.error)
            fresh = item.generation == self.generation and self.clock() - item.last_processed < 15
            return dict(result, ready=fresh, status="monitoring" if fresh else "connecting",
                        message="Đang giám sát" if fresh else "Đang kết nối camera và micro")

    def frame(self, data):
        with self.lock:
            self.tick()
            key = int(data["attemptId"])
            item = self.sessions.get(key)
            if item is None:
                raise ValueError("Attempt not registered")
            item.seen = self.clock()
            if key not in self.selected or int(data["lease"]) != self.generation or self.model_status != "ready":
                return {"accepted": False, "reason": "not_selected"}
            if self.clock() - item.last_received < .2:
                return {"accepted": False, "reason": "rate_limited"}
            image = base64.b64decode(data["jpeg"], validate=True)
            audio = base64.b64decode(data.get("audioPcm16", ""), validate=True)
            if not 4 <= len(image) <= 250_000 or not image.startswith(b"\xff\xd8") or (len(audio) != 0 and not 960 <= len(audio) <= 32000) or len(audio) % 2:
                raise ValueError("Invalid frame size")
            item.frame = (image, audio, self.generation, self.clock())  # one latest slot per attempt
            item.last_received = self.clock()
            return {"accepted": True}

    def stop(self, attempt):
        with self.lock:
            self.sessions.pop(int(attempt), None)
            self.tick()
        return {"ok": True, "status": "stopped"}

    def process_one(self, evaluator):
        with self.lock:
            self.tick()
            keys = list(self.selected)
            if not keys:
                return False
            item = None
            for i in range(len(keys)):
                candidate = self.sessions[keys[(self.cursor + i) % len(keys)]]
                if candidate.frame:
                    item = candidate
                    self.cursor = (self.cursor + i + 1) % len(keys)
                    break
            if item is None:
                return False
            image, audio, generation, received = item.frame
            item.frame = None
            if self.clock() - received > 3:
                return True
        try:
            # Models are shared by this single worker; context is isolated per attempt.
            item.context["capture_uuid"] = str(uuid4())
            item.context["capture_at"] = datetime.fromtimestamp(received, timezone.utc).isoformat()
            events = evaluator.analyze(item, image, audio, self.clock(), generation)
            with self.lock:
                self.tick()
                if self.sessions.get(item.attempt) is not item or generation != self.generation or item.attempt not in self.selected:
                    return True
                # A sampling gap/rotation cannot turn missing coverage into a continuous failure.
                now = self.clock()
                if item.generation != generation or now-item.last_processed > 3:
                    item.camera_bad_since = item.camera_good_since = 0
                    item.camera_good_frames = 0
                    item.camera_state, item.camera_reason = "checking", "checking"
                good = item.context.get("camera_identity_good")
                if item.context.get("identity_mismatch_observed") or (good is False and item.context.get("camera_identity_reason") == "identity_mismatch"):
                    # Save and queue the first offending frame before exposing a locked state.
                    evaluator.deliver_identity_observation(item, image)
                if good is True:
                    item.camera_state, item.camera_reason = "checking", "checking"
                    item.camera_bad_since = 0
                    item.camera_good_since = item.camera_good_since or now
                    item.camera_good_frames += 1
                    if item.camera_good_frames >= 3 and now-item.camera_good_since >= 1:
                        item.camera_state, item.camera_reason = "verified", "verified"
                        item.identity_lock_evidence_saved = False
                        item.context.pop("identity_evidence", None)
                elif good is False:
                    if item.camera_state != "blocked":
                        item.camera_state = "checking"
                    item.camera_good_frames = 0
                    item.camera_good_since = 0
                    item.camera_bad_since = item.camera_bad_since or now
                    if now-item.camera_bad_since >= 5:
                        reason = item.context.get("camera_identity_reason", "no_face")
                        if reason == "identity_mismatch" and not item.identity_lock_evidence_saved:
                            evaluator.deliver_camera_lock(item, image, max(0, now-item.camera_bad_since))
                            item.identity_lock_evidence_saved = True
                        item.camera_state = "blocked"
                        item.camera_reason = reason
                evaluator.deliver(item, events)
                item.last_processed = self.clock()
                item.generation = generation
                item.error = ""
        except Exception:
            with self.lock:
                if self.sessions.get(item.attempt) is item:
                    item.error = "Không xử lý được ảnh/âm thanh; cần kiểm tra dịch vụ AI"
        return True

    def run(self):
        evaluator = None
        for retry in range(3):
            if self.stop_event.is_set():
                return
            try:
                evaluator = self.factory()
                self.model_status = "ready"
                break
            except Exception as error:
                print("Shared model startup failed: " + type(error).__name__, flush=True)
                self.model_status = "error"
                self.stop_event.wait(2 ** retry)
        if evaluator is None:
            return
        try:
            while not self.stop_event.is_set():
                checked = self.process_preflight(evaluator)
                monitored = self.process_one(evaluator)
                backfilled = self.process_offline(evaluator, live_busy=bool(self.sessions)) if not checked else False
                if not checked and not monitored and not backfilled:
                    self.stop_event.wait(.05)
        finally:
            evaluator.close()
