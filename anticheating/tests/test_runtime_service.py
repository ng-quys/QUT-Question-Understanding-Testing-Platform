import importlib.util
import json
import tempfile
import time
import unittest
import threading
import urllib.request
import urllib.error
from pathlib import Path
from unittest.mock import patch

SERVICE = Path(__file__).resolve().parents[1] / 'app' / 'run_service.py'
spec = importlib.util.spec_from_file_location('service', SERVICE)
service = importlib.util.module_from_spec(spec)
spec.loader.exec_module(service)

class FakeProcess:
    pid = 123
    def __init__(self, code=None): self.code = code
    def poll(self): return self.code
    def terminate(self): self.code = 0
    def wait(self, timeout=None): return self.code
    def kill(self): self.code = -9

class RuntimeTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.patches = [patch.object(service, 'ROOT', self.root), patch.object(service, 'PROFILE_DIR', self.root / 'profiles')]
        for p in self.patches: p.start()
        service.process = None
        service.active_attempt = None
        service.state_file = None
        service.last_error = ''
        service.active_deadline = None
        (self.root / 'profiles').mkdir()
        (self.root / 'profiles' / '7.jpg').write_bytes(b'reference')
        self.models = ['identity/buffalo_l/det_10g.onnx', 'identity/buffalo_l/1k3d68.onnx', 'identity/buffalo_l/w600k_r50.onnx', 'liveness/MiniFASNetV2.onnx', 'person/yolo11s.pt', 'hands/hand_landmarker.task', 'objects/best.pt']
        for name in self.models:
            p = self.root / 'models' / name
            p.parent.mkdir(parents=True, exist_ok=True)
            p.write_bytes(b'model')
    def tearDown(self):
        for p in self.patches: p.stop()
        self.tmp.cleanup()
    def worker(self, args, cwd, env, status='ready'):
        Path(env['ANTICHEAT_STATE_FILE']).write_text(json.dumps({'status':status,'message':'camera failed' if status=='error' else 'ready','heartbeat':time.time()}))
        return FakeProcess()
    def test_start_waits_for_ready_and_is_idempotent(self):
        with patch.object(service.subprocess, 'Popen', side_effect=self.worker) as spawn:
            self.assertTrue(service.start_attempt(1, 7)['ready'])
            self.assertTrue(service.start_attempt(1, 7)['ready'])
            self.assertEqual(spawn.call_count, 1)
            self.assertTrue((self.root/'models/identity/models/buffalo_l/det_10g.onnx').exists())
    def test_missing_face_detector_does_not_spawn(self):
        (self.root/'models/identity/buffalo_l/det_10g.onnx').unlink()
        with patch.object(service.subprocess, 'Popen') as spawn:
            with self.assertRaisesRegex(FileNotFoundError, 'det_10g'):
                service.start_attempt(1,7)
            spawn.assert_not_called()
    def test_missing_profile(self):
        with self.assertRaisesRegex(FileNotFoundError, 'ảnh khuôn mặt'):
            service.start_attempt(1,8)
    def test_worker_failure_is_reported_and_terminated(self):
        with patch.object(service.subprocess,'Popen',side_effect=lambda *a,**kw:self.worker(*a,**kw,status='error')):
            with self.assertRaisesRegex(RuntimeError,'camera failed'): service.start_attempt(1,7)
            self.assertFalse(service.state()['running'])
            self.assertEqual(service.state()['status'], 'error')
    def test_loading_is_not_ready(self):
        service.process=FakeProcess()
        service.active_attempt=1
        self.assertFalse(service.state()['ready'])
        self.assertEqual(service.state()['status'], 'loading')
    def test_hung_worker_is_unhealthy(self):
        service.process=FakeProcess()
        service.active_attempt=1
        service.state_file=self.root/'state.json'
        service.state_file.write_text(json.dumps({'status':'ready','heartbeat':time.time()-30}))
        self.assertFalse(service.state()['ready'])
        self.assertEqual(service.state()['status'],'error')
    def test_dead_worker_not_healthy(self):
        service.process=FakeProcess(1)
        service.active_attempt=1
        self.assertEqual(service.state()['status'],'error')
    def test_other_attempt_cannot_take_camera_or_stop_worker(self):
        service.process=FakeProcess()
        service.active_attempt=1
        with self.assertRaises(RuntimeError): service.start_attempt(2,7)
        with self.assertRaises(RuntimeError): service.stop_attempt(2)
        self.assertIsNone(service.process.poll())
    def test_stop_clears_session(self):
        service.process=FakeProcess()
        service.active_attempt=1
        service.stop_attempt(1)
        self.assertIsNone(service.active_attempt)
        self.assertFalse(service.state()['running'])
    def test_deadline_matches_session_end(self):
        with patch.object(service.subprocess, 'Popen', side_effect=self.worker):
            end = '2030-01-01T00:00:00Z'
            service.start_attempt(1,7,remaining_seconds=60,session_end=end,clock_starts_on_ready=True)
            self.assertAlmostEqual(service.active_deadline, time.time()+60, delta=2)

    def test_http_start_requires_secret_and_reports_ready(self):
        server=service.ThreadingHTTPServer(('127.0.0.1',0),service.Handler)
        thread=threading.Thread(target=server.serve_forever,daemon=True)
        thread.start()
        url=f'http://127.0.0.1:{server.server_port}/session/start'
        data=json.dumps({'attemptId':1,'studentId':7}).encode()
        try:
            with self.assertRaises(urllib.error.HTTPError) as error:
                urllib.request.urlopen(urllib.request.Request(url,data=data))
            self.assertEqual(error.exception.code,401)
            with patch.object(service.subprocess,'Popen',side_effect=self.worker):
                req=urllib.request.Request(url,data=data,headers={'X-AntiCheat-Secret':service.SECRET})
                with urllib.request.urlopen(req) as response:
                    payload=json.load(response)
                self.assertTrue(payload['ready'])
                self.assertEqual(payload['attemptId'],1)
        finally:
            server.shutdown()
            server.server_close()
            thread.join()

    def test_timeout_terminates_worker(self):
        with patch.object(service.subprocess,'Popen',return_value=FakeProcess()), patch.object(service.time,'monotonic',side_effect=[0,91]):
            with self.assertRaisesRegex(RuntimeError,'90 giây'): service.start_attempt(1,7)
            self.assertFalse(service.state()['running'])

if __name__=='__main__': unittest.main()
