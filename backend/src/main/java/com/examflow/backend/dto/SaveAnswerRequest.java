package com.examflow.backend.dto;

import jakarta.validation.constraints.NotNull;

public record SaveAnswerRequest(
        @NotNull Long questionId,
        @NotNull Long answerId
) {}
