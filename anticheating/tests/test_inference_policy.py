import ast
import sys
import unittest
from pathlib import Path

APP = Path(__file__).resolve().parents[1] / "app"
sys.path.insert(0, str(APP))
from inference_policy import live_crop_bounds, update_identity_votes, speech_observation


class InferencePolicyTests(unittest.TestCase):
    def test_crop_matches_desktop_integer_rounding_and_edges(self):
        # Execute only the original pure crop helpers, never the camera pipeline.
        tree = ast.parse((APP / "anticheating_pipeline.py").read_text(encoding="utf-8"))
        funcs = [node for node in tree.body if isinstance(node, ast.FunctionDef)
                 and node.name in {"xyxy_to_xywh", "crop_live_face"}]
        class Frame:
            shape = (480, 640, 3)
            size = 1
            def __getitem__(self, slices):
                self.slices = slices
                return self
        class CV:
            @staticmethod
            def resize(frame, size):
                return frame.slices
        scope = dict(cv2=CV, LIVENESS_SCALE=2.7, live_input_size=(80, 80))
        exec(compile(ast.Module(body=funcs, type_ignores=[]), "desktop-crop", "exec"), scope)
        for bbox in [(10.7, 20.3, 110.2, 180.9), (0, 0, 120, 160), (500, 350, 639, 479)]:
            frame = Frame()
            ys, xs = scope["crop_live_face"](frame, scope["xyxy_to_xywh"](bbox))
            self.assertEqual((xs.start, ys.start, xs.stop, ys.stop), live_crop_bounds(frame.shape, bbox))
        self.assertIsNone(live_crop_bounds((480, 640, 3), (10, 10, 10, 50)))

    def test_identity_needs_full_window_and_eight_positive_votes(self):
        history = []
        for _ in range(9):
            self.assertEqual((False, False, False), update_identity_votes(history, True, True, False))
        self.assertEqual((True, True, False), update_identity_votes(history, False, False, False))
        for _ in range(3):
            result = update_identity_votes(history, False, False, False)
        self.assertEqual((False, False, False), result)
        self.assertEqual(10, len(history))

    def test_verified_needs_six_votes_and_state_is_per_student(self):
        first, second = [], []
        for i in range(10):
            result = update_identity_votes(first, False, False, i < 6)
            other = update_identity_votes(second, False, False, False)
        self.assertEqual((False, False, True), result)
        self.assertEqual((False, False, False), other)

    def test_voice_uses_latest_ten_blocks_and_sixty_percent(self):
        class VAD:
            def is_speech(self, block, rate):
                assert len(block) == 960 and rate == 16000
                return block[0] == 1
        voice, silence = bytes([1])*960, bytes(960)
        self.assertTrue(speech_observation(VAD(), silence*10+voice*6+silence*4))
        self.assertFalse(speech_observation(VAD(), voice*10+silence*10))
        self.assertFalse(speech_observation(VAD(), voice*5+silence*5))
        self.assertFalse(speech_observation(VAD(), b""))


if __name__ == "__main__":
    unittest.main()
