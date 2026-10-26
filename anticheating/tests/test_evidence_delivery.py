"""No camera, credentials, student photos or live Supabase required."""
import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import Mock, patch
from uuid import uuid4

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'app'))
import evidence_delivery as delivery


class EvidenceDeliveryTests(unittest.TestCase):
    def test_same_capture_uploads_once_for_distinct_events_and_uses_capture_key(self):
        del self.worker.upload
        capture=str(uuid4());self.payload['captureUuid']=capture
        self.worker.request=Mock(side_effect=[b'{"public":false}',b'{}'])
        self.assertEqual(('exam-evidence',f'attempt-125/{capture}.jpg'),self.worker.upload(self.payload))
        self.assertEqual(('exam-evidence',f'attempt-125/{capture}.jpg'),self.worker.upload({**self.payload,'eventUuid':str(uuid4())}))
        self.assertEqual(2,self.worker.request.call_count)

    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.addCleanup(patch.stopall)
        patch.object(delivery, 'ROOT', self.root).start()
        image = self.root / 'evidence' / 'attempt-125' / 'synthetic.jpg'
        image.parent.mkdir(parents=True)
        image.write_bytes(b'synthetic image for mocked HTTP')
        self.payload = dict(attemptId=125, eventUuid=str(uuid4()), event='NO_FACE',
                            evidenceStatus='pending', evidencePath=str(image))
        self.outbox = self.root / 'outbox'
        delivery.enqueue(self.payload, self.outbox)
        self.path = self.outbox / (self.payload['eventUuid'] + '.json')
        self.clock = 1000
        self.worker = delivery.EvidenceDelivery('https://backend.invalid/events', 'test-only',
            outbox=self.outbox, url='https://project.invalid', key='sb_secret_test_placeholder',
            bucket='exam-evidence', clock=lambda: self.clock)
        self.worker.callback_event = Mock()
        self.worker.upload = Mock(return_value=('exam-evidence', f"attempt-125/{self.payload['eventUuid']}.jpg"))

    def job(self):
        return json.loads(self.path.read_text(encoding='utf-8'))

    def test_success_announces_before_upload_and_keeps_local(self):
        self.worker.tick()
        self.assertEqual('upload', self.job()['stage'])
        self.worker.upload.assert_not_called()
        self.worker.tick()
        self.assertEqual('finalize', self.job()['stage'])
        self.assertEqual('uploaded', self.job()['payload']['evidenceStatus'])
        self.worker.tick()
        self.assertFalse(self.path.exists())
        self.assertTrue(Path(self.payload['evidencePath']).is_file())
        self.assertEqual(2, self.worker.callback_event.call_count)

    def test_storage_outage_is_bounded_and_warning_is_finalized(self):
        self.worker.tick()
        self.worker.upload.side_effect = delivery.DeliveryError('NETWORK_ERROR')
        for index in range(delivery.MAX_ATTEMPTS):
            self.worker.tick()
            self.clock += 40
        self.assertEqual(4, self.worker.upload.call_count)
        self.assertEqual('failed', self.job()['payload']['evidenceStatus'])
        self.worker.tick()
        self.assertEqual('dead', self.job()['stage'])
        self.assertEqual('failed', self.worker.callback_event.call_args.args[0]['evidenceStatus'])
        self.assertTrue(Path(self.payload['evidencePath']).exists())
        delivery.replay(self.payload['eventUuid'], self.outbox)
        self.assertEqual('pending', self.job()['payload']['evidenceStatus'])

    def test_backoff_does_not_block_or_retry_early(self):
        self.worker.tick()
        self.worker.upload.side_effect = delivery.DeliveryError('NETWORK_ERROR')
        self.worker.tick()
        self.assertEqual(1002, self.job()['next_at'])
        for _ in range(10):
            self.worker.tick()
        self.assertEqual(1, self.worker.upload.call_count)
        self.clock = 1002
        self.worker.tick()
        self.assertEqual(1006, self.job()['next_at'])

    def test_upload_success_db_failure_replay_never_reuploads(self):
        self.worker.tick()
        self.worker.tick()
        self.worker.callback_event.side_effect = delivery.DeliveryError('NETWORK_ERROR')
        for _ in range(4):
            self.worker.tick()
            self.clock += 40
        self.assertEqual('dead', self.job()['stage'])
        self.assertEqual('finalize', self.job()['resume_stage'])
        delivery.replay(self.payload['eventUuid'], self.outbox)
        self.worker.callback_event.side_effect = None
        self.worker.tick()
        self.assertFalse(self.path.exists())
        self.worker.upload.assert_called_once()

    def test_duplicate_enqueue_does_not_reset_delivery(self):
        self.worker.tick()
        delivery.enqueue(self.payload, self.outbox)
        self.assertEqual('upload', self.job()['stage'])
        self.assertEqual(1, len(list(self.outbox.glob('*.json'))))

    def test_new_service_resumes_persisted_job(self):
        self.worker.tick()
        restarted = delivery.EvidenceDelivery('', '', outbox=self.outbox)
        restarted.upload = self.worker.upload
        restarted.tick()
        self.assertEqual('finalize', self.job()['stage'])

    def test_admission_is_bounded_and_old_evidence_is_not_scanned(self):
        for _ in range(70):
            delivery.enqueue({**self.payload, 'eventUuid': str(uuid4())}, self.outbox)
        self.worker.tick()
        self.assertEqual(delivery.BATCH_SIZE, self.worker.callback_event.call_count)
        self.worker.upload.assert_not_called()

    def test_invalid_record_does_not_stop_worker(self):
        (self.outbox / 'bad.json').write_text('{broken')
        self.worker.tick()
        self.assertEqual('upload', self.job()['stage'])

    def test_http_upload_is_private_deterministic_and_new_secret_uses_apikey(self):
        del self.worker.upload  # Restore real method; HTTP itself remains mocked.
        requests = []
        def opener(request, timeout):
            requests.append(request)
            self.assertEqual(8, timeout)
            response = Mock()
            response.__enter__ = Mock(return_value=response)
            response.__exit__ = Mock(return_value=False)
            response.read.return_value = b'{"public":false}' if request.get_method() == 'GET' else b'{}'
            return response
        self.worker.opener = opener
        first = self.worker.upload(self.payload)
        self.assertEqual(first, self.worker.upload(self.payload))
        self.assertEqual('exam-evidence', first[0])
        self.assertEqual(f"attempt-125/{self.payload['eventUuid']}.jpg", first[1])
        self.assertEqual(requests[1].full_url, requests[3].full_url)
        self.assertEqual('true', requests[1].get_header('X-upsert'))
        self.assertIsNone(requests[1].get_header('Authorization'))

    def test_public_bucket_and_missing_local_image_are_rejected(self):
        del self.worker.upload
        self.worker.request = Mock(return_value=b'{"public":true}')
        with self.assertRaisesRegex(delivery.DeliveryError, 'BUCKET_MUST_BE_PRIVATE'):
            self.worker.upload(self.payload)
        self.worker.request.assert_called_once()
        Path(self.payload['evidencePath']).unlink()
        with self.assertRaisesRegex(delivery.DeliveryError, 'LOCAL_IMAGE_MISSING'):
            self.worker.upload(self.payload)

    def test_no_secret_is_nonfatal_and_failed_record_is_retained(self):
        del self.worker.upload
        self.worker.key = ''
        for _ in range(3):
            self.worker.tick()
        self.assertEqual('dead', self.job()['stage'])
        self.assertEqual('STORAGE_NOT_CONFIGURED', self.job()['payload']['evidenceError'])

    def test_http_errors_are_sanitized_and_redirects_not_followed(self):
        import urllib.error
        import urllib.request
        self.worker.opener = Mock(side_effect=urllib.error.HTTPError('https://private.invalid?token=secret', 503, 'private', {}, None))
        with self.assertRaisesRegex(delivery.DeliveryError, '^HTTP_503$'):
            self.worker.request(urllib.request.Request('https://project.invalid'))
        self.assertIsNone(delivery.NoRedirect().redirect_request(None, None, 302, '', {}, 'https://evil.invalid'))


if __name__ == '__main__':
    unittest.main()
