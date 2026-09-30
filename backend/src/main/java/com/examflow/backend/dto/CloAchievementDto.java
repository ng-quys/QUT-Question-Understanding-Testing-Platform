package com.examflow.backend.dto;

public record CloAchievementDto(
        Long cloId,
        String cloCode,
        String description,
        int answeredQuestions,
        int correctQuestions,
        double achievementPercent
) {}
