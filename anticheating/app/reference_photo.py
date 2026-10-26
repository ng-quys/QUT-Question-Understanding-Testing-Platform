"""Receive the backend's reference JPEG over the authenticated internal API.

Base64 is transport only, never stored in the database or logs. No arbitrary URL
is fetched and the destination is derived only from the numeric student ID.
"""
import base64
import binascii
import os
from pathlib import Path
import tempfile

MAX_PHOTO_BYTES = 5 * 1024 * 1024


def cache_reference_photo(profile_dir, student_id, encoded):
    if not isinstance(student_id, int) or isinstance(student_id, bool) or student_id <= 0:
        raise ValueError("ID sinh viên không hợp lệ")
    if not isinstance(encoded, str) or not encoded or len(encoded) > ((MAX_PHOTO_BYTES + 2) // 3) * 4:
        raise ValueError("Ảnh tham chiếu thiếu hoặc vượt giới hạn 5MB")
    try:
        photo = base64.b64decode(encoded, validate=True)
    except (ValueError, binascii.Error):
        raise ValueError("Ảnh tham chiếu không hợp lệ") from None
    if len(photo) > MAX_PHOTO_BYTES or not photo.startswith(b"\xff\xd8\xff") or not photo.endswith(b"\xff\xd9"):
        raise ValueError("Ảnh tham chiếu phải là JPEG hợp lệ")
    directory = Path(profile_dir).resolve()
    directory.mkdir(parents=True, exist_ok=True)
    target = directory / f"{student_id}.jpg"
    temporary = None
    try:
        with tempfile.NamedTemporaryFile(dir=directory, suffix=".tmp", delete=False) as output:
            temporary = Path(output.name)
            output.write(photo)
            output.flush()
            os.fsync(output.fileno())
        os.replace(temporary, target)
    finally:
        if temporary is not None:
            temporary.unlink(missing_ok=True)
    return target
