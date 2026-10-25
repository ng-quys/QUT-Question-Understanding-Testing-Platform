-- Group only events from the same explicit camera capture. Legacy rows stay separate.
ALTER TABLE anti_cheat_events ADD COLUMN IF NOT EXISTS capture_uuid VARCHAR(36);
CREATE INDEX IF NOT EXISTS idx_anti_cheat_capture ON anti_cheat_events(attempt_id,capture_uuid);
