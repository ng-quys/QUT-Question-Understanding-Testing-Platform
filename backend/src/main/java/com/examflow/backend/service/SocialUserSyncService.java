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
        String keycloakUserId = requireClaim(jwt.getSubject(), "sub");
        String email = requireClaim(
                jwt.getClaimAsString("email"),
                "email"
        ).trim().toLowerCase(Locale.ROOT);

        UserEntity existingByKeycloakId = userRepository
                .findByKeycloakUserId(keycloakUserId)
                .orElse(null);

        if (existingByKeycloakId != null) {
            // Keep the application DB role and the Keycloak realm role in sync.
            // Otherwise authorization may pass in Spring Security while the
            // controller rejects the same user based on the stale DB role.
            // Login must NEVER change the role chosen during registration.
            // The DB is the application source of truth for an existing user.
            UserEntity saved = existingByKeycloakId;
            keycloakAdminService.setApplicationRealmRole(
                    keycloakUserId,
                    toKeycloakRole(saved.getRole())
            );
            return toResponse(saved, false);
        }

        UserEntity existingByEmail = userRepository
                .findByEmailIgnoreCase(email)
                .orElse(null);

        if (existingByEmail != null) {
            // Keep an existing Keycloak link stable. Different social providers
            // can produce different broker identities for the same verified
            // email; CurrentUserService therefore also has an email fallback.
            if (existingByEmail.getKeycloakUserId() == null ||
                    existingByEmail.getKeycloakUserId().isBlank()) {
                existingByEmail.setKeycloakUserId(keycloakUserId);
            }
            // Preserve the role selected at registration. Never overwrite it
            // from the role toggle on the login screen.
            UserEntity saved = userRepository.save(existingByEmail);

            keycloakAdminService.setApplicationRealmRole(
                    keycloakUserId,
                    toKeycloakRole(saved.getRole())
            );

            return toResponse(saved, false);
        }

        String username = resolveUsername(jwt, email);
        username = makeUsernameUnique(username);

        String fullName = resolveFullName(jwt, username);
        String role = requestedRole.name().toLowerCase(Locale.ROOT);

        UserEntity user = new UserEntity();
        user.setKeycloakUserId(keycloakUserId);
        user.setUsername(username);
        user.setEmail(email);
        user.setFullName(fullName);
        user.setRole(role);
        user.setStatus("active");
        user.setPasswordHash(null);

        UserEntity saved = userRepository.save(user);

        // Social users are created by Keycloak's broker flow, so assign the
        // application realm role after the user exists in Keycloak.
        keycloakAdminService.setApplicationRealmRole(
                keycloakUserId,
                requestedRole.getKeycloakRole()
        );

        return toResponse(saved, true);
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
