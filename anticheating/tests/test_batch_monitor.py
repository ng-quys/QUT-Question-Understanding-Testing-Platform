import base64
import sys
import unittest
from datetime import datetime, timezone
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "app"))
from batch_monitor import BatchMonitor


class Clock:
    def __init__(self): self.now = 1800000000
    def __call__(self): return self.now
    def advance(self, seconds): self.now += seconds


class Evaluator:
    def __init__(self): self.delivered = []
    def analyze(self,item,image,audio,now,generation): return [item.attempt]
    def deliver(self,item,events): self.delivered.append((item.attempt,events))


class BatchMonitorTests(unittest.TestCase):
    def setUp(self):
        self.clock=Clock();self.monitor=BatchMonitor(None,clock=self.clock)
        self.monitor.model_status="ready"
    def register(self, key):
        return self.monitor.register({"attemptId":key,"studentId":key+100,"roomId":1,
            "remainingSeconds":3600,"sessionEnd":datetime.fromtimestamp(self.clock()+3600,timezone.utc).isoformat(),
            "referencePhotoBase64":base64.b64encode(b"\xff\xd8reference").decode()})
    def frame(self,key,lease=None):
        return self.monitor.frame({"attemptId":key,"lease":self.monitor.generation if lease is None else lease,
            "jpeg":base64.b64encode(b"\xff\xd8image").decode(),"audioPcm16":base64.b64encode(bytes(960)).decode()})
    def test_one_person_continues_without_waiting_for_empty_groups(self):
        self.register(1);lease=self.monitor.generation
        for _ in range(3):
            self.clock.advance(10)
            self.assertTrue(self.monitor.status(1)["captureAllowed"])
            self.assertEqual(lease,self.monitor.generation)
    def test_six_people_rotate_five_then_one_and_back(self):
        for key in range(1,7):self.register(key)
        self.assertEqual((1,2,3,4,5),self.monitor.selected)
        self.assertEqual("waiting",self.monitor.status(6)["status"])
        self.clock.advance(10);self.monitor.tick();self.assertEqual((6,),self.monitor.selected)
        self.clock.advance(10);self.monitor.tick();self.assertEqual((1,2,3,4,5),self.monitor.selected)
    def test_global_limit_applies_across_rooms_and_full_rotation_is_fair(self):
        for key in range(1,31):self.register(key);self.monitor.sessions[key].room=key%4
        seen=set()
        for _ in range(6):
            self.monitor.tick();self.assertLessEqual(len(self.monitor.selected),5)
            seen.update(self.monitor.selected)
            for key in list(self.monitor.sessions):self.monitor.status(key)
            self.clock.advance(10)
        self.assertEqual(set(range(1,31)),seen)
    def test_waiting_or_old_lease_frames_are_rejected_and_not_buffered(self):
        for key in range(1,7):self.register(key)
        lease=self.monitor.generation
        self.assertFalse(self.frame(6)["accepted"])
        self.clock.advance(10);self.monitor.tick()
        self.assertFalse(self.frame(1,lease)["accepted"])
        self.assertIsNone(self.monitor.sessions[1].frame)
    def test_latest_frame_slot_and_rate_limit_are_bounded(self):
        self.register(1);self.assertTrue(self.frame(1)["accepted"])
        self.assertEqual("rate_limited",self.frame(1)["reason"])
        self.clock.advance(.5);self.assertTrue(self.frame(1)["accepted"])
        self.assertIsInstance(self.monitor.sessions[1].frame,tuple)
    def test_ready_requires_successful_fresh_inference(self):
        self.register(1);self.assertFalse(self.monitor.status(1)["ready"])
        self.frame(1);self.monitor.process_one(Evaluator());self.assertTrue(self.monitor.status(1)["ready"])
        self.clock.advance(16);self.assertFalse(self.monitor.status(1)["ready"])
    def test_old_results_are_discarded_after_rotation(self):
        for key in range(1,7):self.register(key)
        self.frame(1);evaluator=Evaluator()
        def delayed(*args):self.clock.advance(10);return [1]
        evaluator.analyze=delayed;self.monitor.process_one(evaluator)
        self.assertEqual([],evaluator.delivered)
    def test_stop_during_inference_cannot_attach_evidence_to_another_attempt(self):
        self.register(1);self.frame(1);evaluator=Evaluator()
        def stop(*args):self.monitor.stop(1);return [1]
        evaluator.analyze=stop;self.monitor.process_one(evaluator)
        self.assertEqual([],evaluator.delivered)
    def test_one_bad_frame_does_not_stop_other_students(self):
        self.register(1);self.register(2);self.frame(1);self.frame(2)
        evaluator=Evaluator()
        def analyze(item,*args):
            if item.attempt==1:raise ValueError("test")
            return [item.attempt]
        evaluator.analyze=analyze
        self.monitor.process_one(evaluator);self.monitor.process_one(evaluator)
        self.assertEqual([(2,[2])],evaluator.delivered)
        self.assertEqual("error",self.monitor.status(1)["status"])
    def test_expiry_disconnect_and_submission_remove_sessions(self):
        self.register(1);self.register(2);self.monitor.stop(2)
        self.clock.advance(46);self.monitor.tick();self.assertEqual(0,len(self.monitor.sessions))
        self.register(3);self.monitor.sessions[3].deadline=self.clock()+1
        self.clock.advance(2);self.assertEqual("unregistered",self.monitor.status(3)["status"])
    def test_register_retry_does_not_extend_deadline_or_change_identity(self):
        self.register(1);deadline=self.monitor.sessions[1].deadline
        self.clock.advance(2);self.register(1)
        self.assertEqual(deadline,self.monitor.sessions[1].deadline)
        self.monitor.sessions[1].student=999
        with self.assertRaises(ValueError):self.register(1)
    def test_capacity_and_payload_validation(self):
        self.monitor.capacity=5
        for key in range(1,6):self.register(key)
        with self.assertRaises(ValueError):self.register(6)
        with self.assertRaises(ValueError):self.monitor.frame({"attemptId":1,"lease":self.monitor.generation,"jpeg":"!!","audioPcm16":""})
    def test_waiting_group_no_media_no_false_no_face_event(self):
        self.register(1);evaluator=Evaluator()
        self.assertFalse(self.monitor.process_one(evaluator));self.assertEqual([],evaluator.delivered)


if __name__ == "__main__":unittest.main()
