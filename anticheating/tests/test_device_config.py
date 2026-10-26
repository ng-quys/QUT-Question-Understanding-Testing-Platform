import sys
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'app'))
from device_config import camera_index, audio_input_device, read_reference_image


class DeviceConfigTests(unittest.TestCase):
    def test_default_devices(self):
        with patch.dict('os.environ', {}, clear=True):
            self.assertEqual(camera_index(), 0)
            self.assertIsNone(audio_input_device())

    def test_selected_devices(self):
        with patch.dict('os.environ', {'ANTICHEAT_CAMERA_INDEX': '2', 'ANTICHEAT_AUDIO_INPUT_DEVICE': '3'}):
            self.assertEqual(camera_index(), 2)
            self.assertEqual(audio_input_device(), 3)

    def test_microphone_name(self):
        with patch.dict('os.environ', {'ANTICHEAT_AUDIO_INPUT_DEVICE': 'USB Microphone'}):
            self.assertEqual(audio_input_device(), 'USB Microphone')

    def test_invalid_camera_index_has_actionable_error(self):
        for value in ('-1', 'webcam', ''):
            with patch.dict('os.environ', {'ANTICHEAT_CAMERA_INDEX': value}):
                with self.assertRaisesRegex(ValueError, 'ANTICHEAT_CAMERA_INDEX'):
                    camera_index()

    def test_unicode_path_is_read_as_bytes_for_decoder(self):
        with tempfile.TemporaryDirectory() as directory:
            photo = Path(directory) / 'Hồ sơ sinh viên' / '26.jpg'
            photo.parent.mkdir()
            photo.write_bytes(b'encoded-photo-data')
            image = object()
            decoder = Mock(return_value=image)
            buffer = Mock(side_effect=lambda data, dtype: data)
            with patch.dict(sys.modules, {'cv2': SimpleNamespace(imdecode=decoder, IMREAD_COLOR=1),
                                          'numpy': SimpleNamespace(frombuffer=buffer, uint8='uint8')}):
                self.assertIs(read_reference_image(photo), image)
            decoder.assert_called_once_with(b'encoded-photo-data', 1)

    def test_missing_photo(self):
        with patch.dict(sys.modules, {'cv2': SimpleNamespace(), 'numpy': SimpleNamespace()}):
            with self.assertRaisesRegex(RuntimeError, 'Không đọc được ảnh'):
                read_reference_image(Path(tempfile.gettempdir()) / 'qut-nonexistent-photo' / '26.jpg')

    def test_empty_photo(self):
        with tempfile.TemporaryDirectory() as directory:
            photo = Path(directory) / '26.jpg'
            photo.touch()
            with patch.dict(sys.modules, {'cv2': SimpleNamespace(), 'numpy': SimpleNamespace()}):
                with self.assertRaisesRegex(RuntimeError, 'rỗng'):
                    read_reference_image(photo)

    def test_invalid_photo(self):
        with tempfile.TemporaryDirectory() as directory:
            photo = Path(directory) / '26.jpg'
            photo.write_bytes(b'invalid-image')
            with patch.dict(sys.modules, {'cv2': SimpleNamespace(imdecode=lambda *args: None, IMREAD_COLOR=1),
                                          'numpy': SimpleNamespace(frombuffer=lambda *args, **kwargs: b'', uint8='uint8')}):
                with self.assertRaisesRegex(RuntimeError, 'không hợp lệ'):
                    read_reference_image(photo)


if __name__ == '__main__':
    unittest.main()
