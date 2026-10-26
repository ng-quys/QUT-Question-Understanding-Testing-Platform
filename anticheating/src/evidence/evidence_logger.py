import json
import os
import re
import threading
from datetime import datetime, timezone
from pathlib import Path
from uuid import UUID, uuid4


class EvidenceLogger:
    def __init__(self, evidence_dir=None, attempt_id=None):
        default = Path(__file__).resolve().parents[2] / "evidence"
        self.directory = Path(evidence_dir or os.environ.get("ANTICHEAT_EVIDENCE_DIR", str(default)))
        self.directory.mkdir(parents=True, exist_ok=True)
        self._lock = threading.Lock()
        self.attempt_id = attempt_id

    def log_event(self, event_name, duration, risk_score, risk_level, source_module, frame=None, capture_uuid=None, captured_at=None):
        capture_uuid = str(UUID(capture_uuid)) if capture_uuid else None
        now = datetime.now(timezone.utc)
        event_uuid = str(uuid4())
        event = re.sub(r"[^A-Za-z0-9_-]", "_", str(event_name))[:80]
        name = now.strftime("%Y%m%dT%H%M%S_%fZ") + "_" + event + "_" + event_uuid
        image_path = None
        image_error = None
        if frame is None and capture_uuid:
            target = self.directory / ("capture_" + capture_uuid + ".jpg")
            if target.is_file():
                image_path = str(target.resolve())
        if frame is not None:
            import cv2
            target = self.directory / (("capture_" + capture_uuid if capture_uuid else name) + ".jpg")
            try:
                # imencode + write_bytes supports Unicode Windows paths.
                if not target.is_file():
                    ok, encoded = cv2.imencode(".jpg", frame)
                    if not ok:
                        raise OSError("Cannot encode evidence image")
                    temporary = target.with_suffix(".jpg.tmp")
                    temporary.write_bytes(encoded.tobytes())
                    temporary.replace(target)
                image_path = str(target.resolve())
            except (OSError, ValueError, cv2.error):
                image_error = "LOCAL_IMAGE_WRITE_FAILED"
        data = {
            "timestamp": captured_at or now.isoformat(), "event": str(event_name),
            "duration": float(duration), "risk_score": int(risk_score),
            "risk_level": str(risk_level), "source_module": str(source_module),
            "attempt_id": str(self.attempt_id) if self.attempt_id is not None else os.environ.get("ANTICHEAT_ATTEMPT_ID"),
            "evidence_image": image_path,
            "event_uuid": event_uuid, "capture_uuid": capture_uuid,
            "evidence_error": image_error,
        }
        try:
            with self._lock:
                (self.directory / (name + ".json")).write_text(
                    json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
        except OSError:
            print("Evidence metadata could not be saved locally", flush=True)
        return data
