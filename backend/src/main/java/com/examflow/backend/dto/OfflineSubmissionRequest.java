package com.examflow.backend.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import java.time.Instant;
import java.util.List;

public record OfflineSubmissionRequest(
    @NotBlank @Size(max=80) String token,
    @NotBlank @Size(max=80) String submissionId,
    @NotNull Instant frozenAt,
    Instant offlineSince,
    @NotNull @Size(max=2000) List<@Valid SaveAnswerRequest> answers
) {}
