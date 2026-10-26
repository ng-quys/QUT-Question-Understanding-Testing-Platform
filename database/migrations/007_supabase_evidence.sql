-- Additive migration. Historic local paths are kept; no images are uploaded.
ALTER TABLE anti_cheat_events ADD COLUMN IF NOT EXISTS event_uuid VARCHAR(36);
ALTER TABLE anti_cheat_events ADD COLUMN IF NOT EXISTS evidence_provider VARCHAR(16) NOT NULL DEFAULT 'local';
ALTER TABLE anti_cheat_events ADD COLUMN IF NOT EXISTS evidence_bucket TEXT;
ALTER TABLE anti_cheat_events ADD COLUMN IF NOT EXISTS evidence_key TEXT;
ALTER TABLE anti_cheat_events ADD COLUMN IF NOT EXISTS evidence_status VARCHAR(16) NOT NULL DEFAULT 'none';
ALTER TABLE anti_cheat_events ADD COLUMN IF NOT EXISTS evidence_error VARCHAR(80);
CREATE UNIQUE INDEX IF NOT EXISTS idx_anti_cheat_event_uuid ON anti_cheat_events(attempt_id,event_uuid);
