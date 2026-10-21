"""Headless sampled inference. One model set, isolated per-attempt temporal state.

The local high-FPS webcam pipeline remains available as a standalone tool. This
adapter uses its packaged models, tracker, risk engine and durable evidence path.
"""
import io
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

    def analyze(self, item, jpeg, audio, now, generation):
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
                    if similarity > best_similarity:
                        best_face, best_similarity = face, similarity
        spoof, mismatch, _ = update_identity_votes(context["votes"], frame_spoof,
            bool(real_similarities) and not frame_verified, frame_verified)
        if spoof:
            events.add("SPOOF_FACE")
        if mismatch:
            events.add("IDENTITY_MISMATCH")
        if best_face is not None:
            direction = self.head.predict_verified_face(original_frame, best_face,
                                                        self.face.models["landmark_3d_68"])["direction"]
            if direction in {"LEFT", "RIGHT", "UP", "DOWN"}:
                events.add("HEAD_" + direction)
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

    def deliver(self, item, observations):
        from evidence_delivery import enqueue
        for name,duration,score,level,frame in observations:
            event = item.context["logger"].log_event(name,duration,score,level,"sampled_batch",frame)
            enqueue({"attemptId":item.attempt, "event":name, "module":"M10", "active":True,
                     "timestamp":event["timestamp"], "duration":duration, "riskScore":score,
                     "riskLevel":level, "sourceModule":"sampled_batch",
                     "eventUuid":event["event_uuid"], "evidencePath":event["evidence_image"],
                     "evidenceStatus":"pending" if event["evidence_image"] else "failed",
                     "evidenceError":event["evidence_error"]})

    def close(self):
        self.hands.close()
