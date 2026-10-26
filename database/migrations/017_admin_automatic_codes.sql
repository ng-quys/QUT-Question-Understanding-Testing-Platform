-- Separate, non-cycling sequences reserve codes atomically, including across app instances.
-- Existing codes and login names are intentionally unchanged. Gaps are normal on rollback.
CREATE SEQUENCE IF NOT EXISTS public.admin_student_code_seq MAXVALUE 9999999 NO CYCLE;
CREATE SEQUENCE IF NOT EXISTS public.admin_teacher_code_seq MAXVALUE 9999999 NO CYCLE;
CREATE SEQUENCE IF NOT EXISTS public.admin_course_code_seq MAXVALUE 9999999 NO CYCLE;
CREATE SEQUENCE IF NOT EXISTS public.admin_exam_code_seq MAXVALUE 9999999 NO CYCLE;
CREATE SEQUENCE IF NOT EXISTS public.admin_class_code_seq MAXVALUE 9999999 NO CYCLE;
CREATE SEQUENCE IF NOT EXISTS public.admin_period_code_seq MAXVALUE 9999999 NO CYCLE;
