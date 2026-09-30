package com.examflow.backend.service;

import com.examflow.backend.auth.TokenService;
import com.examflow.backend.dto.LoginRequest;
import com.examflow.backend.dto.LoginResponse;
import com.examflow.backend.entity.UserEntity;
import com.examflow.backend.exception.ApiException;
import com.examflow.backend.repository.UserRepository;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.stereotype.Service;

@Service
public class AuthService {
    private final UserRepository userRepository;
    private final TokenService tokenService;
    private final BCryptPasswordEncoder passwordEncoder = new BCryptPasswordEncoder();

    public AuthService(UserRepository userRepository, TokenService tokenService) {
        this.userRepository = userRepository;
        this.tokenService = tokenService;
    }

    public LoginResponse login(LoginRequest request) {
        UserEntity user = userRepository
                .findByEmailIgnoreCaseOrUsernameIgnoreCase(request.email().trim(), request.email().trim())
                .orElseThrow(() -> new ApiException(HttpStatus.UNAUTHORIZED, "Email/tài khoản hoặc mật khẩu không đúng"));

        if (!"active".equalsIgnoreCase(user.getStatus())) {
            throw new ApiException(HttpStatus.FORBIDDEN, "Tài khoản hiện không hoạt động");
        }
        if (!request.role().equalsIgnoreCase(user.getRole())) {
            throw new ApiException(HttpStatus.FORBIDDEN, "Vai trò đăng nhập không khớp với tài khoản");
        }
        if (!passwordEncoder.matches(request.password(), user.getPasswordHash())) {
            throw new ApiException(HttpStatus.UNAUTHORIZED, "Email/tài khoản hoặc mật khẩu không đúng");
        }

        String token = tokenService.createToken(user.getId(), user.getRole(), user.getEmail());
        return new LoginResponse(token, user.getId(), user.getUsername(), user.getEmail(),
                user.getFullName(), user.getRole(), user.getDepartment());
    }
}
