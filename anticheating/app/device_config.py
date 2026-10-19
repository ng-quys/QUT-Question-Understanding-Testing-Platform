"""Local device selection and Unicode-safe reference photo loading."""
import os
from pathlib import Path


def camera_index():
    value = os.environ.get('ANTICHEAT_CAMERA_INDEX', '0').strip()
    try:
        index = int(value)
    except ValueError as exc:
        raise ValueError('ANTICHEAT_CAMERA_INDEX phải là số nguyên từ 0') from exc
    if index < 0:
        raise ValueError('ANTICHEAT_CAMERA_INDEX phải là số nguyên từ 0')
    return index


def audio_input_device():
    value = os.environ.get('ANTICHEAT_AUDIO_INPUT_DEVICE', '').strip()
    if not value:
        return None  # Use the operating system's default input device.
    try:
        return int(value)
    except ValueError:
        return value  # SoundDevice also accepts a device name.


def read_reference_image(path):
    import cv2
    import numpy as np
    try:
        encoded = Path(path).read_bytes()
    except OSError as exc:
        raise RuntimeError('Không đọc được ảnh hồ sơ. Hãy tải lại ảnh trong Hồ sơ.') from exc
    if not encoded:
        raise RuntimeError('Ảnh hồ sơ rỗng. Hãy tải lại ảnh trong Hồ sơ.')
    # Reading bytes through pathlib avoids OpenCV's filename handling on Windows.
    image = cv2.imdecode(np.frombuffer(encoded, dtype=np.uint8), cv2.IMREAD_COLOR)
    if image is None:
        raise RuntimeError('Ảnh hồ sơ không hợp lệ. Hãy tải lại ảnh JPG hoặc PNG.')
    return image
