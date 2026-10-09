package com.examflow.backend.dto;

import jakarta.validation.constraints.NotBlank;

public record AntiCheatEventRequest(
        @NotBlank String event,
        boolean active,
        String timestamp
) {
}
