"""M4 inference for the user's trained 207-feature head-direction model.

Coordinates/normalization match build_landmark_features.extract_augmented.
Only trusted models produced by the project should be loaded with joblib.
"""
from pathlib import Path

import joblib
import numpy as np
import sklearn
from threadpoolctl import threadpool_limits

SCHEMA = 'buffalo_l_pose_normalized_3d68_v3'
LABELS = ('straight', 'left', 'right', 'down', 'up')
FEATURE_NAMES = ('pitch', 'yaw', 'roll') + tuple(
    f'lm68_{point:02d}_{axis}' for point in range(68) for axis in 'xyz')
PIPELINE_LABELS = dict(straight='CENTER', left='LEFT', right='RIGHT', down='DOWN', up='UP')
TRAINING_SKLEARN_VERSION = '1.5.2'


def extract_features(face):
    pose = np.asarray(getattr(face, 'pose', None), dtype=float)
    landmarks = np.asarray(getattr(face, 'landmark_3d_68', None), dtype=float)
    if pose.shape != (3,) or landmarks.shape != (68, 3):
        raise ValueError('Missing pose or 68 three-dimensional landmarks.')
    if not np.isfinite(pose).all() or not np.isfinite(landmarks).all():
        raise ValueError('Nonfinite pose/landmarks.')
    left_eye = landmarks[36:42, :2].mean(axis=0)
    right_eye = landmarks[42:48, :2].mean(axis=0)
    scale = float(np.linalg.norm(left_eye - right_eye))
    if scale < 1:
        raise ValueError('Eye spacing too small to normalize reliably.')
    centered = (landmarks - landmarks.mean(axis=0)) / scale
    return np.concatenate([pose, centered.reshape(-1)])


def original_bbox(mirrored_bbox, frame_width):
    box = np.asarray(mirrored_bbox, dtype=np.float32)
    if box.shape != (4,) or not np.isfinite(box).all() or frame_width <= 1:
        raise ValueError('Invalid face bounding box or image width.')
    x1, y1, x2, y2 = box
    if x2 <= x1 or y2 <= y1:
        raise ValueError('Degenerate face bounding box.')
    result = np.array([frame_width - 1 - x2, y1,
                       frame_width - 1 - x1, y2], dtype=np.float32)
    return result


class TrainedHeadClassifier:
    def __init__(self, model_path, min_confidence=0.7):
        self.path = Path(model_path)
        self.min_confidence = float(min_confidence)
        if not np.isfinite(self.min_confidence) or not 0 <= self.min_confidence <= 1:
            raise ValueError('M4 confidence must be between 0 and 1.')
        if not self.path.is_file():
            raise FileNotFoundError('M4 model not found: ' + str(self.path))
        if sklearn.__version__ != TRAINING_SKLEARN_VERSION:
            raise RuntimeError(
                f'M4 needs scikit-learn {TRAINING_SKLEARN_VERSION}; found {sklearn.__version__}. '
                'In the pipeline Python environment run: '
                f'python -m pip install scikit-learn=={TRAINING_SKLEARN_VERSION}')
        bundle = joblib.load(self.path)
        if not isinstance(bundle, dict) or bundle.get('schema') != SCHEMA:
            raise ValueError('M4 expects the trained 207-feature v3 model.')
        self.metadata = bundle.get('metadata', {})
        if self.metadata.get('features') != list(FEATURE_NAMES):
            raise ValueError('M4 model feature order differs from the training extractor.')
        if self.metadata.get('labels') != list(LABELS):
            raise ValueError('M4 model must contain the five trained labels.')
        if self.metadata.get('sklearn_version') != TRAINING_SKLEARN_VERSION:
            raise ValueError('M4 model was trained with a different scikit-learn version.')
        self.model = bundle.get('model')
        if getattr(self.model, 'n_features_in_', None) != len(FEATURE_NAMES):
            raise ValueError('M4 estimator does not accept 207 features.')
        if set(getattr(self.model, 'classes_', [])) != set(LABELS):
            raise ValueError('M4 estimator classes differ from the five trained labels.')
        if not callable(getattr(self.model, 'predict_proba', None)):
            raise ValueError('M4 estimator has no predict_proba method.')

    @staticmethod
    def unknown(reason, score=0.0, predicted_label=None):
        return dict(label='unknown', direction='UNKNOWN', score=score,
                    predicted_label=predicted_label, reason=reason)

    def predict_face(self, face):
        try:
            values = extract_features(face)
        except (ValueError, TypeError) as error:
            return self.unknown(str(error))
        # A single small inference should not occupy every CPU thread.
        with threadpool_limits(limits=1, user_api='openmp'):
            probabilities = np.asarray(self.model.predict_proba(values.reshape(1, -1)), dtype=float)
        if (probabilities.shape != (1, len(LABELS)) or not np.isfinite(probabilities).all()
                or np.any(probabilities < 0) or np.any(probabilities > 1)
                or not np.isclose(probabilities.sum(), 1, atol=1e-5)):
            return self.unknown('Invalid model probabilities.')
        best = int(probabilities[0].argmax())
        score = float(probabilities[0, best])
        label = str(self.model.classes_[best])
        if score < self.min_confidence:
            return self.unknown('Low model confidence.', score, label)
        return dict(label=label, direction=PIPELINE_LABELS[label], score=score,
                    predicted_label=label, reason=None)

    def predict_verified_face(self, original_frame, mirrored_face, landmark_model):
        """Recompute landmarks on the raw image for the same M1-verified face.

        The rest of the pipeline uses a mirrored display image. Never feed those
        mirrored landmarks directly into an unmirrored-trained classifier.
        Reuse the already-loaded 3D landmark model and do not mutate the M1 face.
        """
        if original_frame is None or original_frame.ndim != 3:
            return self.unknown('Invalid original camera frame.')
        try:
            box = original_bbox(mirrored_face.bbox, original_frame.shape[1])
        except (ValueError, TypeError) as error:
            return self.unknown(str(error))
        from insightface.app.common import Face
        face = Face(bbox=box)
        landmark_model.get(original_frame, face)
        return self.predict_face(face)


def main():
    import argparse
    parser = argparse.ArgumentParser(description='Check the packaged M4 classifier without opening camera/audio.')
    parser.add_argument('--model', default=str(Path(__file__).resolve().parents[1]
                        / 'models' / 'head_pose' / 'head_behavior_all_balanced.joblib'))
    args = parser.parse_args()
    classifier = TrainedHeadClassifier(args.model)
    print('M4 model OK:', classifier.path)
    print('Estimator:', type(classifier.model).__name__)
    print('Features:', len(FEATURE_NAMES))
    print('Labels:', ', '.join(LABELS))
    print('scikit-learn:', sklearn.__version__)
    print('Training samples:', sum(classifier.metadata.get('train_counts', {}).values()))
    print('Test samples:', sum(classifier.metadata.get('test_counts', {}).values()))


if __name__ == '__main__':
    main()
