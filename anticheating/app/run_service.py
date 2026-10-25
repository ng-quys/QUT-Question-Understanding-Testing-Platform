import json
import os
import subprocess
import urllib.request
import sys
import threading
import time
import shutil
import atexit
from datetime import datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT / "app") not in sys.path:
    sys.path.insert(0, str(ROOT / "app"))
from env_config import load_env_file, resolve_internal_secret
from model_config import prepare_models
from reference_photo import cache_reference_photo
load_env_file(ROOT / ".env")
load_env_file(ROOT.parent / ".env.storage")
HOST = os.environ.get("ANTICHEAT_SERVICE_HOST", "127.0.0.1")
PORT = int(os.environ.get("ANTICHEAT_SERVICE_PORT", "8000"))
configured_profiles = Path(os.environ.get("ANTICHEAT_PROFILE_DIR", "student-profiles"))
PROFILE_DIR = (configured_profiles if configured_profiles.is_absolute() else ROOT / configured_profiles).resolve()
PIPELINE = ROOT / "app" / "anticheating_pipeline.py"
BACKEND_CALLBACK = os.environ.get("ANTICHEAT_BACKEND_CALLBACK_URL", "http://127.0.0.1:8080/api/internal/anticheating/events")
SECRET, SECRET_SOURCE = resolve_internal_secret(ROOT)

lock = threading.Lock()
process = None
active_attempt = None
state_file = None
last_error = ""
active_deadline = None

# One shared model worker across ALL rooms, not five workers per room.
from batch_monitor import BatchMonitor
def shared_models():
    from shared_inference import SharedInference
    return SharedInference()
batch_monitor = BatchMonitor(shared_models,
    group_size=int(os.environ.get("ANTICHEAT_BATCH_SIZE", "5")),
    slice_seconds=int(os.environ.get("ANTICHEAT_BATCH_SECONDS", "10")),
    capacity=int(os.environ.get("ANTICHEAT_MAX_SESSIONS", "300")))


def json_response(handler, status, payload):
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json; charset=utf-8")
    handler.send_header("Access-Control-Allow-Origin", "*")
    handler.send_header("Access-Control-Allow-Headers", "Content-Type, X-AntiCheat-Secret")
    handler.send_header("Access-Control-Allow-Methods", "POST, GET, OPTIONS")
    handler.end_headers()
    handler.wfile.write(body)


def read_json(handler):
    length = int(handler.headers.get("Content-Length", "0"))
    if length < 0 or length > 8 * 1024 * 1024:
        raise ValueError("Yêu cầu vượt giới hạn dung lượng")
    raw = handler.rfile.read(length)
    return json.loads(raw.decode("utf-8") or "{}")


def state():
    worker = process
    running = worker is not None and worker.poll() is None
    data = {}
    snapshot_file = state_file
    if snapshot_file and snapshot_file.exists():
        try:
            data = json.loads(snapshot_file.read_text(encoding="utf-8"))
        except (ValueError, OSError):
            pass
    status = data.get("status", "loading" if running else "idle")
    message = data.get("message", "Chưa có phiên AI")
    if not running and active_attempt is not None and status != "stopped":
        status = "error"
        message = data.get("message") if data.get("status") == "error" else "Tiến trình AI đã dừng. Kiểm tra terminal Python."
    if running and status == "ready" and time.time() - data.get("heartbeat", 0) > 20:
        status, message = "error", "AI không xử lý hình ảnh trong hơn 20 giây"
    if last_error:
        status, message = "error", last_error
    return {"ok": True, "running": running, "ready": running and status == "ready",
            "status": status, "message": message, "attemptId": active_attempt,
            "serviceVersion": "qut-local-entry-v3"}


def stop_process():
    if process and process.poll() is None:
        process.terminate()
        try:
            process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait(timeout=2)


