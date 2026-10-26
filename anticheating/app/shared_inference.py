"""Headless sampled inference. One model set, isolated per-attempt temporal state.

The local high-FPS webcam pipeline remains available as a standalone tool. This
adapter uses its packaged models, tracker, risk engine and durable evidence path.
"""
import io
import hashlib
import time
from collections import OrderedDict
import os
import sys
from pathlib import Path
from inference_policy import (FACE_MATCH_THRESHOLD, PERSON_CONF, OBJECT_CONF,
                              live_crop_bounds, update_identity_votes, speech_observation)

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))


class SharedInference:
    def __init__(self):
        import cv2
        import mediapipe as mp
        import numpy as np
        import onnxruntime as ort
        import webrtcvad
        from insightface.app import FaceAnalysis
        from ultralytics import YOLO
        from model_config import prepare_models
        from src.head_direction_model import TrainedHeadClassifier
        from src.fusion.risk_engine import RiskEngine
        prepare_models(ROOT / "models")
        # Match the directory layout expected by InsightFace without downloading.
        import shutil
        source = ROOT / "models/identity/buffalo_l"
        target = ROOT / "models/identity/models/buffalo_l"
        target.mkdir(parents=True, exist_ok=True)
        for path in source.glob("*.onnx"):
            destination = target / path.name
            if not destination.exists() or destination.stat().st_size != path.stat().st_size:
                shutil.copy2(path, destination)
        cv2.setNumThreads(1)
        options = ort.SessionOptions()
        options.intra_op_num_threads = 1
        options.inter_op_num_threads = 1
        self.cv, self.np, self.mp = cv2, np, mp
        self.device = os.environ.get("ANTICHEAT_DEVICE", "cpu")
        self.face = FaceAnalysis(name="buffalo_l", root=str(ROOT / "models/identity"),
                                 providers=["CPUExecutionProvider"] if self.device == "cpu" else ort.get_available_providers())
        self.face.prepare(ctx_id=-1 if self.device == "cpu" else 0, det_size=(640, 640))
        self.person = YOLO(str(ROOT / "models/person/yolo11s.pt"))
        self.objects = YOLO(str(ROOT / "models/objects/best.pt"))
        self.live = ort.InferenceSession(str(ROOT / "models/liveness/MiniFASNetV2.onnx"),
                                         sess_options=options, providers=["CPUExecutionProvider"])
        self.head = TrainedHeadClassifier(ROOT / "models/head_pose/head_behavior_all_balanced.joblib")
        self.hands = mp.tasks.vision.HandLandmarker.create_from_options(
            mp.tasks.vision.HandLandmarkerOptions(
                base_options=mp.tasks.BaseOptions(model_asset_path=str(ROOT / "models/hands/hand_landmarker.task")),
                running_mode=mp.tasks.vision.RunningMode.IMAGE, num_hands=2,
                min_hand_detection_confidence=.35, min_hand_presence_confidence=.35,
                min_tracking_confidence=.35))
        self.vad, self.risk = webrtcvad.Vad(2), RiskEngine()

    def decode(self, data, reference=False):
        from PIL import Image
        with Image.open(io.BytesIO(data)) as header:
            limit = 16_000_000 if reference else 1280 * 720
            if header.format != "JPEG" or header.width * header.height > limit or min(header.size) < 16:
                raise ValueError("Invalid JPEG dimensions")
        image = self.cv.imdecode(self.np.frombuffer(data, self.np.uint8), self.cv.IMREAD_COLOR)
        if image is None:
            raise ValueError("Invalid JPEG")
        return image

    def live_label(self, image, bbox):
        bounds = live_crop_bounds(image.shape, bbox)
        if bounds is None:
            return None
        x1, y1, x2, y2 = bounds
        crop = image[y1:y2, x1:x2]
        if crop.size == 0:
            return None
        spec = self.live.get_inputs()[0]
        crop = self.cv.resize(crop, tuple(spec.shape[2:][::-1])).astype(self.np.float32)
        logits = self.live.run(None, {spec.name: crop.transpose(2,0,1)[None]})[0]
        probs = self.np.exp(logits-logits.max())
        probs /= probs.sum()
        return int(probs.argmax()), float(probs.max())

    def verification_faces(self, image):
        # Same detection/recognition weights as FaceAnalysis.get, without unrelated
        # age/gender and 106/68-landmark inference used by the in-exam head tracker.
        if not hasattr(self.face, "det_model"):
            return self.face.get(image)
        from insightface.app.common import Face
        boxes, points = self.face.det_model.detect(image, max_num=0, metric="default")
        result = []
        for i in range(boxes.shape[0]):
            face = Face(bbox=boxes[i, :4], kps=points[i] if points is not None else None, det_score=boxes[i, 4])
            self.face.models["recognition"].get(image, face)
            result.append(face)
        return result

    def verify_identity(self, jpeg, reference):
        """Entry requires a matching live face; bystanders do not block verification."""
        # This method runs on the one model worker; cache only bounded, short-lived embeddings.
        cache = getattr(self, "_verification_references", None)
        if cache is None:
            cache = self._verification_references = OrderedDict()
        key, now = hashlib.sha256(reference).digest(), time.monotonic()
        for old_key, (_, expiry) in list(cache.items()):
            if expiry <= now:
                del cache[old_key]
        saved = cache.get(key)
        if saved is None:
            reference_faces = self.verification_faces(self.decode(reference, True))
            if len(reference_faces) != 1:
                return {"verified": False, "reason": "reference_invalid"}
            embedding = reference_faces[0].normed_embedding.copy()
            cache[key] = (embedding, now + 120)
            while len(cache) > 64:
                cache.popitem(last=False)
        else:
            embedding = saved[0]
            cache.move_to_end(key)
        frame = self.cv.flip(self.decode(jpeg), 1)
        faces = self.verification_faces(frame)
        if not faces:
            return {"verified": False, "reason": "no_face"}
        matching = []
        for face in faces:
            similarity = float(self.np.dot(embedding, face.normed_embedding))
            if self.np.isfinite(similarity) and similarity >= FACE_MATCH_THRESHOLD:
                matching.append(face)
        if not matching:
            return {"verified": False, "reason": "identity_mismatch"}
        clear = [face for face in matching if min(face.bbox[2]-face.bbox[0], face.bbox[3]-face.bbox[1]) >= 60
                 and float(getattr(face, "det_score", 1)) >= .6]
        if not clear:
            return {"verified": False, "reason": "face_unclear"}
        # Identity and liveness must pass on the same face, never on different people.
        for face in clear:
            live = self.live_label(frame, face.bbox)
            if live is not None and live[0] == 1 and live[1] >= .8:
                return {"verified": True, "reason": "verified"}
        return {"verified": False, "reason": "liveness_failed"}

    def analyze_offline(self, jpeg, reference):
        from types import SimpleNamespace
        # Bounded embedding cache, independent of all live attempts and their votes.
        cache = getattr(self, "offline_references", None)
        if cache is None:
            self.offline_references = cache = OrderedDict()
        key = hashlib.sha256(reference).hexdigest()
        if key not in cache:
            faces = self.verification_faces(self.decode(reference, True))
            if len(faces) != 1:
                raise ValueError("Invalid reference face")
            cache[key] = faces[0].normed_embedding.copy()
            while len(cache) > 64:
                cache.popitem(last=False)
        cache.move_to_end(key)
        item = SimpleNamespace(context={"embedding": cache[key]}, reference=reference)
        return {"ok": True, "findings": self.analyze(item, jpeg, b"", time.time(), 0, snapshot=True)}

    def analyze(self, item, jpeg, audio, now, generation, snapshot=False):
        from src.temporal.temporal_tracker import create_anticheating_tracker
        from src.evidence.evidence_logger import EvidenceLogger
        original_frame = self.decode(jpeg)
        # Match the direct-camera model input; M4 uses unmirrored landmarks below.
        frame = self.cv.flip(original_frame, 1)
        context = item.context
        if "embedding" not in context:
            reference = self.face.get(self.decode(item.reference, True))
            if len(reference) != 1:
                raise ValueError("Reference must have exactly one face")
            context["embedding"] = reference[0].normed_embedding.copy()
            context["logger"] = EvidenceLogger(ROOT / "evidence" / f"attempt-{item.attempt}", item.attempt)
        # Missing coverage is never counted as a continuous detected behaviour.
        if context.get("generation") != generation or now-context.get("sample_at", 0) > 3:
            context["tracker"] = create_anticheating_tracker()
            context["votes"] = []
            context["object_fallback_since"] = {}
            context["object_last_confirmed"] = {}
        context.update(generation=generation, sample_at=now)
        events = set()
        faces = self.face.get(frame)
        objects = self.objects.predict(frame, imgsz=640, conf=OBJECT_CONF, device=self.device, verbose=False)[0]
        people = self.person.predict(frame, classes=[0], conf=PERSON_CONF, device=self.device, verbose=False)[0]
        object_boxes = [(objects.names[int(box.cls.item())], box.xyxy[0].tolist()) for box in objects.boxes]
        # Do not count a face/person rendered inside a detected phone screen.
        def inside_phone(box):
            x1,y1,x2,y2 = box
            return any(name == "mobile_phone" and x1 >= a and y1 >= b and x2 <= c and y2 <= d
                       for name,(a,b,c,d) in object_boxes)
        person_count = sum(not inside_phone(box.xyxy[0].tolist()) for box in people.boxes)
        if person_count > 1 or sum(not inside_phone(face.bbox) for face in faces) > 1:
            events.add("MULTIPLE_PEOPLE")
        candidates = [face for face in faces if not inside_phone(face.bbox)]
        if not candidates:
            events.add("NO_FACE")
        frame_spoof, frame_verified = False, False
        gate_verified = False
        real_similarities, best_face, best_similarity = [], None, -1.0
        for face in candidates:
            live = self.live_label(frame, face.bbox)
            if live is None:
                continue
            cls, confidence = live
            similarity = float(self.np.dot(context["embedding"], face.normed_embedding))
            if cls != 1:
                frame_spoof = True
            else:
                real_similarities.append(similarity)
                if similarity >= FACE_MATCH_THRESHOLD:
                    frame_verified = True
                    gate_verified = gate_verified or confidence >= .8
                    if similarity > best_similarity:
                        best_face, best_similarity = face, similarity
        # Access depends on a matching live candidate, never on the person count.
        # Keep MULTIPLE_PEOPLE / SPOOF_FACE warnings independent of the exam gate.
        context["camera_identity_good"] = gate_verified
        context["camera_identity_reason"] = ("verified" if gate_verified else "no_face" if not candidates else "liveness_failed" if frame_spoof or frame_verified else "identity_mismatch")
        raw_mismatch = bool(real_similarities) and not frame_verified
        context["identity_mismatch_observed"] = raw_mismatch
        if snapshot:
            spoof, mismatch = frame_spoof, raw_mismatch
        else:
            spoof, mismatch, _ = update_identity_votes(context["votes"], frame_spoof,
                raw_mismatch, frame_verified)
        # A historical vote cannot label a newly recovered frame as a violation.
        if spoof and frame_spoof:
            events.add("SPOOF_FACE")
        if mismatch and raw_mismatch:
            events.add("IDENTITY_MISMATCH")
        if best_face is not None:
            direction = self.head.predict_verified_face(original_frame, best_face,
                                                        self.face.models["landmark_3d_68"])["direction"]
            if direction in {"LEFT", "RIGHT", "UP", "DOWN"}:
                events.add("HEAD_" + direction)
        if snapshot:
            # A five-second sample proves visibility only, not duration, speech,
            # continuous head movement or that an object was being held.
            visible = {"mobile_phone": "PHONE_VISIBLE", "tablet": "TABLET_VISIBLE",
                       "study_material": "MATERIAL_VISIBLE", "book": "MATERIAL_VISIBLE", "paper": "MATERIAL_VISIBLE"}
            events.update(visible[name] for name, _ in object_boxes if name in visible)
            scores = {"NO_FACE":20, "IDENTITY_MISMATCH":50, "SPOOF_FACE":50,
                      "MULTIPLE_PEOPLE":50, "PHONE_VISIBLE":30, "TABLET_VISIBLE":30,
                      "MATERIAL_VISIBLE":20}
            return [{"event": name, "score": scores.get(name, 15)} for name in sorted(events)]
        rgb = self.cv.cvtColor(frame, self.cv.COLOR_BGR2RGB)
        hands = self.hands.detect(self.mp.Image(image_format=self.mp.ImageFormat.SRGB, data=rgb))
        h,w = frame.shape[:2]
        points = [[(p.x*w,p.y*h) for p in hand] for hand in hands.hand_landmarks]
        from object_interaction import interaction_events
        object_observations = [(objects.names[int(box.cls.item())], box.xyxy[0].tolist(),
                                float(box.conf.item())) for box in objects.boxes]
        person_boxes = [box.xyxy[0].tolist() for box in people.boxes
                        if not inside_phone(box.xyxy[0].tolist())]
        events.update(interaction_events(object_observations, points, person_boxes, now,
                                         context["object_fallback_since"], context["object_last_confirmed"]))
        if speech_observation(self.vad, audio):
            events.add("SPEECH")
        tracker = context["tracker"]
        results = {name:tracker.update(name, name in events, timestamp=now) for name in tracker.events}
        triggered = [name for name,result in results.items() if result["triggered"]]
        risk = self.risk.calculate(triggered)
        # Return observations only; scheduler rechecks lease and active exam before saving.
        return [(name,result["duration"],risk.score,risk.level,frame)
                for name,result in results.items() if result["just_triggered"]]

    def deliver_identity_observation(self, item, jpeg):
        if item.context.get("identity_evidence"):
            return
        frame = self.cv.flip(self.decode(jpeg), 1)
        records = self.deliver(item, [("CAMERA_IDENTITY_OBSERVATION", 0, 0, "LOW", frame)])
        event = records[0]
        # Only a durable outbox write and a saved image establish the episode snapshot.
        item.context["identity_evidence"] = (event["capture_uuid"], event["timestamp"])

    def deliver_camera_lock(self, item, jpeg, duration):
        # A sustained mismatch needs review (50); grouping takes max, never sums the same capture.
        frame = None if item.context.get("identity_evidence") else self.cv.flip(self.decode(jpeg), 1)
        self.deliver(item, [("CAMERA_IDENTITY_LOCK", duration, 50, "HIGH", frame)])

    def deliver(self, item, observations):
        from evidence_delivery import enqueue
        from uuid import uuid4
        capture_uuid = item.context.get("capture_uuid") or str(uuid4())
        records = []
        for name,duration,score,level,frame in observations:
            event_capture = capture_uuid
            captured_at = item.context.get("capture_at")
            snapshot = item.context.get("identity_evidence")
            if snapshot and name in {"IDENTITY_MISMATCH", "CAMERA_IDENTITY_LOCK"}:
                event_capture, captured_at = snapshot
                frame = None  # Reuse the immutable offending JPEG, never the current frame.
            event = item.context["logger"].log_event(name,duration,score,level,"sampled_batch",frame,
                                                     capture_uuid=event_capture, captured_at=captured_at)
            if name in {"CAMERA_IDENTITY_OBSERVATION", "CAMERA_IDENTITY_LOCK", "IDENTITY_MISMATCH"} and not event["evidence_image"]:
                raise OSError("Identity evidence image was not saved")
            enqueue({"attemptId":item.attempt, "event":name, "module":"M10", "active":True,
                     "timestamp":event["timestamp"], "duration":duration, "riskScore":score,
                     "riskLevel":level, "sourceModule":"sampled_batch",
                     "eventUuid":event["event_uuid"], "captureUuid":event_capture, "evidencePath":event["evidence_image"],
                     "evidenceStatus":"pending" if event["evidence_image"] else "failed",
                     "evidenceError":event["evidence_error"]})
            records.append(event)
        return records

    def close(self):
        self.hands.close()
