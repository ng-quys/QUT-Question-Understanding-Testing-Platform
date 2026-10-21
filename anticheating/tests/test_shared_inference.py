"""Exercise the web inference path without opening cameras or loading weights."""
import sys
import unittest
from pathlib import Path
from types import SimpleNamespace as NS
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "app"))
from shared_inference import SharedInference


def box(name, coords, confidence=.7):
    return NS(cls=np.array([name]), xyxy=np.array([coords]), conf=np.array([confidence]))


class WebInferenceTests(unittest.TestCase):
    def setUp(self):
        self.engine = SharedInference.__new__(SharedInference)
        self.raw = np.arange(640*480*3, dtype=np.uint8).reshape(480, 640, 3)
        self.face = NS(bbox=np.array([20, 20, 100, 100]), normed_embedding=np.array([1., 0.]))
        self.faces, self.objects = [self.face], []
        self.people = [box(0, [0, 0, 640, 480])]
        self.calls, self.head_calls = [], []
        self.engine.decode = lambda data, reference=False: self.raw
        self.engine.cv = NS(flip=lambda frame, axis: np.flip(frame, axis=1),
                            cvtColor=lambda frame, code: frame, COLOR_BGR2RGB=0)
        self.engine.np, self.engine.device = np, "cpu"
        self.engine.face = NS(get=lambda frame: self.faces, models={"landmark_3d_68": "landmarks"})
        def predict(frame, **kwargs):
            np.testing.assert_array_equal(frame, self.raw[:, ::-1])
            self.calls.append(kwargs)
            return [NS(names={0: "mobile_phone"}, boxes=self.people if "classes" in kwargs else self.objects)]
        self.engine.objects = NS(predict=predict)
        self.engine.person = NS(predict=predict)
        self.engine.live_label = lambda frame, bbox: (1, .99)
        def head(frame, face, landmarks):
            self.assertIs(frame, self.raw)
            self.assertEqual("landmarks", landmarks)
            self.head_calls.append(face)
            return {"direction": "LEFT"}
        self.engine.head = NS(predict_verified_face=head)
        self.engine.hands = NS(detect=lambda image: NS(hand_landmarks=[]))
        self.engine.mp = NS(Image=lambda **kwargs: None, ImageFormat=NS(SRGB=0))
        self.engine.vad = NS(is_speech=lambda chunk, rate: chunk[0] == 1)
        self.engine.risk = NS(calculate=lambda events: NS(score=40, level="MEDIUM"))
        self.item = NS(context={"embedding": np.array([1., 0.])}, attempt=0)

    def replay(self, audio=bytes(9600)):
        return {event[0] for i in range(20)
                for event in self.engine.analyze(self.item, b"jpeg", audio, 100+i*.5, 1)}

    def test_head_uses_original_landmarks_and_verified_identity(self):
        self.assertIn("HEAD_LEFT", self.replay())
        self.assertTrue(self.head_calls)
        self.assertTrue(any(call.get("imgsz") == 640 for call in self.calls))

    def test_wrong_identity_is_voted_and_never_used_for_head(self):
        self.face.normed_embedding = np.array([0., 1.])
        events = self.replay()
        self.assertIn("IDENTITY_MISMATCH", events)
        self.assertNotIn("HEAD_LEFT", events)
        self.assertFalse(self.head_calls)

    def test_all_faces_checked_with_multiple_people(self):
        second = NS(bbox=np.array([110, 20, 160, 100]), normed_embedding=np.array([0., 1.]))
        self.faces = [self.face, second]
        self.engine.live_label = lambda frame, bbox: (1 if bbox[0] == 20 else 0, .7)
        self.people.append(box(0, [400, 20, 630, 470]))
        events = self.replay()
        self.assertTrue({"MULTIPLE_PEOPLE", "SPOOF_FACE", "HEAD_LEFT"}.issubset(events))

    def test_phone_detection_runs_even_when_face_is_hidden(self):
        self.faces = []
        self.objects = [box(0, [180.1, 121.2, 397.6, 439.7], .694)]
        self.assertTrue({"NO_FACE", "HOLDING_PHONE"}.issubset(self.replay()))

    def test_voice_and_visual_models_both_run(self):
        self.assertTrue({"SPEECH", "HEAD_LEFT"}.issubset(self.replay(bytes([1])*9600)))

    def test_sampling_gap_resets_all_confirmation_state(self):
        self.engine.analyze(self.item, b"jpeg", bytes(9600), 100, 1)
        events = self.engine.analyze(self.item, b"jpeg", bytes(9600), 200, 2)
        self.assertEqual([], events)
        self.assertEqual(1, len(self.item.context["votes"]))


if __name__ == "__main__":
    unittest.main()
