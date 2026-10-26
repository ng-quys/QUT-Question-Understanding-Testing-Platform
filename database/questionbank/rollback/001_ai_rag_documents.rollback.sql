-- TARGET: ExamFlow Question Bank database only.
-- Safe rollback refuses to remove populated tables unless an explicit session
-- flag is set after backups and object-storage cleanup have been reviewed.

BEGIN;

DO $$
DECLARE row_count bigint;
DECLARE allow_drop boolean := coalesce(current_setting('examflow.allow_ai_document_drop',true),'off')='on';
BEGIN
    IF to_regclass('public.ai_source_documents') IS NULL
       AND to_regclass('public.ai_document_indexes') IS NULL
       AND to_regclass('public.ai_document_chunks') IS NULL THEN
        RETURN;
    END IF;
    SELECT
        coalesce((SELECT count(*) FROM public.ai_source_documents),0)
      + coalesce((SELECT count(*) FROM public.ai_document_indexes),0)
      + coalesce((SELECT count(*) FROM public.ai_document_chunks),0)
    INTO row_count;
    IF row_count > 0 AND NOT allow_drop THEN
        RAISE EXCEPTION
          'Rollback refused: % AI document rows exist. Back up data and SET SESSION examflow.allow_ai_document_drop=on explicitly.',
          row_count;
    END IF;
END $$;

DROP TABLE IF EXISTS public.ai_document_chunks;
DROP TABLE IF EXISTS public.ai_document_indexes;
DROP TABLE IF EXISTS public.ai_source_documents;
DROP FUNCTION IF EXISTS public.examflow_guard_ai_document_chunk();
DROP FUNCTION IF EXISTS public.examflow_guard_ai_document_index();
DROP FUNCTION IF EXISTS public.examflow_guard_ai_document_identity();

COMMIT;

