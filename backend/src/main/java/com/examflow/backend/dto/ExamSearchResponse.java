package com.examflow.backend.dto;

import java.math.BigDecimal;
import java.time.LocalDateTime;

public record ExamSearchResponse(
        Long sessionId,
        Long examId,
        String examCode,
        String examTitle,
        String courseCode,
        String courseName,
        String sessionName,
        String roomCode,
        LocalDateTime startTime,
        LocalDateTime endTime,
        String sessionStatus,
        Integer durationMinutes,
        Integer totalQuestions,
        BigDecimal totalPoints,
        boolean alreadyAttempted,
        String attemptStatus,
        boolean canEnter,
        String message
) {}
