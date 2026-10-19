import importlib.util
import os
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

ANTI = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ANTI / 'app'))
from model_config import REQUIRED_MODELS, prepare_models
spec = importlib.util.spec_from_file_location('configure_for_test', ANTI / 'configure_local.py')
config = importlib.util.module_from_spec(spec)
spec.loader.exec_module(config)


class LocalSetupTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.anti = self.root / 'anticheating'
        self.anti.mkdir()
        self.backend = self.root / 'backend/src/main/resources/application.properties'
        self.backend.parent.mkdir(parents=True)
        self.backend.write_bytes(b'server.port=8080\r\nspring.datasource.password=existing-test-password\r\n'
                                 b'keycloak.admin-client-secret=existing-test-key\r\n'
                                 b'app.anticheat.secret=existing-test-secret\r\n'
                                 b'app.student-profile-dir=old-location\r\n')
        self.environment = patch.dict(os.environ, {}, clear=True)
        self.environment.start()

    def tearDown(self):
        self.environment.stop()
        self.temp.cleanup()

    def fill_models(self, flat=False):
        for name in REQUIRED_MODELS:
            path = self.anti / 'models' / (Path(name).name if flat else name)
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(b'test-weights')

    def test_configuration_is_idempotent_and_preserves_unrelated_values(self):
        (self.anti / '.env').write_text('ANTICHEAT_CAMERA_INDEX=2\nANTICHEAT_DEVICE=cpu\n')
        result = config.configure(self.anti)
        backend = self.backend.read_bytes()
        environment = (self.anti / '.env').read_bytes()
        self.assertEqual(result['secret'], 'existing-test-secret')
        self.assertIn(b'spring.datasource.password=existing-test-password\r\n', backend)
        self.assertIn(b'keycloak.admin-client-secret=existing-test-key\r\n', backend)
        self.assertIn(b'app.student-profile-dir=auto\r\n', backend)
        self.assertIn(b'ANTICHEAT_CAMERA_INDEX=2', environment)
        config.configure(self.anti)
        self.assertEqual(self.backend.read_bytes(), backend)
        self.assertEqual((self.anti / '.env').read_bytes(), environment)

    def test_stale_shell_secret_does_not_replace_backend_secret(self):
        os.environ['APP_ANTICHEAT_SECRET'] = 'stale-shell-value'
        self.assertEqual(config.configure(self.anti)['secret'], 'existing-test-secret')

    def test_placeholder_resolves_from_environment(self):
        self.backend.write_text('app.anticheat.secret=${QUT_SHARED_KEY}\nserver.port=8090\n')
        os.environ['QUT_SHARED_KEY'] = 'test-shared-key'
        result = config.configure(self.anti)
        self.assertEqual(result['secret'], 'test-shared-key')
        self.assertEqual(result['backend_port'], 8090)

    def test_generated_secret_is_shared_and_stable(self):
        self.backend.write_text('app.anticheat.secret=change-me\n')
        first = config.configure(self.anti)['secret']
        self.assertNotEqual(first, 'change-me')
        self.assertEqual(first, config.configure(self.anti)['secret'])
        self.assertIn('ANTICHEAT_INTERNAL_SECRET=' + first, (self.anti / '.env').read_text())

    def test_existing_photos_are_copied_without_overwriting_newer_photo(self):
        old = self.root / 'old-photos';old.mkdir()
        (old / '26.jpg').write_bytes(b'old')
        (old / '27.jpg').write_bytes(b'copy-me')
        self.backend.write_text('app.anticheat.secret=test-key\napp.student-profile-dir=' + str(old) + '\n')
        new = self.anti / 'student-profiles';new.mkdir()
        (new / '26.jpg').write_bytes(b'new')
        config.configure(self.anti)
        self.assertEqual((new / '26.jpg').read_bytes(), b'new')
        self.assertEqual((new / '27.jpg').read_bytes(), b'copy-me')
        self.assertTrue((old / '27.jpg').exists())

    def test_canonical_models_remain_unchanged(self):
        self.fill_models()
        for model in prepare_models(self.anti / 'models'):
            self.assertEqual(model.read_bytes(), b'test-weights')

    def test_models_in_flat_folder_are_linked_to_expected_locations(self):
        self.fill_models(flat=True)
        for model in prepare_models(self.anti / 'models'):
            self.assertEqual(model.read_bytes(), b'test-weights')
        self.assertTrue((self.anti / 'models/det_10g.onnx').exists())

    def test_missing_model_fails_with_required_filename(self):
        self.fill_models()
        (self.anti / 'models/person/yolo11s.pt').unlink()
        with self.assertRaisesRegex(FileNotFoundError, 'yolo11s.pt'):
            prepare_models(self.anti / 'models')

    def test_ambiguous_model_is_not_guessed(self):
        self.fill_models()
        (self.anti / 'models/objects/best.pt').unlink()
        for name in ('unknown-a/best.pt', 'unknown-b/best.pt'):
            p = self.anti / 'models' / name;p.parent.mkdir();p.write_bytes(b'test')
        with self.assertRaisesRegex(FileNotFoundError, 'Ambiguous'):
            prepare_models(self.anti / 'models')

    def test_zero_byte_model_is_rejected(self):
        self.fill_models()
        (self.anti / 'models/liveness/MiniFASNetV2.onnx').write_bytes(b'')
        with self.assertRaisesRegex(FileNotFoundError, 'MiniFASNetV2'):
            prepare_models(self.anti / 'models')


if __name__ == '__main__':
    unittest.main()
