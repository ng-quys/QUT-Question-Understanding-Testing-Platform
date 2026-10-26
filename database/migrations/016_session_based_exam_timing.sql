-- Deploy the session-based timing backend/frontend together with this migration.
-- Exam content no longer owns a time limit; existing session start/end times stay intact.
-- Save a backup of exams(id, duration_minutes) before applying to a populated database.
BEGIN;
SET LOCAL lock_timeout = '5s';
-- Rebuild the legacy report without a paper-level time limit. Preserve its owner,
-- grants, options and comment; DROP without CASCADE protects unknown dependants.
DO $timing$
DECLARE
    report_oid oid := to_regclass('public.vw_exam_summary');
    report_owner text;
    report_options text[];
    report_comment text;
    report_grants text[];
    grant_statement text;
BEGIN
    IF report_oid IS NOT NULL THEN
        SELECT pg_get_userbyid(relowner), reloptions, obj_description(oid, 'pg_class')
          INTO report_owner, report_options, report_comment
          FROM pg_class WHERE oid = report_oid;
        SELECT array_agg(format('GRANT %s ON TABLE public.vw_exam_summary TO %s%s',
                   privilege_type, CASE WHEN grantee = 0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(grantee)) END,
                   CASE WHEN is_grantable THEN ' WITH GRANT OPTION' ELSE '' END))
          INTO report_grants FROM pg_class c,
               LATERAL aclexplode(COALESCE(c.relacl, acldefault('r', c.relowner)))
         WHERE c.oid = report_oid;
        DROP VIEW public.vw_exam_summary;
        CREATE VIEW public.vw_exam_summary AS
          SELECT e.id, e.code, e.title, c.code AS course_code, c.name AS course_name,
                 e.status, e.exam_date, count(DISTINCT a.id) AS submission_count,
                 round(avg(a.score), 2) AS avg_score, min(a.score) AS min_score, max(a.score) AS max_score
            FROM public.exams e JOIN public.courses c ON c.id = e.course_id
            LEFT JOIN public.exam_attempts a ON a.exam_id = e.id AND a.status::text = 'completed'
           GROUP BY e.id, e.code, e.title, c.code, c.name, e.status, e.exam_date;
        IF report_options IS NOT NULL THEN
            EXECUTE 'ALTER VIEW public.vw_exam_summary SET (' || array_to_string(report_options, ',') || ')';
        END IF;
        EXECUTE format('COMMENT ON VIEW public.vw_exam_summary IS %L', report_comment);
        FOREACH grant_statement IN ARRAY COALESCE(report_grants, ARRAY[]::text[]) LOOP
            EXECUTE grant_statement;
        END LOOP;
        EXECUTE format('ALTER VIEW public.vw_exam_summary OWNER TO %I', report_owner);
    END IF;
END
$timing$;
ALTER TABLE public.exams DROP COLUMN IF EXISTS duration_minutes;
COMMIT;
