-- Runtime Anti-Cheating integration.
-- Safe to run repeatedly.
CREATE TABLE IF NOT EXISTS anti_cheat_events (
    id BIGSERIAL PRIMARY KEY,
    attempt_id BIGINT NOT NULL REFERENCES exam_attempts(id) ON DELETE CASCADE,
    event VARCHAR(80) NOT NULL,
    module VARCHAR(20) NOT NULL DEFAULT 'M7',
    active BOOLEAN NOT NULL DEFAULT TRUE,
    occurred_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    duration_seconds DOUBLE PRECISION DEFAULT 0,
    risk_score INTEGER DEFAULT 0,
    risk_level VARCHAR(20) DEFAULT 'LOW',
    source_module VARCHAR(100),
    evidence_path TEXT
);
ALTER TABLE anti_cheat_events ADD COLUMN IF NOT EXISTS module VARCHAR(20) NOT NULL DEFAULT 'M7';
ALTER TABLE anti_cheat_events ADD COLUMN IF NOT EXISTS duration_seconds DOUBLE PRECISION DEFAULT 0;
ALTER TABLE anti_cheat_events ADD COLUMN IF NOT EXISTS risk_score INTEGER DEFAULT 0;
ALTER TABLE anti_cheat_events ADD COLUMN IF NOT EXISTS risk_level VARCHAR(20) DEFAULT 'LOW';
ALTER TABLE anti_cheat_events ADD COLUMN IF NOT EXISTS source_module VARCHAR(100);
ALTER TABLE anti_cheat_events ADD COLUMN IF NOT EXISTS evidence_path TEXT;
CREATE INDEX IF NOT EXISTS idx_anti_cheat_events_attempt_time ON anti_cheat_events(attempt_id, occurred_at);
