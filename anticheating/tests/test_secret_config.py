import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'app'))
from env_config import load_env_file, resolve_internal_secret


class SecretConfigTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name) / 'anticheating'
        self.root.mkdir()
        self.config = self.root.parent / 'backend/src/main/resources/application.properties'
        self.config.parent.mkdir(parents=True)
        self.env = patch.dict(os.environ, {}, clear=True)
        self.env.start()

    def tearDown(self):
        self.env.stop()
        self.temp.cleanup()

    def write_config(self, value):
        self.config.write_text('app.anticheat.secret=' + value + '\n', encoding='utf-8')

    def test_local_backend_secret_is_used(self):
        self.write_config('test-local-secret')
        secret, source = resolve_internal_secret(self.root)
        self.assertEqual(secret, 'test-local-secret')
        self.assertIn('application.properties', source)

    def test_explicit_environment_wins(self):
        self.write_config('test-file-secret')
        os.environ['ANTICHEAT_INTERNAL_SECRET'] = 'test-env-secret'
        self.assertEqual(resolve_internal_secret(self.root), ('test-env-secret', 'ANTICHEAT_INTERNAL_SECRET'))

    def test_dotenv_loaded_and_environment_not_overwritten(self):
        envfile = self.root / '.env'
        envfile.write_text('ANTICHEAT_INTERNAL_SECRET="test-dotenv-secret"\n', encoding='utf-8-sig')
        load_env_file(envfile)
        self.assertEqual(resolve_internal_secret(self.root)[0], 'test-dotenv-secret')
        os.environ['ANTICHEAT_INTERNAL_SECRET'] = 'test-shell-secret'
        load_env_file(envfile)
        self.assertEqual(resolve_internal_secret(self.root)[0], 'test-shell-secret')

    def test_spring_environment_override(self):
        self.write_config('test-file-secret')
        os.environ['APP_ANTICHEAT_SECRET'] = 'test-spring-secret'
        self.assertEqual(resolve_internal_secret(self.root)[0], 'test-spring-secret')

    def test_placeholder_and_default(self):
        self.write_config('${EXAM_SHARED_SECRET:test-default}')
        self.assertEqual(resolve_internal_secret(self.root)[0], 'test-default')
        os.environ['EXAM_SHARED_SECRET'] = 'test-placeholder-secret'
        self.assertEqual(resolve_internal_secret(self.root)[0], 'test-placeholder-secret')

    def test_missing_or_blank_secret_fails(self):
        with self.assertRaises(ValueError):
            resolve_internal_secret(self.root)
        self.write_config('')
        with self.assertRaises(ValueError):
            resolve_internal_secret(self.root)
        os.environ['ANTICHEAT_INTERNAL_SECRET'] = ' '
        with self.assertRaises(ValueError):
            resolve_internal_secret(self.root)

    def test_unresolved_placeholder_fails(self):
        self.write_config('${UNSET_SECRET}')
        with self.assertRaises(ValueError):
            resolve_internal_secret(self.root)


if __name__ == '__main__':
    unittest.main()
