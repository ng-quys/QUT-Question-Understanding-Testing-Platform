package com.examflow.backend.dto;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;

public record StudentAttemptDto(
        Long attemptId,
        Long sessionId,
        Long examId,
        String examCode,
        String examTitle,
        String courseCode,
        String courseName,
        Integer durationMinutes,
        BigDecimal totalPoints,
        LocalDateTime startedAt,
        LocalDateTime endTime,
        String status,
        List<ExamQuestionDto> questions
) {}
