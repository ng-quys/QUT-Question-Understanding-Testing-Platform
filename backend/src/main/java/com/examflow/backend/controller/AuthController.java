package com.examflow.backend.controller;

import java.util.Map;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.examflow.backend.dto.RegisterRequest;
import com.examflow.backend.dto.SocialUserSyncRequest;
import com.examflow.backend.dto.SocialUserSyncResponse;
import com.examflow.backend.service.RegistrationService;
import com.examflow.backend.service.SocialUserSyncService;

import jakarta.validation.Valid;

@RestController
@RequestMapping("/api/auth")
public class AuthController {

    private final RegistrationService registrationService;
    private final com.examflow.backend.service.CurrentUserService currentUsers;
    private final SocialUserSyncService socialUserSyncService;

    public AuthController(
            RegistrationService registrationService,
            SocialUserSyncService socialUserSyncService,
            com.examflow.backend.service.CurrentUserService currentUsers
    ) {
        this.registrationService = registrationService;
        this.currentUsers=currentUsers;
        this.socialUserSyncService = socialUserSyncService;
    }

    @org.springframework.web.bind.annotation.GetMapping("/me")
    public Map<String,Object> me(@org.springframework.security.core.annotation.AuthenticationPrincipal org.springframework.security.oauth2.jwt.Jwt jwt) {
        var u=currentUsers.getCurrentUser(jwt);
        return Map.of("id",u.getId(),"username",u.getUsername(),"fullName",u.getFullName(),"email",u.getEmail(),"role",u.getRole());
    }

    @PostMapping("/register")
    public ResponseEntity<Map<String, String>> register(
            @Valid @RequestBody RegisterRequest request
    ) {
        throw new com.examflow.backend.exception.ApiException(HttpStatus.FORBIDDEN,"Tài khoản do quản trị viên cấp. Không hỗ trợ tự đăng ký.");
    }

    /**
     * Called after Google/Microsoft authentication succeeds in Keycloak.
     *
     * The user identity is taken directly from the authenticated
     * Keycloak JWT stored in Spring Security.
     *
     * The request body only contains the application role selected
     * on the login UI.
     */
    @PostMapping("/sync-user")
    public ResponseEntity<SocialUserSyncResponse> syncSocialUser(
            Authentication authentication,
            @Valid @RequestBody SocialUserSyncRequest request
    ) {

        if (!(authentication instanceof JwtAuthenticationToken jwtAuthentication)) {
            throw new IllegalStateException(
                    "Authenticated user does not contain a Keycloak JWT"
            );
        }

        var jwt=jwtAuthentication.getToken();
        var user=currentUsers.getCurrentUser(jwt);
        return ResponseEntity.ok(new SocialUserSyncResponse(user.getId(),user.getKeycloakUserId(),user.getUsername(),user.getEmail(),user.getFullName(),user.getRole(),user.getStatus(),false));
    }
}