package com.examflow.backend.dto;

import jakarta.validation.constraints.*;
import java.util.List;

public record QuickExamRequest(
        @NotNull Long courseId,
        @NotBlank String title,
        @NotBlank String code,
        @Min(1) int durationMinutes,
        @Min(1) int totalQuestions,
        @DecimalMin("0") @DecimalMax("100") double mediumPercent,
        @DecimalMin("0") @DecimalMax("100") double goodPercent,
        @DecimalMin("0") @DecimalMax("100") double excellentPercent,
        @DecimalMin("0") @DecimalMax("100") double maxOverlapPercent,
        List<Long> cloIds,
        boolean shuffleQuestions,
        boolean shuffleAnswers,
        boolean antiCheatMode
) {}
