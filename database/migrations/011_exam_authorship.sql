-- Exact authorship: do not infer existing authors from course ownership.
BEGIN;
ALTER TABLE public.exams ADD COLUMN IF NOT EXISTS created_by BIGINT REFERENCES public.users(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_exams_created_by ON public.exams(created_by);
COMMIT;
