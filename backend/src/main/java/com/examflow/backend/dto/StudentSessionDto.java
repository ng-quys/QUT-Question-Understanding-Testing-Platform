package com.examflow.backend.dto;

import java.math.BigDecimal;
import java.time.LocalDateTime;

public record StudentSessionDto(
        Long sessionId,
        Long examId,
        String examCode,
        String examTitle,
        String courseCode,
        String courseName,
        String roomCode,
        LocalDateTime startTime,
        LocalDateTime endTime,
        String sessionStatus,
        String registrationStatus,
        Integer durationMinutes,
        Integer questionCount,
        BigDecimal totalPoints,
        Long attemptId,
        String attemptStatus,
        BigDecimal score,
        boolean canStart,
        boolean requiresAccessCode
) {}
