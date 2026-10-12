package com.examflow.backend.dto;

public record SocialUserSyncResponse(
        Long id,
        String keycloakUserId,
        String username,
        String email,
        String fullName,
        String role,
        String status,
        boolean created
) {
}
