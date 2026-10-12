-- Optional: backend creates this table automatically on first use.
-- Admin policy is independent of teacher configuration; default enabled for old and new exams.
CREATE TABLE IF NOT EXISTS exam_ai_policies (
    exam_id BIGINT PRIMARY KEY REFERENCES exams(id) ON DELETE CASCADE,
    enabled BOOLEAN NOT NULL DEFAULT TRUE
);
