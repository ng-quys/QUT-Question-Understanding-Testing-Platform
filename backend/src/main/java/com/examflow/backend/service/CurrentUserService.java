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

        return userRepository
                .findByKeycloakUserId(keycloakUserId)
                .orElseThrow(() ->
                        new ApiException(
                                HttpStatus.UNAUTHORIZED,
                                "Không tìm thấy người dùng trong hệ thống"
                        )
                );
    }
}