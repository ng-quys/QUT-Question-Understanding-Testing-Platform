-- Per-session override; NULL retains the existing exam policy.
BEGIN;
ALTER TABLE public.exam_sessions ADD COLUMN IF NOT EXISTS ai_enabled BOOLEAN;
ALTER TABLE public.exam_sitting_groups ADD COLUMN IF NOT EXISTS ai_enabled BOOLEAN;
COMMIT;
