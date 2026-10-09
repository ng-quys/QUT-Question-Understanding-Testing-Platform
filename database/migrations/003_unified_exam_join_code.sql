-- QUT: one public code for both exam identification and student participation.
-- Keep access_code for backward compatibility with the existing schema.
-- Student search/join/start APIs resolve and validate by exams.code.
UPDATE exam_sessions s
SET access_code = e.code
FROM exams e
WHERE e.id = s.exam_id;
