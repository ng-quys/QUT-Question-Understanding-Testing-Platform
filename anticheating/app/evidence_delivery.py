"""Durable delivery of NEW evidence only. Runs in the persistent HTTP service.

The pipeline only writes outbox records. One worker admits at most 64 records per
pass, uses bounded timeouts/retries, and never scans historic evidence for upload.
"""
import json
import os
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from uuid import UUID

ROOT = Path(__file__).resolve().parents[1]
OUTBOX = ROOT / "runtime" / "evidence-outbox"
MAX_ATTEMPTS = 4
BATCH_SIZE = 64


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None  # Never forward a server key or callback secret to another host.


def atomic_json(path, data):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(".tmp")
    temporary.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
    for attempt in range(5):
        try:
            temporary.replace(path)
            return
        except PermissionError:
            if attempt == 4:
                raise
            time.sleep(0.01 * (2 ** attempt))


def enqueue(payload, outbox=None):
    identifier = str(UUID(payload["eventUuid"]))
    target = Path(outbox or OUTBOX) / (identifier + ".json")
    if target.exists():
        return  # A repeated notification must not reset an in-flight delivery.
    # A fresh UUID is generated once by EvidenceLogger; retries reuse this file.
    atomic_json(target, {"payload": payload, "stage": "announce", "attempts": 0, "next_at": 0})


class DeliveryError(Exception):
    def __init__(self, code, retryable=True):
        super().__init__(code)  # Never include response bodies, credentials or URLs.
        self.code, self.retryable = code, retryable


