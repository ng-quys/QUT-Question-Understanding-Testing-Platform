package com.examflow.backend.dto;

import jakarta.validation.constraints.NotBlank;

public record QuestionAnswerRequest(
        @NotBlank String content,
        boolean correct
) {}
