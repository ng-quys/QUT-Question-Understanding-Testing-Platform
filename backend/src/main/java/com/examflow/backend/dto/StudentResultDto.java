package com.examflow.backend.dto;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;

public record StudentResultDto(
        Long attemptId,
        Long examId,
        String examCode,
        String examTitle,
        String courseCode,
        String courseName,
        BigDecimal score,
        BigDecimal totalPoints,
        LocalDateTime submittedAt,
        String status,
        int correctAnswers,
        int totalQuestions,
        List<CloAchievementDto> cloAchievement
) {}