class EvidenceDelivery:
    def __init__(self, callback, secret, outbox=None, url=None, key=None, bucket=None, opener=None, clock=None):
        self.callback, self.secret = callback, secret
        self.outbox = Path(outbox or OUTBOX)
        self.url = (url if url is not None else os.environ.get("SUPABASE_URL", "")).rstrip("/")
        self.key = key if key is not None else (os.environ.get("SUPABASE_SECRET_KEY") or os.environ.get("SUPABASE_SERVICE_ROLE_KEY", ""))
        self.bucket = bucket if bucket is not None else os.environ.get("SUPABASE_STORAGE_BUCKET", "exam-evidence")
        self.opener = opener or urllib.request.build_opener(NoRedirect()).open
        self.clock = clock or time.time
        self.stop_event = threading.Event()

    def request(self, request):
        try:
            with self.opener(request, timeout=8) as response:
                return response.read(1024 * 1024)
        except urllib.error.HTTPError as error:
            raise DeliveryError("HTTP_" + str(error.code), error.code in (408, 409, 429) or error.code >= 500) from None
        except (OSError, TimeoutError):
            raise DeliveryError("NETWORK_ERROR") from None

    def callback_event(self, payload):
        self.request(urllib.request.Request(self.callback, data=json.dumps(payload).encode("utf-8"),
                     headers={"Content-Type": "application/json", "X-AntiCheat-Secret": self.secret}, method="POST"))

    def upload(self, payload):
        parsed = urllib.parse.urlsplit(self.url)
        if parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password or parsed.query or parsed.fragment or parsed.path not in ("", "/") or not self.key:
            raise DeliveryError("STORAGE_NOT_CONFIGURED", False)
        if not self.bucket or any(c not in "abcdefghijklmnopqrstuvwxyz0123456789-_" for c in self.bucket):
            raise DeliveryError("INVALID_BUCKET", False)
        # Only a generated key and the new local evidence image can be uploaded.
        key = f"attempt-{int(payload['attemptId'])}/{UUID(payload['eventUuid'])}.jpg"
        path = Path(payload["evidencePath"]).resolve()
        expected_root = (ROOT / "evidence" / f"attempt-{int(payload['attemptId'])}").resolve()
        if not path.is_relative_to(expected_root) or not path.is_file() or path.suffix.lower() != ".jpg":
            raise DeliveryError("LOCAL_IMAGE_MISSING", False)
        size = path.stat().st_size
        if not 0 < size <= 5 * 1024 * 1024:
            raise DeliveryError("IMAGE_SIZE_INVALID", False)
        headers = {"apikey": self.key, "Content-Type": "image/jpeg", "x-upsert": "true", "Cache-Control": "private, max-age=0"}
        if self.key.count(".") == 2:  # Legacy service_role JWT; sb_secret uses apikey only.
            headers["Authorization"] = "Bearer " + self.key
        endpoint = self.url + "/storage/v1/object/" + urllib.parse.quote(self.bucket, safe="") + "/" + urllib.parse.quote(key, safe="/")
        # Fail closed if the bucket was accidentally made public. Never change it.
        bucket_info = self.request(urllib.request.Request(self.url + "/storage/v1/bucket/" + urllib.parse.quote(self.bucket, safe=""), headers=headers))
        try:
            if json.loads(bucket_info).get("public") is not False:
                raise DeliveryError("BUCKET_MUST_BE_PRIVATE", False)
        except (ValueError, AttributeError):
            raise DeliveryError("INVALID_BUCKET_RESPONSE", False) from None
        self.request(urllib.request.Request(endpoint, data=path.read_bytes(), headers=headers, method="POST"))
        return self.bucket, key

    def process(self, path):
        job = json.loads(path.read_text(encoding="utf-8"))
        if job.get("stage") == "dead" or job.get("next_at", 0) > self.clock():
            return
        payload = job["payload"]
        try:
            if job["stage"] == "announce":
                self.callback_event(payload)
                job.update(stage="upload" if payload.get("evidenceStatus") == "pending" else "complete", attempts=0)
            elif job["stage"] == "upload":
                bucket, key = self.upload(payload)
                payload.update(evidenceStatus="uploaded", evidenceBucket=bucket, evidenceKey=key, evidenceError=None)
                # Persist BEFORE callback so a DB outage cannot lose the object key.
                job.update(stage="finalize", attempts=0)
            elif job["stage"] == "finalize":
                self.callback_event(payload)
                if payload.get("evidenceStatus") == "failed":
                    job.update(stage="dead", resume_stage="announce", attempts=0)
                else:
                    job.update(stage="complete", attempts=0)
            if job["stage"] == "complete":
                path.unlink()
            else:
                atomic_json(path, job)
        except DeliveryError as error:
            job["attempts"] += 1
            job["next_at"] = self.clock() + min(30, 2 ** job["attempts"])
            job["last_error"] = error.code
            if not error.retryable or job["attempts"] >= MAX_ATTEMPTS:
                if job["stage"] == "upload":
                    payload.update(evidenceStatus="failed", evidenceError=error.code)
                    job.update(stage="finalize", attempts=0, next_at=0)
                else:
                    job["resume_stage"] = job["stage"]
                    job["stage"] = "dead"  # Kept on disk for explicit replay.
            atomic_json(path, job)

    def tick(self):
        self.outbox.mkdir(parents=True, exist_ok=True)
        admitted = 0
        with os.scandir(self.outbox) as entries:
            for item in entries:
                if self.stop_event.is_set() or admitted >= BATCH_SIZE:
                    break
                if not item.name.endswith(".json") or not item.is_file():
                    continue
                try:
                    path = Path(item.path)
                    job = json.loads(path.read_text(encoding="utf-8"))
                    if job.get("stage") == "dead" or job.get("next_at", 0) > self.clock():
                        continue
                    admitted += 1
                    self.process(path)
                except (OSError, ValueError, KeyError, TypeError):
                    # A disk/record failure must never stop the HTTP service or AI.
                    print("Evidence delivery: local record unavailable; retained for inspection", flush=True)

    def run(self):
        while not self.stop_event.is_set():
            try:
                self.tick()
            except OSError:
                print("Evidence delivery: local outbox unavailable", flush=True)
            self.stop_event.wait(1)

    def start(self):
        thread = threading.Thread(target=self.run, name="evidence-delivery", daemon=True)
        thread.start()
        return thread


def replay(identifier, outbox=None):
    """Explicitly retry ONE new event; never scan/upload old evidence folders."""
    path = Path(outbox or OUTBOX) / (str(UUID(identifier)) + ".json")
    job = json.loads(path.read_text(encoding="utf-8"))
    if job.get("stage") != "dead":
        raise ValueError("Delivery is not stopped; let the worker finish first")
    payload = job["payload"]
    stage = job.get("resume_stage", "announce")
    if payload.get("evidenceStatus") == "failed" and payload.get("evidencePath"):
        payload.update(evidenceStatus="pending", evidenceError=None)
        stage = "announce"
    job.update(stage=stage, attempts=0, next_at=0)
    atomic_json(path, job)


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="Retry one stopped evidence event (no historic bulk uploads)")
    parser.add_argument("--retry", required=True, metavar="EVENT_UUID")
    args = parser.parse_args()
    try:
        replay(args.retry)
        print("Evidence event queued for retry; start/restart the AI HTTP service if needed.")
    except (ValueError, OSError, KeyError):
        parser.exit(1, "Cannot retry: check UUID, retained outbox record and delivery stage.\n")
