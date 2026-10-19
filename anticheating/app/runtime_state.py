"""Atomic worker readiness and heartbeat, shared with the control service."""
import json
import os
import sys
import threading
import time
from pathlib import Path

last_write = 0.0
last_warning = float("-inf")
write_lock = threading.Lock()
RETRY_DELAYS = (0.01, 0.02, 0.04, 0.08)

def publish(status, message):
    global last_write, last_warning
    target = os.environ.get("ANTICHEAT_STATE_FILE")
    if not target:
        return
    with write_lock:
        now = time.time()
        if status == "ready" and now - last_write < 1:
            return True
        path = Path(target)
        tmp = path.with_suffix(".tmp")
        try:
            tmp.write_text(json.dumps({"status": status, "message": message, "heartbeat": now}), encoding="utf-8")
            for attempt in range(len(RETRY_DELAYS) + 1):
                try:
                    tmp.replace(path)
                    break
                except OSError as error:
                    # Windows readers/antivirus can briefly prevent an atomic rename.
                    locked = isinstance(error, PermissionError) or getattr(error, "winerror", None) in (5, 32, 33)
                    if not locked or attempt == len(RETRY_DELAYS):
                        raise
                    time.sleep(RETRY_DELAYS[attempt])
        except OSError as error:
            # A heartbeat write must not terminate the camera/model pipeline.
            # Keep the old timestamp so /health still detects a persistent failure.
            warning_time = time.monotonic()
            if warning_time - last_warning >= 5:
                print(f"Cannot publish AI runtime state ({status}): {error}", file=sys.stderr, flush=True)
                last_warning = warning_time
            return False
        last_write = now
        return True

def fail(message):
    publish("error", str(message))

def install_error_handler():
    previous = sys.excepthook
    def handler(kind, value, traceback):
        try:
            fail(str(value))
        finally:
            previous(kind, value, traceback)
    sys.excepthook = handler
