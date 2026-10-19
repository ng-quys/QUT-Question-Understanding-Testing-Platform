BEGIN;
-- NULL means unpublished, including ALL existing sessions. No legacy auto-publication.
ALTER TABLE public.exam_sessions ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ;
ALTER TABLE public.exam_sessions ADD COLUMN IF NOT EXISTS published_by BIGINT REFERENCES public.users(id) ON DELETE SET NULL;
CREATE TABLE IF NOT EXISTS public.exam_room_teachers (
 room_id BIGINT NOT NULL REFERENCES public.exam_rooms(id) ON DELETE CASCADE,
 teacher_id BIGINT NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
 assigned_by BIGINT REFERENCES public.users(id) ON DELETE SET NULL,
 assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), PRIMARY KEY(room_id,teacher_id)
);
CREATE INDEX IF NOT EXISTS idx_exam_room_teachers_teacher ON public.exam_room_teachers(teacher_id);
CREATE INDEX IF NOT EXISTS idx_exam_sessions_published_window ON public.exam_sessions(start_time,end_time) WHERE published_at IS NOT NULL;
ALTER TABLE public.exam_room_teachers ENABLE ROW LEVEL SECURITY;
-- Explicit uniqueness is already present in the exported schema; no rows are deleted.
CREATE UNIQUE INDEX IF NOT EXISTS exam_session_students_exam_session_id_student_id_key ON public.exam_session_students(exam_session_id,student_id);
CREATE UNIQUE INDEX IF NOT EXISTS exam_attempts_exam_session_id_student_id_key ON public.exam_attempts(exam_session_id,student_id);
COMMIT;
