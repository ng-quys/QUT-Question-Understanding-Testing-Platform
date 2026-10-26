"""Exercise the pipeline handoff without loading camera/model dependencies."""
import ast
import json
import sys
import tempfile
import types
import unittest
from pathlib import Path
from unittest.mock import Mock, patch
from uuid import UUID
from uuid import uuid4

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'app'))
sys.path.insert(0, str(ROOT))
from src.evidence.evidence_logger import EvidenceLogger


class EvidencePipelineTests(unittest.TestCase):
    def test_same_capture_writes_one_photo_but_keeps_distinct_warning_records(self):
        encoded=types.SimpleNamespace(tobytes=lambda:b'same captured frame')
        cv2=types.SimpleNamespace(imencode=Mock(return_value=(True,encoded)),error=RuntimeError)
        with tempfile.TemporaryDirectory() as folder,patch.dict(sys.modules,{'cv2':cv2}):
            logger=EvidenceLogger(folder,12);capture=str(uuid4())
            one=logger.log_event('SPEECH',2,50,'HIGH','sampled_batch',object(),capture_uuid=capture)
            two=logger.log_event('IDENTITY_MISMATCH',5,50,'HIGH','sampled_batch',object(),capture_uuid=capture)
            self.assertEqual(one['evidence_image'],two['evidence_image']);self.assertNotEqual(one['event_uuid'],two['event_uuid'])
            self.assertEqual(capture,two['capture_uuid']);cv2.imencode.assert_called_once()
            self.assertEqual(1,len(list(Path(folder).glob('*.jpg'))));self.assertEqual(2,len(list(Path(folder).glob('*.json'))))

    def test_frame_loop_only_enqueues_no_network_upload(self):
        tree = ast.parse((ROOT / 'app/anticheating_pipeline.py').read_text(encoding='utf-8'))
        function = next(node for node in tree.body if isinstance(node, ast.FunctionDef) and node.name == 'post_backend_event')
        scope = {'ATTEMPT_ID': '125'}
        exec(compile(ast.Module(body=[function], type_ignores=[]), '<pipeline-handoff>', 'exec'), scope)
        with patch('evidence_delivery.enqueue') as enqueue, patch('urllib.request.urlopen', side_effect=AssertionError('Frame loop must not use network')):
            scope['post_backend_event']({'eventUuid': 'synthetic'})
            enqueue.assert_called_once()
        with patch('evidence_delivery.enqueue', side_effect=OSError('Disk unavailable')):
            scope['post_backend_event']({'eventUuid': 'synthetic'})  # No exception reaches camera loop.

    def test_failed_image_capture_still_returns_stable_event_and_metadata(self):
        cv2 = types.SimpleNamespace(imencode=Mock(side_effect=OSError('Disk unavailable')), error=RuntimeError)
        with tempfile.TemporaryDirectory() as folder, patch.dict(sys.modules, {'cv2': cv2}):
            event = EvidenceLogger(folder).log_event('NO_FACE', 2, 20, 'LOW', 'full_pipeline_voting', frame=object())
            self.assertEqual(str(UUID(event['event_uuid'])), event['event_uuid'])
            self.assertIsNone(event['evidence_image'])
            self.assertEqual('LOCAL_IMAGE_WRITE_FAILED', event['evidence_error'])
            saved = json.loads(next(Path(folder).glob('*.json')).read_text(encoding='utf-8'))
            self.assertEqual(event['event_uuid'], saved['event_uuid'])

    def test_jpeg_write_works_with_unicode_path(self):
        encoded = types.SimpleNamespace(tobytes=lambda: b'synthetic mocked jpeg')
        cv2 = types.SimpleNamespace(imencode=Mock(return_value=(True, encoded)), error=RuntimeError)
        with tempfile.TemporaryDirectory() as folder, patch.dict(sys.modules, {'cv2': cv2}):
            event = EvidenceLogger(Path(folder) / 'bằng chứng').log_event('NO_FACE', 2, 20, 'LOW', 'full_pipeline_voting', frame=object())
            self.assertEqual(b'synthetic mocked jpeg', Path(event['evidence_image']).read_bytes())
            self.assertIsNone(event['evidence_error'])


if __name__ == '__main__':
    unittest.main()
