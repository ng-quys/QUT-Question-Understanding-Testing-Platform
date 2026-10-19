"""M4 contract tests; no camera or ONNX weights required."""
import sys
import types
import unittest
from pathlib import Path
from unittest.mock import patch
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from src.head_direction_model import TrainedHeadClassifier, extract_features, original_bbox


def example_face():
    points = np.arange(204, dtype=float).reshape(68, 3)
    return types.SimpleNamespace(pose=np.array([12., -8., 3.]), landmark_3d_68=points,
                                 bbox=np.array([10, 20, 110, 180], dtype=float))


class M4Tests(unittest.TestCase):
    def classifier(self, probabilities):
        classifier = TrainedHeadClassifier.__new__(TrainedHeadClassifier)
        classifier.min_confidence = .7
        classifier.model = types.SimpleNamespace(
            classes_=np.array(['down', 'left', 'right', 'straight', 'up']),
            predict_proba=lambda values: np.array([probabilities]))
        return classifier

    def test_class_order_is_read_from_estimator(self):
        for index, direction in enumerate(['DOWN', 'LEFT', 'RIGHT', 'CENTER', 'UP']):
            probabilities = [0.] * 5
            probabilities[index] = 1.
            self.assertEqual(self.classifier(probabilities).predict_face(example_face())['direction'], direction)

    def test_uncertain_prediction_is_unknown(self):
        result = self.classifier([.1, .1, .1, .6, .1]).predict_face(example_face())
        self.assertEqual(result['direction'], 'UNKNOWN')
        self.assertEqual(result['predicted_label'], 'straight')

    def test_invalid_landmarks_never_become_center(self):
        face = example_face()
        face.landmark_3d_68[0, 0] = np.nan
        self.assertEqual(self.classifier([0, 0, 0, 1, 0]).predict_face(face)['direction'], 'UNKNOWN')

    def test_translation_and_scale_do_not_change_normalized_landmarks(self):
        face = example_face()
        features = extract_features(face)
        face.landmark_3d_68 = face.landmark_3d_68 * 3 + np.array([30, 15, 8])
        np.testing.assert_allclose(features, extract_features(face), atol=1e-12)
        self.assertEqual(features.shape, (207,))

    def test_mirror_box_round_trip(self):
        box = np.array([10, 20, 110, 180])
        np.testing.assert_allclose(original_bbox(original_bbox(box, 640), 640), box)

    def test_original_pixels_and_verified_identity_are_preserved(self):
        class Face(dict):
            def __getattr__(self, key): return self.get(key)
            def __setattr__(self, key, value): self[key] = value
        face = example_face()
        old_box = face.bbox.copy()
        original = np.zeros((240, 640, 3), dtype=np.uint8)
        def landmarks(image, target):
            self.assertIs(image, original)
            np.testing.assert_allclose(target.bbox, [529, 20, 629, 180])
            target.pose = face.pose
            target.landmark_3d_68 = face.landmark_3d_68
        fake = types.ModuleType('insightface.app.common')
        fake.Face = Face
        with patch.dict(sys.modules, {'insightface.app.common': fake}):
            result = self.classifier([0, 1, 0, 0, 0]).predict_verified_face(
                original, face, types.SimpleNamespace(get=landmarks))
        self.assertEqual(result['direction'], 'LEFT')
        np.testing.assert_array_equal(face.bbox, old_box)

    def test_invalid_probabilities_are_unknown(self):
        for probabilities in ([np.nan, 0, 0, 1, 0], [0, 0, 0, 0, 0], [0, 0, 0, 2, 0]):
            self.assertEqual(self.classifier(probabilities).predict_face(example_face())['direction'], 'UNKNOWN')


if __name__ == '__main__':
    unittest.main()
