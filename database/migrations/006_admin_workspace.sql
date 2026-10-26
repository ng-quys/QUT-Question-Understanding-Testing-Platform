-- Administrative review metadata; this never changes a student's score.
CREATE TABLE IF NOT EXISTS attempt_reviews (
    attempt_id BIGINT PRIMARY KEY REFERENCES exam_attempts(id) ON DELETE CASCADE,
    outcome VARCHAR(30) NOT NULL DEFAULT 'unreviewed',
    note TEXT NOT NULL DEFAULT '',
    reviewer_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
    revision BIGINT NOT NULL DEFAULT 1,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
