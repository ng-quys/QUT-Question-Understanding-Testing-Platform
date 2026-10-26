import base64
import importlib.util
import json
import sys
import threading
import unittest
import urllib.error
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/"app"))
from batch_monitor import BatchMonitor


class BatchHttpTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        path=Path(__file__).resolve().parents[1]/"app/run_service.py"
        spec=importlib.util.spec_from_file_location("batch_http_service",path)
        cls.module=importlib.util.module_from_spec(spec);spec.loader.exec_module(cls.module)
        cls.module.SECRET="batch-test-placeholder"
        cls.server=cls.module.BoundedHTTPServer(("127.0.0.1",0),cls.module.Handler)
        cls.thread=threading.Thread(target=cls.server.serve_forever,daemon=True);cls.thread.start()
        cls.url=f"http://127.0.0.1:{cls.server.server_port}"
    @classmethod
    def tearDownClass(cls):cls.server.shutdown();cls.server.server_close();cls.thread.join(3)
    def setUp(self):
        self.module.batch_monitor=BatchMonitor(None)
        self.module.batch_monitor.model_status="ready"
    def post(self,action,data,secret="batch-test-placeholder"):
        request=urllib.request.Request(self.url+"/monitoring/"+action,data=json.dumps(data).encode(),headers={"Content-Type":"application/json","X-AntiCheat-Secret":secret})
        with urllib.request.urlopen(request,timeout=3) as response:return json.load(response)
    def register(self,key):
        return self.post("register",{"attemptId":key,"studentId":key+100,"remainingSeconds":3600,
            "sessionEnd":(datetime.now(timezone.utc)+timedelta(hours=1)).isoformat(),
            "referencePhotoBase64":base64.b64encode(b"\xff\xd8reference").decode()})
    def test_internal_secret_required_for_status_frames_and_registration(self):
        for action in ("register","status","frame","stop"):
            with self.assertRaises(urllib.error.HTTPError) as error:self.post(action,{},"wrong")
            self.assertEqual(401,error.exception.code)
    def test_register_is_immediate_without_loading_a_model_and_idempotent(self):
        self.assertEqual("connecting",self.register(1)["status"])
        self.register(1);self.assertEqual(1,len(self.module.batch_monitor.sessions))
    def test_sixth_person_is_waiting_and_cannot_upload(self):
        for key in range(1,7):self.register(key)
        value=self.post("status",{"attemptId":6});self.assertFalse(value["captureAllowed"])
        result=self.post("frame",{"attemptId":6,"lease":value["lease"],"jpeg":"invalid"})
        self.assertFalse(result["accepted"])
    def test_selected_frame_is_queued_and_stop_drops_it(self):
        value=self.register(1)
        result=self.post("frame",{"attemptId":1,"lease":value["lease"],"jpeg":base64.b64encode(b"\xff\xd8image").decode(),"audioPcm16":base64.b64encode(bytes(960)).decode()})
        self.assertTrue(result["accepted"])
        self.post("stop",{"attemptId":1})
        self.assertEqual("unregistered",self.post("status",{"attemptId":1})["status"])
    def test_public_health_does_not_expose_batch_roster(self):
        self.register(1)
        with urllib.request.urlopen(self.url+"/health",timeout=3) as response:self.assertNotIn("sessions",json.load(response))


if __name__=="__main__":unittest.main()