def start_attempt(attempt_id, student_id, remaining_seconds=None, session_end=None, clock_starts_on_ready=False, reference_image=None, reference_photo_base64=None):
    global process, active_attempt, state_file, last_error, active_deadline
    with lock:
        if process and process.poll() is None:
            if active_attempt != attempt_id:
                raise RuntimeError("Một phiên AI khác đang chạy. Bản demo chỉ hỗ trợ một sinh viên trên mỗi máy.")
            if state()["ready"]:
                if remaining_seconds is not None:
                    active_deadline = time.time() + max(0, float(remaining_seconds))
                    if session_end:
                        active_deadline = min(active_deadline, datetime.fromisoformat(session_end.replace("Z", "+00:00")).timestamp())
                return state()
            stop_process()
        last_error = ""
        # Use the exact student photo supplied by the authenticated backend.
        if reference_photo_base64 is not None:
            reference = cache_reference_photo(PROFILE_DIR, student_id, reference_photo_base64)
        else:
            # Backward compatibility for older backend callers and local-only tests.
            reference = Path(reference_image).resolve() if reference_image else PROFILE_DIR / f"{student_id}.jpg"
        if reference.name != f"{student_id}.jpg":
            raise ValueError("Ảnh tham chiếu không khớp ID sinh viên")
        if not reference.is_file():
            print(f"Missing student reference photo: {reference}", flush=True)
            raise FileNotFoundError(f"Chưa có ảnh khuôn mặt cho sinh viên ID {student_id}. Hãy tải ảnh ở Hồ sơ.")
        prepare_models(ROOT / "models")
        # InsightFace resolves <root>/models/buffalo_l, whereas release files live at identity/buffalo_l.
        source = ROOT / "models" / "identity" / "buffalo_l"
        destination = ROOT / "models" / "identity" / "models" / "buffalo_l"
        destination.mkdir(parents=True, exist_ok=True)
        for model in source.glob("*.onnx"):
            target = destination / model.name
            if not target.exists() or target.stat().st_size != model.stat().st_size or target.stat().st_mtime < model.stat().st_mtime:
                target.unlink(missing_ok=True)
                try:
                    target.hardlink_to(model)
                except OSError:
                    shutil.copy2(model, target)
        runtime_dir = ROOT / "runtime"
        runtime_dir.mkdir(exist_ok=True)
        state_file = runtime_dir / f"attempt-{attempt_id}.json"
        state_file.unlink(missing_ok=True)
        env = os.environ.copy()
        env.update({
            "ANTICHEAT_ATTEMPT_ID": str(attempt_id),
            "ANTICHEAT_STUDENT_ID": str(student_id),
            "ANTICHEAT_REFERENCE_IMAGE": str(reference),
            "ANTICHEAT_BACKEND_CALLBACK_URL": BACKEND_CALLBACK,
            "ANTICHEAT_INTERNAL_SECRET": SECRET,
            "ANTICHEAT_EVIDENCE_DIR": str(ROOT / "evidence" / f"attempt-{attempt_id}"),
            "ANTICHEAT_STATE_FILE": str(state_file),
            "PYTHONUNBUFFERED": "1",
        })
        process = subprocess.Popen([sys.executable, "-u", str(PIPELINE)], cwd=str(ROOT), env=env)
        active_attempt = attempt_id
        boot_started = time.monotonic()
        deadline = boot_started + 90
        while time.monotonic() < deadline:
            current = state()
            if current["ready"]:
                if remaining_seconds is not None:
                    elapsed = 0 if clock_starts_on_ready else time.monotonic() - boot_started
                    active_deadline = time.time() + max(0, float(remaining_seconds) - elapsed)
                    if session_end:
                        active_deadline = min(active_deadline, datetime.fromisoformat(session_end.replace("Z", "+00:00")).timestamp())
                print(f"AI ready for attempt {attempt_id}", flush=True)
                return current
            if current["status"] == "error" or not current["running"]:
                last_error = current["message"]
                stop_process()
                raise RuntimeError(last_error)
            time.sleep(0.2)
        stop_process()
        last_error = "AI khởi động quá 90 giây. Kiểm tra model, webcam, micro và terminal Python."
        raise RuntimeError(last_error)


def stop_attempt(attempt_id):
    global process, active_attempt, last_error, state_file, active_deadline
    with lock:
        if not process or process.poll() is not None:
            process = None
            active_attempt = None
            state_file = None
            active_deadline = None
            last_error = ""
            return {"ok": True, "status": "already_stopped", "attemptId": attempt_id}
        if active_attempt != attempt_id:
            raise RuntimeError("Attempt không khớp Anti-Cheating session đang chạy")
        process.terminate()
        try:
            process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait(timeout=2)
        process = None
        active_attempt = None
        state_file = None
        active_deadline = None
        last_error = ""
        return {"ok": True, "status": "stopped", "attemptId": attempt_id}


