package com.examflow.backend.dto;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;

public record QuestionResponse(
        Long id, Long courseId, Long chapterId, Long topicId, Long cloId,
        String bloom, String difficulty, String content, String explanation,
        String status, String source, BigDecimal defaultScore, Instant createdAt, Instant updatedAt,
        List<AnswerResponse> answers
) {
    public record AnswerResponse(Long id, String label, String content, boolean correct, int position) {}
}
