package com.examflow.backend.service;

import com.examflow.backend.entity.UserEntity;
import com.examflow.backend.exception.ApiException;
import com.examflow.backend.repository.UserRepository;
import jakarta.transaction.Transactional;
import org.springframework.http.HttpStatus;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.stereotype.Service;
import java.util.List;
import java.util.Map;

@Service
public class AdminIdentityService {
    private final UserRepository users;
    public AdminIdentityService(UserRepository users) { this.users = users; }

    @Transactional
    public UserEntity requireAdmin(Jwt jwt) {
        if (jwt == null) throw new ApiException(HttpStatus.UNAUTHORIZED, "Chưa đăng nhập");
        Map<String, Object> access = jwt.getClaim("realm_access");
        if (access == null || !(access.get("roles") instanceof List<?> roles)
                || roles.stream().noneMatch(r -> "ADMIN".equalsIgnoreCase(String.valueOf(r)))) {
            throw new ApiException(HttpStatus.FORBIDDEN, "Tài khoản chưa có realm role ADMIN trong Keycloak");
        }
        String subject = jwt.getSubject();
        if (subject == null || subject.isBlank())
            throw new ApiException(HttpStatus.UNAUTHORIZED, "Token không có định danh người dùng");
        UserEntity user = users.findByKeycloakUserId(subject).orElse(null);
        String email = jwt.getClaimAsString("email");
        if (user == null) {
            if (email == null || email.isBlank())
                throw new ApiException(HttpStatus.BAD_REQUEST, "Vui lòng bổ sung email cho Admin trong Keycloak");
            user = users.findByEmailIgnoreCase(email.trim()).orElse(null);
            if (user != null && user.getKeycloakUserId() != null && !user.getKeycloakUserId().isBlank()
                    && !subject.equals(user.getKeycloakUserId())) {
                throw new ApiException(HttpStatus.CONFLICT, "Email đã liên kết với tài khoản Keycloak khác");
            }
            // Require verified email before linking an existing local identity.
            if (user != null && !Boolean.TRUE.equals(jwt.getClaimAsBoolean("email_verified")))
                throw new ApiException(HttpStatus.FORBIDDEN, "Email Admin cần được xác minh trước khi liên kết tài khoản cũ");
        }
        if (user == null) {
            user = new UserEntity();
            String preferred = jwt.getClaimAsString("preferred_username");
            String base = preferred == null || preferred.isBlank() ? "admin" : preferred.trim();
            String username = base;
            int suffix = 1;
            while (users.existsByUsernameIgnoreCase(username)) username = base + "_" + suffix++;
            user.setUsername(username);
            user.setEmail(email.trim());
            String name = jwt.getClaimAsString("name");
            user.setFullName(name == null || name.isBlank() ? username : name);
            user.setStatus("active");
            user.setPasswordHash(null);
        } else if (!"active".equalsIgnoreCase(user.getStatus())) {
            throw new ApiException(HttpStatus.FORBIDDEN, "Tài khoản đã bị khóa hoặc ngưng hoạt động");
        }
        boolean changed = !subject.equals(user.getKeycloakUserId()) || !"admin".equalsIgnoreCase(user.getRole());
        user.setKeycloakUserId(subject);
        user.setRole("admin");
        return changed || user.getId() == null ? users.save(user) : user;
    }
}
