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
    private final SocialUserSyncService socialUserSyncService;

    public AuthController(
            RegistrationService registrationService,
            SocialUserSyncService socialUserSyncService
    ) {
        this.registrationService = registrationService;
        this.socialUserSyncService = socialUserSyncService;
    }

    @PostMapping("/register")
    public ResponseEntity<Map<String, String>> register(
            @Valid @RequestBody RegisterRequest request
    ) {
        registrationService.register(request);

        return ResponseEntity
                .status(HttpStatus.CREATED)
                .body(Map.of(
                        "message",
                        "Đăng ký tài khoản thành công"
                ));
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

        SocialUserSyncResponse response = socialUserSyncService.sync(
                jwtAuthentication.getToken(),
                request.role()
        );

        return ResponseEntity.ok(response);
    }
}