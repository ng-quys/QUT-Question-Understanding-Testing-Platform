-- Additive migration. Run before starting the updated backend (ddl-auto=validate).
-- Existing local photos remain readable; this does not upload any personal images.
BEGIN;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS photo_bucket VARCHAR(255);
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS photo_key VARCHAR(255);
COMMENT ON COLUMN public.users.photo_bucket IS 'Private Supabase bucket for the student profile photo; null means legacy local photo';
COMMENT ON COLUMN public.users.photo_key IS 'Object key only. Never a signed URL, Base64 image or local path';
COMMIT;
