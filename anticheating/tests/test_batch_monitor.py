import base64
import sys
import threading
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
    def deliver_identity_observation(self,item,image): pass


class BatchMonitorTests(unittest.TestCase):
    def setUp(self):
        self.clock=Clock();self.monitor=BatchMonitor(None,clock=self.clock)
        self.monitor.model_status="ready"
    def test_backfill_yields_to_preflight_and_is_rate_limited_while_live_busy(self):
        evaluator = type("Offline", (), {"analyze_offline": lambda _, image, reference: {"ok": True, "findings": []}})()
        def enqueue():
            job = {"image": b"jpg", "reference": b"ref", "done": threading.Event(), "expires": self.clock()+8}
            self.monitor.offline_jobs.put_nowait(job)
            return job
        first = enqueue()
        self.monitor.preflights.put_nowait({"sentinel": True})
        self.assertFalse(self.monitor.process_offline(evaluator))
        self.assertFalse(first["done"].is_set())
        self.monitor.preflights.get_nowait()
        self.assertTrue(self.monitor.process_offline(evaluator, live_busy=True))
        self.assertTrue(first["done"].is_set())
        enqueue()
        self.assertFalse(self.monitor.process_offline(evaluator, live_busy=True))
        self.assertTrue(self.monitor.process_offline(evaluator, live_busy=False))
        self.assertEqual({}, self.monitor.sessions)

    def test_expired_backfill_job_does_not_run_models(self):
        evaluator = type("Offline", (), {"analyze_offline": lambda *args: self.fail("Expired work must not run")})()
        job = {"done": threading.Event(), "expires": self.clock()-1}
        self.monitor.offline_jobs.put_nowait(job)
        self.assertTrue(self.monitor.process_offline(evaluator))
        self.assertTrue(job["done"].is_set())

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
    def test_camera_frames_can_still_be_analyzed_when_microphone_is_unavailable(self):
        self.register(1)
        result=self.monitor.frame({"attemptId":1,"lease":self.monitor.generation,
            "jpeg":base64.b64encode(b"\xff\xd8image").decode(),"audioPcm16":""})
        self.assertTrue(result["accepted"])
        self.assertTrue(self.monitor.process_one(Evaluator()))

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

    def test_bad_camera_is_confirmed_over_time_and_fresh_good_frames_restore_it(self):
        self.register(1)
        evaluator=Evaluator()
        good=False
        def analyze(item,*args):
            item.context["camera_identity_good"]=good
            item.context["camera_identity_reason"]="verified" if good else "no_face"
            return []
        evaluator.analyze=analyze
        for _ in range(12):
            self.frame(1);self.monitor.process_one(evaluator);self.clock.advance(.5)
        self.assertEqual("blocked",self.monitor.status(1)["cameraState"])
        good=True
        self.frame(1);self.monitor.process_one(evaluator);self.clock.advance(.5)
        self.assertEqual("checking",self.monitor.status(1)["cameraState"])
        for _ in range(3):
            self.frame(1);self.monitor.process_one(evaluator);self.clock.advance(.5)
        self.assertEqual("verified",self.monitor.status(1)["cameraState"])

    def test_returning_after_sampling_gap_does_not_relabel_old_block_as_new_detection(self):
        self.register(1);item=self.monitor.sessions[1]
        item.camera_state="blocked";item.camera_reason="no_face";item.last_processed=self.clock()
        self.clock.advance(4)
        evaluator=Evaluator()
        evaluator.analyze=lambda session,*args:session.context.update(camera_identity_good=False) or []
        self.frame(1);self.monitor.process_one(evaluator)
        self.assertEqual("checking",self.monitor.status(1)["cameraState"])

    def test_sampling_gaps_do_not_become_continuous_bad_camera_time(self):
        self.register(1)
        evaluator=Evaluator()
        def analyze(item,*args):item.context["camera_identity_good"]=False;return []
        evaluator.analyze=analyze
        self.frame(1);self.monitor.process_one(evaluator);self.clock.advance(8)
        self.frame(1);self.monitor.process_one(evaluator)
        self.assertEqual("checking",self.monitor.status(1)["cameraState"])

    def test_identity_lock_saves_current_image_once_until_verified_recovery(self):
        self.register(1);evaluator=Evaluator();images=[];good=False
        def analyze(item,*args):
            item.context.update(camera_identity_good=good,camera_identity_reason='verified' if good else 'identity_mismatch')
            return []
        evaluator.analyze=analyze
        evaluator.deliver_camera_lock=lambda item,image,duration:images.append((item.attempt,image,duration))
        def samples(count):
            for _ in range(count):self.frame(1);self.monitor.process_one(evaluator);self.clock.advance(.5)
        samples(16)
        self.assertEqual('blocked',self.monitor.status(1)['cameraState'])
        self.assertEqual(1,len(images));self.assertEqual((1,b'\xff\xd8image'),images[0][:2]);self.assertGreaterEqual(images[0][2],5)
        self.clock.advance(4);samples(14);self.assertEqual(1,len(images))
        good=True;samples(3);self.assertEqual('verified',self.monitor.status(1)['cameraState'])
        good=False;samples(14);self.assertEqual(2,len(images))

    def test_failed_lock_evidence_write_is_retried_without_losing_lock(self):
        self.register(1);evaluator=Evaluator();attempts=[]
        evaluator.analyze=lambda item,*args:item.context.update(camera_identity_good=False,camera_identity_reason='identity_mismatch') or []
        def capture(item,image,duration):
            attempts.append(item.attempt)
            if len(attempts)==1:raise OSError('Synthetic outbox failure')
        evaluator.deliver_camera_lock=capture
        for _ in range(15):self.frame(1);self.monitor.process_one(evaluator);self.clock.advance(.5)
        self.assertEqual([1,1],attempts)
        self.assertTrue(self.monitor.sessions[1].identity_lock_evidence_saved)
        self.assertEqual('blocked',self.monitor.status(1)['cameraState'])

    def test_identity_photo_is_queued_before_lock_and_failure_does_not_expose_block(self):
        self.register(1);evaluator=Evaluator();calls=[]
        evaluator.analyze=lambda item,*args:item.context.update(camera_identity_good=False,camera_identity_reason='identity_mismatch') or []
        def observe(item,image):
            calls.append(('photo',item.camera_state))
            if len(calls)==1:raise OSError('Synthetic photo write failure')
        def lock(item,image,duration):
            calls.append(('lock',item.camera_state))
            self.assertNotEqual('blocked',item.camera_state)
        evaluator.deliver_identity_observation=observe
        evaluator.deliver_camera_lock=lock
        self.frame(1);self.monitor.process_one(evaluator)
        self.assertNotEqual('blocked',self.monitor.status(1)['cameraState'])
        self.clock.advance(.5)
        for _ in range(13):self.frame(1);self.monitor.process_one(evaluator);self.clock.advance(.5)
        self.assertEqual('photo',calls[0][0]);self.assertEqual('blocked',self.monitor.status(1)['cameraState'])
        self.assertEqual(1,len([call for call in calls if call[0]=='lock']))

    def test_preflight_waits_for_models_and_does_not_open_an_attempt(self):
        self.monitor.model_status="starting"
        self.assertEqual("ai_unavailable",self.monitor.preflight({})["reason"])
        self.assertEqual(0,len(self.monitor.sessions))

    def test_preflight_jobs_use_the_same_serial_worker_and_skip_expired_images(self):
        import threading
        evaluator=Evaluator();calls=[]
        evaluator.verify_identity=lambda image,reference:calls.append((image,reference)) or {"verified":True}
        job={"image":b"image","reference":b"reference","done":threading.Event(),"expires":self.clock()+3}
        self.monitor.preflights.put(job);self.assertTrue(self.monitor.process_preflight(evaluator))
        self.assertTrue(job["done"].is_set());self.assertTrue(job["result"]["verified"])
        job2={"image":b"old","reference":b"reference","done":threading.Event(),"expires":self.clock()-1}
        self.monitor.preflights.put(job2);self.monitor.process_preflight(evaluator)
        self.assertEqual([(b"image",b"reference")],calls)
        self.assertEqual(0,len(self.monitor.sessions))


if __name__ == "__main__":unittest.main()