class Handler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        json_response(self, 200, {"ok": True})

    def do_GET(self):
        if self.path == "/health":
            json_response(self, 200, state())
            return
        json_response(self, 404, {"ok": False, "message": "Not found"})

    def do_POST(self):
        if self.headers.get("X-AntiCheat-Secret") != SECRET:
            json_response(self, 401, {"ok": False, "message": "Invalid internal secret"})
            return
        try:
            data = read_json(self)
            if self.path.startswith("/monitoring/"):
                if self.path == "/monitoring/offline-analysis":
                    result = batch_monitor.offline_analysis(data)
                elif self.path == "/monitoring/verify-identity":
                    result = batch_monitor.preflight(data)
                elif self.path == "/monitoring/register":
                    result = batch_monitor.register(data)
                elif self.path == "/monitoring/status":
                    result = batch_monitor.status(int(data["attemptId"]) if data.get("attemptId") else None)
                elif self.path == "/monitoring/frame":
                    result = batch_monitor.frame(data)
                elif self.path == "/monitoring/stop":
                    result = batch_monitor.stop(int(data["attemptId"]))
                else:
                    json_response(self, 404, {"ok": False, "message": "Not found"})
                    return
                json_response(self, 200, result)
                return
            if self.path == "/session/start":
                result = start_attempt(int(data["attemptId"]), int(data["studentId"]), data.get("remainingSeconds"), data.get("sessionEnd"), data.get("clockStartsOnReady", False), data.get("referenceImage"), data.get("referencePhotoBase64"))
                json_response(self, 200, result)
                return
            if self.path == "/session/stop":
                result = stop_attempt(int(data["attemptId"]))
                json_response(self, 200, result)
                return
            if self.path == "/event":
                with lock:
                    running = process is not None and process.poll() is None
                if not running:
                    raise RuntimeError("Anti-Cheating session chưa chạy")
                body = json.dumps(data).encode("utf-8")
                req = urllib.request.Request(
                    "http://127.0.0.1:8765/event",
                    data=body,
                    headers={"Content-Type": "application/json"},
                    method="POST",
                )
                with urllib.request.urlopen(req, timeout=2) as response:
                    if response.status < 200 or response.status >= 300:
                        raise RuntimeError("M7 Browser bridge từ chối event")
                json_response(self, 200, {"ok": True, "status": "forwarded"})
                return
            json_response(self, 404, {"ok": False, "message": "Not found"})
        except FileNotFoundError as exc:
            json_response(self, 409, {"ok": False, "message": str(exc)})
        except Exception as exc:
            json_response(self, 400, {"ok": False, "message": str(exc)})

    def log_message(self, format, *args):
        return


def deadline_worker():
    global last_error
    while True:
        time.sleep(1)
        with lock:
            if process and process.poll() is None and active_deadline is not None and time.time() >= active_deadline:
                stop_process()
                last_error = "Đã dừng AI vì hết thời gian bài thi"


class BoundedHTTPServer(ThreadingHTTPServer):
    daemon_threads = True
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.slots = threading.BoundedSemaphore(24)
    def process_request(self, request, address):
        request.settimeout(5)
        if not self.slots.acquire(blocking=False):
            try:
                request.sendall(b"HTTP/1.1 503 Service Unavailable\r\nContent-Length: 0\r\nConnection: close\r\n\r\n")
            finally:
                self.shutdown_request(request)
            return
        try:
            super().process_request(request, address)
        except Exception:
            self.slots.release()
            raise
    def process_request_thread(self, request, address):
        try:
            super().process_request_thread(request, address)
        finally:
            self.slots.release()


if __name__ == "__main__":
    from evidence_delivery import EvidenceDelivery
    evidence_delivery = EvidenceDelivery(BACKEND_CALLBACK, SECRET)
    evidence_delivery.start()
    atexit.register(evidence_delivery.stop_event.set)
    atexit.register(stop_process)
    batch_monitor.start()
    atexit.register(batch_monitor.stop_event.set)
    threading.Thread(target=deadline_worker, daemon=True).start()
    PROFILE_DIR.mkdir(parents=True, exist_ok=True)
    server = BoundedHTTPServer((HOST, PORT), Handler)
    print(f"Anti-Cheating secret source: {SECRET_SOURCE}", flush=True)
    print(f"Student profile directory: {PROFILE_DIR}", flush=True)
    print(f"Anti-Cheating service ready at http://{HOST}:{PORT}", flush=True)
    server.serve_forever()
