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
HOST = os.environ.get("ANTICHEAT_SERVICE_HOST", "127.0.0.1")
PORT = int(os.environ.get("ANTICHEAT_SERVICE_PORT", "8000"))
PROFILE_DIR = Path(os.environ.get("ANTICHEAT_PROFILE_DIR", str(ROOT / "student-profiles"))).resolve()
PIPELINE = ROOT / "app" / "anticheating_pipeline.py"
BACKEND_CALLBACK = os.environ.get("ANTICHEAT_BACKEND_CALLBACK_URL", "http://127.0.0.1:8080/api/internal/anticheating/events")
SECRET = os.environ.get("ANTICHEAT_INTERNAL_SECRET", "change-me")

lock = threading.Lock()
process = None
active_attempt = None
state_file = None
last_error = ""
active_deadline = None


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
            "status": status, "message": message, "attemptId": active_attempt}


def stop_process():
    if process and process.poll() is None:
        process.terminate()
        try:
            process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait(timeout=2)


def start_attempt(attempt_id, student_id, remaining_seconds=None, session_end=None, clock_starts_on_ready=False):
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
        reference = PROFILE_DIR / f"{student_id}.jpg"
        if not reference.exists():
            raise FileNotFoundError(f"Chưa có ảnh khuôn mặt sinh viên: {reference}. Hãy tải ảnh ở Hồ sơ.")
        required_models = [
            ROOT / "models" / "identity" / "buffalo_l" / name
            for name in ("det_10g.onnx", "1k3d68.onnx", "w600k_r50.onnx")
        ] + [
            ROOT / "models" / "liveness" / "MiniFASNetV2.onnx",
            ROOT / "models" / "person" / "yolo11s.pt",
            ROOT / "models" / "hands" / "hand_landmarker.task",
            ROOT / "models" / "objects" / "best.pt",
        ]
        missing = [str(path) for path in required_models if not path.is_file() or path.stat().st_size == 0]
        if missing:
            raise FileNotFoundError("Thiếu model hoặc file rỗng: " + ", ".join(missing))
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
            if self.path == "/session/start":
                result = start_attempt(int(data["attemptId"]), int(data["studentId"]), data.get("remainingSeconds"), data.get("sessionEnd"), data.get("clockStartsOnReady", False))
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


if __name__ == "__main__":
    atexit.register(stop_process)
    threading.Thread(target=deadline_worker, daemon=True).start()
    PROFILE_DIR.mkdir(parents=True, exist_ok=True)
    server = ThreadingHTTPServer((HOST, PORT), Handler)
    print(f"Anti-Cheating service ready at http://{HOST}:{PORT}")
    server.serve_forever()
