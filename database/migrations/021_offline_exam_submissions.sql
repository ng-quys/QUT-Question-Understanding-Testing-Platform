-- Deferred submissions have their own attempt-bound, one-use permission.
-- Normal answer/submit endpoints keep their existing deadline rules.
CREATE TABLE IF NOT EXISTS offline_exam_submissions (
    attempt_id BIGINT PRIMARY KEY REFERENCES exam_attempts(id) ON DELETE CASCADE,
    token UUID NOT NULL,
    deadline TIMESTAMP NOT NULL,
    issued_at TIMESTAMP NOT NULL,
    received_at TIMESTAMP,
    frozen_at_client TIMESTAMP,
    offline_since_client TIMESTAMP,
    submission_id UUID,
    snapshot_hash VARCHAR(64),
    late BOOLEAN NOT NULL DEFAULT FALSE
);

ALTER TABLE offline_exam_submissions ENABLE ROW LEVEL SECURITY;
