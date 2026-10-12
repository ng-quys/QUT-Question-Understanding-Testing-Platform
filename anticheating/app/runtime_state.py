"""Atomic worker readiness and heartbeat, shared with the control service."""
import json
import os
import sys
import time
from pathlib import Path

last_write = 0.0

def publish(status, message):
    global last_write
    target = os.environ.get("ANTICHEAT_STATE_FILE")
    if not target:
        return
    now = time.time()
    if status == "ready" and now - last_write < 1:
        return
    path = Path(target)
    tmp = path.with_suffix(".tmp")
    tmp.write_text(json.dumps({"status": status, "message": message, "heartbeat": now}), encoding="utf-8")
    tmp.replace(path)
    last_write = now

def fail(message):
    publish("error", str(message))

def install_error_handler():
    previous = sys.excepthook
    def handler(kind, value, traceback):
        fail(str(value))
        previous(kind, value, traceback)
    sys.excepthook = handler
