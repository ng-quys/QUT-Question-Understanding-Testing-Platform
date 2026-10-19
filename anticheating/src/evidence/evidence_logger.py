import json
import os
import re
import threading
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4


class EvidenceLogger:
    def __init__(self, evidence_dir=None, attempt_id=None):
        default = Path(__file__).resolve().parents[2] / "evidence"
        self.directory = Path(evidence_dir or os.environ.get("ANTICHEAT_EVIDENCE_DIR", str(default)))
        self.directory.mkdir(parents=True, exist_ok=True)
        self._lock = threading.Lock()
        self.attempt_id = attempt_id

    def log_event(self, event_name, duration, risk_score, risk_level, source_module, frame=None):
        now = datetime.now(timezone.utc)
        event_uuid = str(uuid4())
        event = re.sub(r"[^A-Za-z0-9_-]", "_", str(event_name))[:80]
        name = now.strftime("%Y%m%dT%H%M%S_%fZ") + "_" + event + "_" + event_uuid
        image_path = None
        image_error = None
        if frame is not None:
            import cv2
            target = self.directory / (name + ".jpg")
            try:
                # imencode + write_bytes supports Unicode Windows paths.
                ok, encoded = cv2.imencode(".jpg", frame)
                if not ok:
                    raise OSError("Cannot encode evidence image")
                target.write_bytes(encoded.tobytes())
                image_path = str(target.resolve())
            except (OSError, ValueError, cv2.error):
                image_error = "LOCAL_IMAGE_WRITE_FAILED"
        data = {
            "timestamp": now.isoformat(), "event": str(event_name),
            "duration": float(duration), "risk_score": int(risk_score),
            "risk_level": str(risk_level), "source_module": str(source_module),
            "attempt_id": str(self.attempt_id) if self.attempt_id is not None else os.environ.get("ANTICHEAT_ATTEMPT_ID"),
            "evidence_image": image_path,
            "event_uuid": event_uuid,
            "evidence_error": image_error,
        }
        try:
            with self._lock:
                (self.directory / (name + ".json")).write_text(
                    json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
        except OSError:
            print("Evidence metadata could not be saved locally", flush=True)
        return data
