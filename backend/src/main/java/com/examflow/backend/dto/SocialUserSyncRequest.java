package com.examflow.backend.dto;

import jakarta.validation.constraints.NotNull;

public record SocialUserSyncRequest(
        @NotNull(message = "Vai trò không được để trống")
        RegistrationRole role
) {
}
