package com.examflow.backend.service;

import com.examflow.backend.dto.RegisterRequest;
import com.examflow.backend.entity.UserEntity;
import com.examflow.backend.repository.UserRepository;
import org.springframework.stereotype.Service;

import java.util.Locale;

@Service
public class RegistrationService {

    private final KeycloakAdminService keycloakAdminService;
    private final UserRepository userRepository;

    public RegistrationService(
            KeycloakAdminService keycloakAdminService,
            UserRepository userRepository
    ) {
        this.keycloakAdminService = keycloakAdminService;
        this.userRepository = userRepository;
    }

    public void register(RegisterRequest request) {

        String email = request.email()
                .trim()
                .toLowerCase(Locale.ROOT);

        String username = resolveUsername(request);

        // 1. Tạo user trong Keycloak và lấy UUID
        String keycloakUserId =
                keycloakAdminService.createUser(request);

        // 2. Tạo user tương ứng trong database
        UserEntity user = new UserEntity();

        user.setKeycloakUserId(keycloakUserId);
        user.setUsername(username);
        user.setEmail(email);
        user.setFullName(resolveFullName(request, username));
        user.setRole(request.role().name().toLowerCase(Locale.ROOT));
        user.setStatus("active");

        // Password do Keycloak quản lý
        user.setPasswordHash(null);

        userRepository.save(user);
    }

    private String resolveUsername(RegisterRequest request) {

        if (request.username() != null
                && !request.username().isBlank()) {

            return request.username().trim();
        }

        String email = request.email().trim();
        int atIndex = email.indexOf('@');

        if (atIndex > 0) {
            return email.substring(0, atIndex);
        }

        return email;
    }

    private String resolveFullName(
            RegisterRequest request,
            String username
    ) {

        if (request.fullName() != null
                && !request.fullName().isBlank()) {

            return request.fullName()
                    .trim()
                    .replaceAll("\\s+", " ");
        }

        String firstName =
                request.firstName() != null
                        ? request.firstName().trim()
                        : "";

        String lastName =
                request.lastName() != null
                        ? request.lastName().trim()
                        : "";

        String fullName =
                (firstName + " " + lastName).trim();

        return fullName.isBlank()
                ? username
                : fullName;
    }
}