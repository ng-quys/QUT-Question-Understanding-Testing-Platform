package com.examflow.backend.service;

import java.util.Locale;

import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.examflow.backend.dto.RegistrationRole;
import com.examflow.backend.dto.SocialUserSyncResponse;
import com.examflow.backend.entity.UserEntity;
import com.examflow.backend.repository.UserRepository;

@Service
public class SocialUserSyncService {

    private final UserRepository userRepository;
    private final KeycloakAdminService keycloakAdminService;

    public SocialUserSyncService(
            UserRepository userRepository,
            KeycloakAdminService keycloakAdminService
    ) {
        this.userRepository = userRepository;
        this.keycloakAdminService = keycloakAdminService;
    }

    @Transactional
    public SocialUserSyncResponse sync(
            Jwt jwt,
            RegistrationRole requestedRole
    ) {
        if(jwt==null)throw new com.examflow.backend.exception.ApiException(org.springframework.http.HttpStatus.UNAUTHORIZED,"Chưa đăng nhập");
        UserEntity user=userRepository.findByKeycloakUserId(jwt.getSubject()).orElseThrow(()->new com.examflow.backend.exception.ApiException(org.springframework.http.HttpStatus.FORBIDDEN,"Tài khoản chưa được quản trị viên cấp"));
        if(!"active".equals(user.getStatus()))throw new com.examflow.backend.exception.ApiException(org.springframework.http.HttpStatus.FORBIDDEN,"Tài khoản ngưng hoạt động");
        return toResponse(user,false);
    }

    private String toKeycloakRole(String databaseRole) {
        if (databaseRole == null) {
            throw new IllegalStateException("User role is missing in database");
        }

        String normalized = databaseRole.trim().toUpperCase(Locale.ROOT);
        if (!normalized.equals("STUDENT") && !normalized.equals("TEACHER")) {
            throw new IllegalStateException("Unsupported database role: " + databaseRole);
        }
        return normalized;
    }

    private String resolveUsername(Jwt jwt, String email) {
        String preferredUsername = jwt.getClaimAsString("preferred_username");

        if (preferredUsername != null && !preferredUsername.isBlank()) {
            return preferredUsername.trim();
        }

        int atIndex = email.indexOf('@');
        return atIndex > 0 ? email.substring(0, atIndex) : email;
    }

    private String makeUsernameUnique(String baseUsername) {
        String candidate = baseUsername;
        int suffix = 1;

        while (userRepository.existsByUsernameIgnoreCase(candidate)) {
            candidate = baseUsername + suffix;
            suffix++;
        }

        return candidate;
    }

    private String resolveFullName(Jwt jwt, String fallback) {
        String name = jwt.getClaimAsString("name");
        if (name != null && !name.isBlank()) {
            return name.trim().replaceAll("\\s+", " ");
        }

        String firstName = valueOrEmpty(jwt.getClaimAsString("given_name"));
        String lastName = valueOrEmpty(jwt.getClaimAsString("family_name"));
        String fullName = (firstName + " " + lastName).trim();

        return fullName.isBlank() ? fallback : fullName;
    }

    private String valueOrEmpty(String value) {
        return value == null ? "" : value.trim();
    }

    private String requireClaim(String value, String claimName) {
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException(
                    "Keycloak token is missing required claim: " + claimName
            );
        }
        return value;
    }

    private SocialUserSyncResponse toResponse(
            UserEntity user,
            boolean created
    ) {
        return new SocialUserSyncResponse(
                user.getId(),
                user.getKeycloakUserId(),
                user.getUsername(),
                user.getEmail(),
                user.getFullName(),
                user.getRole(),
                user.getStatus(),
                created
        );
    }
}
