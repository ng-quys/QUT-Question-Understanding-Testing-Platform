import json
import os
import re
import threading
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4


class EvidenceLogger:
    def __init__(self, evidence_dir=None):
        default = Path(__file__).resolve().parents[2] / "evidence"
        self.directory = Path(evidence_dir or os.environ.get("ANTICHEAT_EVIDENCE_DIR", str(default)))
        self.directory.mkdir(parents=True, exist_ok=True)
        self._lock = threading.Lock()

    def log_event(self, event_name, duration, risk_score, risk_level, source_module, frame=None):
        now = datetime.now(timezone.utc)
        event = re.sub(r"[^A-Za-z0-9_-]", "_", str(event_name))[:80]
        name = now.strftime("%Y%m%dT%H%M%S_%fZ") + "_" + event + "_" + uuid4().hex[:8]
        image_path = None
        if frame is not None:
            import cv2
            target = self.directory / (name + ".jpg")
            if not cv2.imwrite(str(target), frame):
                raise OSError("Cannot write evidence image")
            image_path = str(target.resolve())
        data = {
            "timestamp": now.isoformat(), "event": str(event_name),
            "duration": float(duration), "risk_score": int(risk_score),
            "risk_level": str(risk_level), "source_module": str(source_module),
            "attempt_id": os.environ.get("ANTICHEAT_ATTEMPT_ID"),
            "evidence_image": image_path,
        }
        with self._lock:
            (self.directory / (name + ".json")).write_text(
                json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
        return data
