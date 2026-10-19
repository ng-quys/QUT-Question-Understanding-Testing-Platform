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
            return requireActive(byKeycloakId);
        }


        throw new ApiException(
                HttpStatus.UNAUTHORIZED,
                "Không tìm thấy người dùng trong hệ thống"
        );
    }
    private UserEntity requireActive(UserEntity user) {
        if (!"active".equalsIgnoreCase(user.getStatus())) {
            throw new ApiException(HttpStatus.FORBIDDEN, "Tài khoản đã bị khóa hoặc ngưng hoạt động");
        }
        return user;
    }
}