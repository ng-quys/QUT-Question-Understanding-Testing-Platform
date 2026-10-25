-- Photo intake and retrospective analysis are independent of answer submission.
CREATE TABLE IF NOT EXISTS offline_evidence_attempts (
  attempt_id BIGINT PRIMARY KEY REFERENCES exam_attempts(id) ON DELETE CASCADE,
  reference_photo BYTEA NOT NULL, intake_complete BOOLEAN NOT NULL DEFAULT FALSE,
  declared_count INTEGER NOT NULL DEFAULT 0, truncated BOOLEAN NOT NULL DEFAULT FALSE
);
CREATE TABLE IF NOT EXISTS offline_evidence_frames (
  attempt_id BIGINT NOT NULL REFERENCES offline_evidence_attempts(attempt_id) ON DELETE CASCADE,
  capture_uuid VARCHAR(36) NOT NULL, captured_at TIMESTAMP NOT NULL, received_at TIMESTAMP,
  sequence_number BIGINT NOT NULL, image_bytes INTEGER NOT NULL, image_hash VARCHAR(64) NOT NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'receiving', tries INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lease VARCHAR(36), lease_until TIMESTAMP, PRIMARY KEY(attempt_id,capture_uuid)
);
CREATE INDEX IF NOT EXISTS idx_offline_evidence_work ON offline_evidence_frames(status,next_attempt_at);

-- Browser API roles receive no direct access; the backend table owner / service role handles intake.
ALTER TABLE offline_evidence_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE offline_evidence_frames ENABLE ROW LEVEL SECURITY;
