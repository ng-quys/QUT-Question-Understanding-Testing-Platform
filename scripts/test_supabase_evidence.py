"""Optional live Storage smoke test: generates ONE synthetic JPEG, no DB writes.

Reads server credentials locally; never prints keys or signed URLs. Leaves the
synthetic attempt-0 object for inspection; remove that one object manually later.
"""
import json
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path
from uuid import uuid4

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'anticheating/app'))
from env_config import load_env_file
from evidence_delivery import EvidenceDelivery, DeliveryError


def main():
    load_env_file(ROOT / '.env.storage')
    worker = EvidenceDelivery('', '')
    if not worker.url or not worker.key:
        print('Not run: configure SUPABASE_URL and server key in local .env.storage first.')
        return 2
    import cv2
    import numpy as np
    identifier = str(uuid4())
    path = ROOT / 'anticheating/evidence/attempt-0' / (identifier + '.jpg')
    pixels = np.full((240, 480, 3), 235, dtype=np.uint8)
    cv2.putText(pixels, 'SYNTHETIC STORAGE TEST', (25, 115), cv2.FONT_HERSHEY_SIMPLEX, .8, (45, 70, 95), 2)
    ok, encoded = cv2.imencode('.jpg', pixels)
    if not ok:
        raise ValueError('Synthetic image encoding failed')
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(encoded.tobytes())
    bucket, key = worker.upload(dict(attemptId=0, eventUuid=identifier, evidencePath=str(path)))
    headers = {'apikey': worker.key, 'Content-Type': 'application/json'}
    if worker.key.count('.') == 2:
        headers['Authorization'] = 'Bearer ' + worker.key
    route = worker.url + '/storage/v1/object/sign/' + urllib.parse.quote(bucket, safe='') + '/' + key
    body = worker.request(urllib.request.Request(route, data=b'{"expiresIn":3}', headers=headers, method='POST'))
    relative = json.loads(body)['signedURL']
    if not relative.startswith('/object/sign/'):
        raise ValueError('Unexpected signed URL')
    url = worker.url + '/storage/v1' + relative
    worker.request(urllib.request.Request(url))
    time.sleep(5)
    try:
        worker.request(urllib.request.Request(url))
        raise ValueError('Expected expired signed URL to be rejected')
    except DeliveryError as error:
        if error.code not in ('HTTP_400', 'HTTP_401', 'HTTP_403'):
            raise
    print('PASS: private bucket, synthetic JPEG upload, signed image download, expired URL rejected.')
    print('Synthetic test object (no personal data): ' + bucket + '/' + key)
    return 0


if __name__ == '__main__':
    try:
        sys.exit(main())
    except DeliveryError as error:
        print('Storage test failed: ' + error.code)
        sys.exit(1)
    except Exception:
        print('Storage test failed: check local configuration, Python dependencies and network. No secrets displayed.')
        sys.exit(1)
