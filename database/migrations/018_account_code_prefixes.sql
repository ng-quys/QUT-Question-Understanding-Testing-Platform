-- Ten-digit usernames: six-digit role prefix plus four-digit sequence.
-- Preserve existing usernames and old sequences. Never recycle an issued code.
CREATE SEQUENCE IF NOT EXISTS public.admin_student_account_v2_code_seq MAXVALUE 9999 NO CYCLE;
CREATE SEQUENCE IF NOT EXISTS public.admin_teacher_account_v2_code_seq MAXVALUE 9999 NO CYCLE;
