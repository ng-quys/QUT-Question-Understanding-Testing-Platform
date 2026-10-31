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
        self.engine.vad = NS(is_speech=lambda chunk, rate: chunk[0] == 1)
        self.engine.risk = NS(calculate=lambda events: NS(score=40, level="MEDIUM"))
        self.item = NS(context={"embedding": np.array([1., 0.])}, attempt=0)

    def test_offline_snapshot_does_not_require_temporal_votes_or_emit_audio_or_holding_duration(self):
        self.face.normed_embedding = np.array([0., 1.])
        self.objects = [box(0, [100, 100, 150, 150])]
        self.engine.vad.is_speech = lambda *args: self.fail("No offline audio was recorded")
        result = self.engine.analyze(self.item, b"jpeg", bytes(9600), 100, 0, snapshot=True)
        names = {row["event"] for row in result}
        self.assertIn("IDENTITY_MISMATCH", names)
        self.assertIn("PHONE_VISIBLE", names)
        self.assertNotIn("SPEECH", names)
        self.assertFalse(any("duration" in row for row in result))
        self.assertEqual([], self.item.context["votes"])

    def test_offline_request_has_fresh_context_and_bounded_reference_cache(self):
        live_context = {"votes": [True], "identity_evidence": ("live", "time")}
        self.engine.verification_faces = lambda image: [self.face]
        observed = []
        self.engine.analyze = lambda item, *args, **kwargs: observed.append(item.context) or []
        for i in range(70):
            self.assertTrue(self.engine.analyze_offline(b"jpeg", str(i).encode())["ok"])
        self.assertEqual(64, len(self.engine.offline_references))
        self.assertIsNot(observed[0], observed[1])
        self.assertNotIn("votes", observed[0])
        self.assertEqual({"votes": [True], "identity_evidence": ("live", "time")}, live_context)

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

    def test_matching_live_student_with_bystanders_remains_verified_and_multiple_people_is_reported(self):
        self.faces.append(NS(bbox=np.array([140,20,240,120]),normed_embedding=np.array([0.,1.])))
        self.people.append(box(0,[140,0,400,470]))
        self.assertIn('MULTIPLE_PEOPLE',self.replay())
        self.assertTrue(self.item.context['camera_identity_good'])
        self.assertEqual('verified',self.item.context['camera_identity_reason'])

    def test_person_detector_false_positive_does_not_lock_matching_student(self):
        self.people.append(box(0,[140,0,400,470]))
        self.assertIn('MULTIPLE_PEOPLE',self.replay())
        self.assertTrue(self.item.context['camera_identity_good'])

    def test_spoof_bystander_does_not_override_matching_live_student_but_warning_is_retained(self):
        self.faces.append(NS(bbox=np.array([140,20,240,120]),normed_embedding=np.array([0.,1.])))
        self.engine.live_label=lambda frame,bbox:(1 if bbox[0]==20 else 0,.99)
        self.assertTrue({'MULTIPLE_PEOPLE','SPOOF_FACE'}.issubset(self.replay()))
        self.assertTrue(self.item.context['camera_identity_good'])

    def test_matching_spoof_and_wrong_live_face_cannot_together_unlock_exam(self):
        self.faces.append(NS(bbox=np.array([140,20,240,120]),normed_embedding=np.array([0.,1.])))
        self.engine.live_label=lambda frame,bbox:(0 if bbox[0]==20 else 1,.99)
        self.replay();self.assertFalse(self.item.context['camera_identity_good'])
        self.assertEqual('liveness_failed',self.item.context['camera_identity_reason'])

    def test_many_wrong_live_faces_still_fail_identity_instead_of_being_a_count_lock(self):
        self.face.normed_embedding=np.array([0.,1.]);self.faces.append(self.face)
        self.assertIn('IDENTITY_MISMATCH',self.replay())
        self.assertFalse(self.item.context['camera_identity_good'])
        self.assertEqual('identity_mismatch',self.item.context['camera_identity_reason'])

    def test_phone_detection_runs_even_when_face_is_hidden(self):
        self.faces = []
        self.objects = [box(0, [180.1, 121.2, 397.6, 439.7], .694)]
        self.assertTrue({"NO_FACE", "PHONE_VISIBLE"}.issubset(self.replay()))

    def test_live_phone_alert_needs_no_hand_or_person_model_result_and_never_claims_holding(self):
        self.people = []
        self.objects = [box(0, [100, 100, 150, 150])]
        events = self.replay()
        self.assertIn('PHONE_VISIBLE', events)
        self.assertFalse(any('HOLDING' in event for event in events))

    def test_sampling_lease_change_cannot_complete_old_object_confirmation(self):
        self.objects = [box(0, [100, 100, 150, 150])]
        for now in [100, 100.6, 101.3]:
            self.engine.analyze(self.item, b'jpeg', b'', now, 1)
        result = self.engine.analyze(self.item, b'jpeg', b'', 102.5, 2)
        self.assertFalse(any(event[0] == 'PHONE_VISIBLE' for event in result))
        self.assertEqual({'PHONE_VISIBLE':102.5}, self.item.context['object_visible_since'])

    def test_voice_and_visual_models_both_run(self):
        self.assertTrue({"SPEECH", "HEAD_LEFT"}.issubset(self.replay(bytes([1])*9600)))

    def test_sampling_gap_resets_all_confirmation_state(self):
        self.engine.analyze(self.item, b"jpeg", bytes(9600), 100, 1)
        events = self.engine.analyze(self.item, b"jpeg", bytes(9600), 200, 2)
        self.assertEqual([], events)
        self.assertEqual(1, len(self.item.context["votes"]))

    def test_old_identity_votes_never_label_recovered_frames_as_mismatch_or_spoof(self):
        for kind in ('mismatch', 'spoof'):
            self.item.context = {'embedding': np.array([1., 0.])}
            self.face.normed_embedding = np.array([0., 1.])
            self.engine.live_label = lambda frame,bbox: (0 if kind=='spoof' else 1,.99)
            # Nine bad frames leave enough old votes to trigger on a later good frame.
            for i in range(9):self.engine.analyze(self.item,b'jpeg',b'',100+i*1.7,1)
            self.face.normed_embedding = np.array([1., 0.])
            self.engine.live_label = lambda frame,bbox: (1,.99)
            for i in range(9,12):
                events=self.engine.analyze(self.item,b'jpeg',b'',100+i*1.7,1)
                self.assertFalse({'IDENTITY_MISMATCH','SPOOF_FACE'} & {event[0] for event in events})

    def test_first_mismatch_photo_is_immutable_for_later_warning_and_lock(self):
        import json,tempfile
        from uuid import uuid4
        from unittest.mock import patch
        from src.evidence.evidence_logger import EvidenceLogger
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory);first=str(uuid4());second=str(uuid4())
            item=NS(attempt=12,context={'logger':EvidenceLogger(root/'attempt-12',12),
                    'capture_uuid':first,'capture_at':'2026-10-23T05:20:50+00:00'})
            with patch('evidence_delivery.OUTBOX',root/'outbox'):
                self.engine.deliver_identity_observation(item,b'first offending jpeg')
                original=next((root/'attempt-12').glob('*.jpg')).read_bytes()
                self.raw=np.zeros_like(self.raw)
                item.context.update(capture_uuid=second,capture_at='2026-10-23T05:21:06+00:00')
                self.engine.deliver_identity_observation(item,b'later jpeg')  # No duplicate observation.
                self.engine.deliver(item,[('IDENTITY_MISMATCH',1.7,50,'HIGH',self.raw),('SPEECH',2,50,'HIGH',self.raw)])
                self.engine.deliver_camera_lock(item,b'later jpeg',5.4)
            payloads=[json.loads(path.read_text())['payload'] for path in (root/'outbox').glob('*.json')]
            identity=[p for p in payloads if p['event']!='SPEECH']
            self.assertEqual(3,len(identity))
            self.assertEqual({first},{p['captureUuid'] for p in identity})
            self.assertEqual({'2026-10-23T05:20:50+00:00'},{p['timestamp'] for p in identity})
            self.assertEqual(1,len({p['evidencePath'] for p in identity}))
            self.assertTrue(all(Path(p['evidencePath']).read_bytes()==original for p in identity))
            speech=next(p for p in payloads if p['event']=='SPEECH')
            self.assertEqual(second,speech['captureUuid'])
            self.assertNotEqual(original,Path(speech['evidencePath']).read_bytes())

    def test_observation_outbox_failure_does_not_mark_snapshot_saved_and_can_retry(self):
        import tempfile
        from unittest.mock import patch
        from src.evidence.evidence_logger import EvidenceLogger
        with tempfile.TemporaryDirectory() as directory:
            item=NS(attempt=12,context={'logger':EvidenceLogger(directory,12)})
            with patch('evidence_delivery.enqueue',side_effect=OSError('Synthetic failure')):
                with self.assertRaises(OSError):self.engine.deliver_identity_observation(item,b'jpeg')
            self.assertNotIn('identity_evidence',item.context)
            with patch('evidence_delivery.enqueue') as enqueue:
                self.engine.deliver_identity_observation(item,b'jpeg')
                self.engine.deliver_identity_observation(item,b'jpeg')
                enqueue.assert_called_once()

    def test_monitor_saves_first_photo_then_locks_same_episode_and_resets_after_recovery(self):
        import base64,json,tempfile
        from datetime import datetime,timezone
        from unittest.mock import patch
        from batch_monitor import BatchMonitor
        from src.evidence.evidence_logger import EvidenceLogger
        now=[1800000000.0];good=[False]
        monitor=BatchMonitor(None,clock=lambda:now[0]);monitor.model_status='ready'
        monitor.register({'attemptId':12,'studentId':112,'roomId':1,'remainingSeconds':3600,
            'sessionEnd':datetime.fromtimestamp(now[0]+3600,timezone.utc).isoformat(),
            'referencePhotoBase64':base64.b64encode(b'\xff\xd8reference').decode()})
        item=monitor.sessions[12]
        def analyze(session,*args):
            session.context.update(camera_identity_good=good[0],identity_mismatch_observed=not good[0],
                camera_identity_reason='verified' if good[0] else 'identity_mismatch')
            return []
        self.engine.analyze=analyze
        def sample():
            monitor.frame({'attemptId':12,'lease':monitor.generation,'jpeg':base64.b64encode(b'\xff\xd8image').decode()})
            monitor.process_one(self.engine);now[0]+=.5
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory);item.context['logger']=EvidenceLogger(root/'attempt-12',12)
            with patch('evidence_delivery.OUTBOX',root/'outbox'):
                sample()
                self.assertNotEqual('blocked',item.camera_state)
                self.assertEqual(1,len(list((root/'outbox').glob('*.json'))))
                first=item.context['identity_evidence']
                self.raw=np.zeros_like(self.raw)
                for _ in range(12):sample()
                self.assertEqual('blocked',item.camera_state)
                payloads=[json.loads(p.read_text())['payload'] for p in (root/'outbox').glob('*.json')]
                self.assertEqual({'CAMERA_IDENTITY_OBSERVATION','CAMERA_IDENTITY_LOCK'},{p['event'] for p in payloads})
                self.assertEqual({first[0]},{p['captureUuid'] for p in payloads})
                self.assertEqual(1,len({p['evidencePath'] for p in payloads}))
                good[0]=True
                for _ in range(3):sample()
                self.assertEqual('verified',item.camera_state);self.assertNotIn('identity_evidence',item.context)
                good[0]=False;sample()
                self.assertNotEqual(first[0],item.context['identity_evidence'][0])

    def test_identity_lock_image_is_saved_and_queued_for_admin_even_without_voted_event(self):
        import json
        import tempfile
        from unittest.mock import patch
        from src.evidence.evidence_logger import EvidenceLogger
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory)
            item=NS(attempt=12,context={'logger':EvidenceLogger(root/'attempt-12',12)})
            with patch('evidence_delivery.OUTBOX',root/'outbox'):
                self.engine.deliver_camera_lock(item,b'jpeg',5.5)
            records=list((root/'outbox').glob('*.json'));self.assertEqual(1,len(records))
            payload=json.loads(records[0].read_text())['payload']
            self.assertEqual('CAMERA_IDENTITY_LOCK',payload['event'])
            self.assertEqual(12,payload['attemptId']);self.assertEqual(50,payload['riskScore'])
            self.assertEqual('pending',payload['evidenceStatus']);self.assertTrue(Path(payload['evidencePath']).is_file())

    def test_voted_warnings_and_lock_share_one_frame_identity_and_photo(self):
        import json,tempfile
        from uuid import uuid4
        from unittest.mock import patch
        from src.evidence.evidence_logger import EvidenceLogger
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory);capture=str(uuid4())
            item=NS(attempt=12,context={'logger':EvidenceLogger(root/'attempt-12',12),'capture_uuid':capture})
            with patch('evidence_delivery.OUTBOX',root/'outbox'):
                self.engine.deliver(item,[('SPEECH',2,50,'HIGH',self.raw),('IDENTITY_MISMATCH',5,50,'HIGH',self.raw)])
                self.engine.deliver_camera_lock(item,b'jpeg',5)
            payloads=[json.loads(path.read_text())['payload'] for path in (root/'outbox').glob('*.json')]
            self.assertEqual(3,len(payloads));self.assertEqual({capture},{item['captureUuid'] for item in payloads})
            self.assertEqual(1,len({item['evidencePath'] for item in payloads}))


if __name__ == "__main__":
    unittest.main()
