"""Opt-in live test: one synthetic JPEG in student-photos, no student/DB writes.
Deletes only the uniquely named synthetic object it creates. Never prints secrets.
"""
import io
import json
import sys
import urllib.parse
import urllib.request
from pathlib import Path
from uuid import uuid4

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "anticheating/app"))
from env_config import load_env_file
from evidence_delivery import EvidenceDelivery, DeliveryError


def main():
    import os
    from PIL import Image
    load_env_file(ROOT / ".env.storage")
    bucket = os.environ.get("SUPABASE_STUDENT_PHOTOS_BUCKET", "student-photos")
    worker = EvidenceDelivery("", "", bucket=bucket)
    if not worker.url or not worker.key:
        print("Not run: configure Supabase URL/server key locally in .env.storage.")
        return 2
    parsed = urllib.parse.urlsplit(worker.url)
    if parsed.scheme != "https" or not parsed.hostname or parsed.path not in ("", "/") or parsed.query or parsed.fragment or parsed.username:
        raise ValueError("Invalid Storage URL")
    if not bucket or any(c not in "abcdefghijklmnopqrstuvwxyz0123456789-_" for c in bucket):
        raise ValueError("Invalid bucket")
    headers = {"apikey": worker.key, "Content-Type": "application/json"}
    if worker.key.count(".") == 2:
        headers["Authorization"] = "Bearer " + worker.key

    def request(path, method="GET", body=None, content_type="application/json", authenticated=True):
        request_headers = dict(headers, **{"Content-Type": content_type}) if authenticated else {}
        return worker.request(urllib.request.Request(worker.url + path, headers=request_headers, data=body, method=method))

    info = json.loads(request("/storage/v1/bucket/" + bucket))
    if info.get("public") is not False:
        print("FAIL: student photo bucket must be PRIVATE; no image uploaded.")
        return 1
    key = "student-0/" + str(uuid4()) + ".jpg"
    output = io.BytesIO()
    Image.new("RGB", (32, 32), (220, 230, 240)).save(output, format="JPEG")
    jpeg = output.getvalue()
    try:
        request("/storage/v1/object/" + bucket + "/" + key, "POST", jpeg, "image/jpeg")
        actual = request("/storage/v1/object/authenticated/" + bucket + "/" + key)
        if actual != jpeg:
            raise ValueError("Downloaded bytes differ")
        try:
            request("/storage/v1/object/public/" + bucket + "/" + key, authenticated=False)
        except DeliveryError as error:
            if error.code not in ("HTTP_400", "HTTP_401", "HTTP_403", "HTTP_404"):
                raise
        else:
            raise ValueError("Anonymous read must be rejected")
        print("PASS: private student-photos bucket, JPEG upload, authenticated download, anonymous read rejected.")
    finally:
        try:
            request("/storage/v1/object/" + bucket, "DELETE", json.dumps({"prefixes": [key]}).encode())
            print("Synthetic test object cleaned up; no personal images changed.")
        except DeliveryError as error:
            print("Cleanup pending (" + error.code + "): " + bucket + "/" + key)
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except DeliveryError as error:
        print("Storage test failed: " + error.code + ". Check local config, bucket and network.")
        sys.exit(1)
    except Exception:
        print("Storage test failed; check local configuration/dependencies. No secrets displayed.")
        sys.exit(1)
