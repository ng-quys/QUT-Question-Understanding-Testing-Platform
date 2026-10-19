import base64
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "app"))
from reference_photo import cache_reference_photo, MAX_PHOTO_BYTES


class ReferencePhotoTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.directory = Path(self.temp.name) / "another-machine"
        self.jpeg = b"\xff\xd8\xff\xe0synthetic-test-only\xff\xd9"
        self.encoded = base64.b64encode(self.jpeg).decode("ascii")

    def tearDown(self):
        self.temp.cleanup()

    def test_photo_arrives_on_machine_with_no_previous_local_photo(self):
        target = cache_reference_photo(self.directory, 26, self.encoded)
        self.assertEqual(target, (self.directory / "26.jpg").resolve())
        self.assertEqual(target.read_bytes(), self.jpeg)

    def test_invalid_payload_preserves_previous_cache(self):
        target = cache_reference_photo(self.directory, 26, self.encoded)
        for encoded in ["bad-base64", "https://other.invalid/private-photo", base64.b64encode(b"not jpeg").decode(), "x" * (7 * 1024 * 1024)]:
            with self.assertRaises(ValueError):
                cache_reference_photo(self.directory, 26, encoded)
            self.assertEqual(target.read_bytes(), self.jpeg)

    def test_cannot_choose_arbitrary_destination_or_id(self):
        for identifier in ["../27", -1, 0, True, None]:
            with self.assertRaises(ValueError):
                cache_reference_photo(self.directory, identifier, self.encoded)

    def test_interrupted_write_keeps_previous_photo_and_removes_temporary(self):
        target = cache_reference_photo(self.directory, 26, self.encoded)
        with patch("reference_photo.os.replace", side_effect=OSError("disk unavailable")):
            with self.assertRaises(OSError):
                cache_reference_photo(self.directory, 26, self.encoded)
        self.assertEqual(target.read_bytes(), self.jpeg)
        self.assertEqual([entry.resolve() for entry in self.directory.iterdir()], [target])


if __name__ == "__main__":
    unittest.main()
