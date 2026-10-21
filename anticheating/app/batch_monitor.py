"""Bounded, server-wide round robin. No camera, model or cloud imports here."""
import base64
import threading
import time
from collections import OrderedDict
from dataclasses import dataclass, field
from datetime import datetime


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
            if not 4 <= len(image) <= 250_000 or not image.startswith(b"\xff\xd8") or not 960 <= len(audio) <= 32000 or len(audio) % 2:
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
            events = evaluator.analyze(item, image, audio, self.clock(), generation)
            with self.lock:
                self.tick()
                if self.sessions.get(item.attempt) is not item or generation != self.generation or item.attempt not in self.selected:
                    return True
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
                if not self.process_one(evaluator):
                    self.stop_event.wait(.05)
        finally:
            evaluator.close()
