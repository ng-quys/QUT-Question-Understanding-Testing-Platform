import sys
import unittest
from pathlib import Path
from types import SimpleNamespace as NS
import numpy as np
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/"app"))
from shared_inference import SharedInference

class CameraVerificationTests(unittest.TestCase):
    def setUp(self):
        self.engine=SharedInference.__new__(SharedInference)
        self.face=NS(bbox=np.array([20,20,120,120]),normed_embedding=np.array([1.,0.]),det_score=.99)
        self.references=[NS(normed_embedding=np.array([1.,0.]))]
        self.faces=[self.face];self.people=[object()]
        self.engine.decode=lambda data,reference=False:"reference" if reference else "frame"
        self.engine.cv=NS(flip=lambda frame,axis:frame)
        self.engine.np=np;self.engine.device="cpu"
        self.engine.face=NS(get=lambda frame:self.references if frame=="reference" else self.faces)
        self.engine.person=NS(predict=lambda *args,**kw:[NS(boxes=self.people)])
        self.engine.live_label=lambda *args:(1,.99)
    def check(self):return self.engine.verify_identity(b"jpeg",b"reference")
    def test_single_matching_live_face_passes(self):self.assertTrue(self.check()["verified"])
    def test_no_face_or_privacy_shutter_is_rejected(self):
        self.faces=[];self.assertEqual("no_face",self.check()["reason"])
    def test_wrong_face_is_rejected(self):
        self.face.normed_embedding=np.array([0.,1.]);self.assertEqual("identity_mismatch",self.check()["reason"])
    def test_bystanders_do_not_block_matching_live_candidate_and_person_model_is_not_needed(self):
        other=NS(bbox=np.array([140,20,240,120]),normed_embedding=np.array([0.,1.]),det_score=.99)
        self.faces=[other,self.face]
        self.engine.person=NS(predict=lambda *args,**kw:self.fail('Entry must not count people'))
        self.assertTrue(self.check()["verified"])
    def test_identity_and_liveness_cannot_be_satisfied_by_two_different_people(self):
        other=NS(bbox=np.array([140,20,240,120]),normed_embedding=np.array([0.,1.]),det_score=.99)
        self.faces=[other,self.face]
        self.engine.live_label=lambda frame,bbox:(1,.99) if bbox[0]==140 else (0,.99)
        self.assertEqual('liveness_failed',self.check()['reason'])
    def test_multiple_wrong_faces_still_fail_identity(self):
        self.face.normed_embedding=np.array([0.,1.]);self.faces=[self.face,self.face]
        self.assertEqual('identity_mismatch',self.check()['reason'])
    def test_spoof_or_uncertain_liveness_does_not_pass(self):
        self.engine.live_label=lambda *args:(0,.99);self.assertFalse(self.check()["verified"])
        self.engine.live_label=lambda *args:(1,.5);self.assertFalse(self.check()["verified"])
    def test_reference_must_contain_exactly_one_face(self):
        self.references=[];self.assertEqual("reference_invalid",self.check()["reason"])
        self.references=[self.face,self.face];self.assertFalse(self.check()["verified"])
    def test_small_or_unclear_face_does_not_pass(self):
        self.face.bbox=np.array([0,0,10,10]);self.assertEqual("face_unclear",self.check()["reason"])
        self.face.bbox=np.array([0,0,100,100]);self.face.det_score=.3;self.assertFalse(self.check()["verified"])
    def test_repeated_frames_reuse_reference_but_always_analyze_live_frame(self):
        calls=[]
        self.engine.face.get=lambda frame:(calls.append(frame) or (self.references if frame=="reference" else self.faces))
        self.assertTrue(self.check()["verified"])
        self.face.normed_embedding=np.array([0.,1.])
        self.assertEqual("identity_mismatch",self.check()["reason"])
        self.assertEqual(["reference","frame","frame"],calls)
        self.engine.verify_identity(b"jpeg",b"changed-reference")
        self.assertEqual(2,calls.count("reference"))
    def test_reference_cache_is_bounded_and_expires(self):
        from unittest.mock import patch
        with patch('shared_inference.time.monotonic',return_value=10):
            for index in range(70):self.engine.verify_identity(b"jpeg",str(index).encode())
            self.assertEqual(64,len(self.engine._verification_references))
        with patch('shared_inference.time.monotonic',return_value=131):
            self.check()
            self.assertEqual(1,len(self.engine._verification_references))
    def test_fast_entry_path_uses_recognition_but_not_unrelated_face_models(self):
        calls=[]
        def recognize(image,face):
            calls.append('recognition');face.embedding=np.array([1.,0.])
        self.engine.face=NS(det_model=NS(detect=lambda *args,**kwargs:(np.array([[20,20,120,120,.99]]),np.zeros((1,5,2)))),
            models={'recognition':NS(get=recognize),'genderage':NS(get=lambda *args:self.fail('Unnecessary model ran'))})
        faces=self.engine.verification_faces('frame')
        self.assertEqual(['recognition'],calls)
        self.assertTrue(np.array_equal(np.array([1.,0.]),faces[0].normed_embedding))
if __name__=="__main__":unittest.main()
