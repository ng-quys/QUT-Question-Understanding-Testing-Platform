package com.examflow.backend.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import java.util.List;

public record SubmitExamRequest(
        @NotNull List<@Valid SaveAnswerRequest> answers
) {}
