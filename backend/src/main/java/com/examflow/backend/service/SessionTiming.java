package com.examflow.backend.service;

import com.examflow.backend.entity.ExamAttempt;
import com.examflow.backend.entity.ExamSession;
import java.time.Duration;
import java.time.LocalDateTime;

/** All candidates share the scheduled session deadline, including late arrivals. */
final class SessionTiming {
    private SessionTiming() {}

    static LocalDateTime deadline(ExamAttempt attempt) {
        return attempt.getExamSession().getEndTime();
    }

    static int durationMinutes(ExamSession session) {
        return Math.toIntExact(Duration.between(session.getStartTime(), session.getEndTime()).toMinutes());
    }
}
