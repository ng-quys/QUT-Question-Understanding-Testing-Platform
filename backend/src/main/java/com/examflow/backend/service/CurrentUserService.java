package com.examflow.backend.service;

import org.springframework.http.HttpStatus;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.stereotype.Service;

import com.examflow.backend.entity.UserEntity;
import com.examflow.backend.exception.ApiException;
import com.examflow.backend.repository.UserRepository;

@Service
public class CurrentUserService {

    private final UserRepository userRepository;

    public CurrentUserService(
            UserRepository userRepository
    ) {
        this.userRepository = userRepository;
    }

    public UserEntity getCurrentUser(Jwt jwt) {

        if (jwt == null) {
            throw new ApiException(
                    HttpStatus.UNAUTHORIZED,
                    "Chưa đăng nhập"
            );
        }

        String keycloakUserId = jwt.getSubject();

        UserEntity byKeycloakId = userRepository
                .findByKeycloakUserId(keycloakUserId)
                .orElse(null);

        if (byKeycloakId != null) {
            return byKeycloakId;
        }

        // A user may authenticate through another Keycloak identity provider
        // (Google/Microsoft) and receive a different subject while still using
        // the same verified application email. Fall back to the JWT email so
        // all supported login methods resolve to the same local account.
        String email = jwt.getClaimAsString("email");

        if (email != null && !email.isBlank()) {
            return userRepository
                    .findByEmailIgnoreCase(email.trim())
                    .orElseThrow(() -> new ApiException(
                            HttpStatus.UNAUTHORIZED,
                            "Không tìm thấy người dùng trong hệ thống"
                    ));
        }

        throw new ApiException(
                HttpStatus.UNAUTHORIZED,
                "Không tìm thấy người dùng trong hệ thống"
        );
    }
}