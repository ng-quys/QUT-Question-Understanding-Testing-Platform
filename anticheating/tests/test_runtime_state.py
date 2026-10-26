import contextlib
import io
import json
import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "app"))
import runtime_state


class RuntimeStateTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.path = Path(self.directory.name) / "attempt-1.json"
        self.environment = patch.dict(os.environ, {"ANTICHEAT_STATE_FILE": str(self.path)})
        self.environment.start()
        self.addCleanup(self.environment.stop)
        self.addCleanup(self.directory.cleanup)
        runtime_state.last_write = 0
        runtime_state.last_warning = float("-inf")

    def test_windows_lock_is_retried_and_new_heartbeat_is_published(self):
        self.path.write_text('{"status":"loading"}', encoding="utf-8")
        replace = Path.replace
        failures = [PermissionError(13, "Access is denied"), PermissionError(13, "File is in use")]

        def temporarily_locked(source, target):
            # The reader always sees a complete previous snapshot while locked.
            self.assertEqual(json.loads(self.path.read_text(encoding="utf-8"))["status"], "loading")
            if failures:
                raise failures.pop(0)
            return replace(source, target)

        with patch.object(Path, "replace", temporarily_locked), patch.object(runtime_state.time, "sleep"):
            self.assertTrue(runtime_state.publish("ready", "Camera and microphone ready"))
        state = json.loads(self.path.read_text(encoding="utf-8"))
        self.assertEqual(state["status"], "ready")
        self.assertGreater(state["heartbeat"], 0)
        self.assertFalse(self.path.with_suffix(".tmp").exists())

    def test_persistent_lock_does_not_crash_or_claim_fresh_heartbeat(self):
        self.path.write_text('{"status":"ready","heartbeat":123}', encoding="utf-8")
        with patch.object(Path, "replace", side_effect=PermissionError(13, "Access is denied")), \
                patch.object(runtime_state.time, "sleep"), contextlib.redirect_stderr(io.StringIO()):
            self.assertFalse(runtime_state.publish("ready", "Camera ready"))
        self.assertEqual(json.loads(self.path.read_text(encoding="utf-8"))["heartbeat"], 123)
        self.assertEqual(runtime_state.last_write, 0)
        # The next frame can publish immediately once the lock is released.
        self.assertTrue(runtime_state.publish("ready", "Recovered"))
        self.assertEqual(json.loads(self.path.read_text(encoding="utf-8"))["message"], "Recovered")

    def test_disk_write_error_does_not_stop_pipeline(self):
        with patch.object(Path, "write_text", side_effect=OSError("Disk unavailable")), \
                contextlib.redirect_stderr(io.StringIO()) as errors:
            self.assertFalse(runtime_state.publish("ready", "Camera ready"))
        self.assertIn("Disk unavailable", errors.getvalue())
        self.assertEqual(runtime_state.last_write, 0)

    def test_original_pipeline_error_is_reported_when_state_file_is_locked(self):
        reported = []
        with patch.object(sys, "excepthook", lambda kind, value, tb: reported.append(value)):
            runtime_state.install_error_handler()
            error = RuntimeError("Camera disconnected")
            with patch.object(Path, "replace", side_effect=PermissionError(13, "Access is denied")), \
                    patch.object(runtime_state.time, "sleep"), contextlib.redirect_stderr(io.StringIO()):
                sys.excepthook(type(error), error, None)
        self.assertEqual(reported, [error])


if __name__ == "__main__":
    unittest.main()
