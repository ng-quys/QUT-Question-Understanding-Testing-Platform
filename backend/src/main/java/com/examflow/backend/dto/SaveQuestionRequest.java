package com.examflow.backend.dto;

import java.math.BigDecimal;
import java.util.List;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;

public record SaveQuestionRequest(
        @NotNull Long courseId,
        Long chapterId,
        Long topicId,
        Long cloId,
        @NotBlank String bloom,
        String difficulty,
        @NotBlank String content,
        String explanation,
        String status,
        BigDecimal defaultScore,
        @NotEmpty List<@Valid QuestionAnswerRequest> answers
) {}
