package com.examflow.backend.controller;

import java.util.Map;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.examflow.backend.dto.RegisterRequest;
import com.examflow.backend.service.RegistrationService;

import jakarta.validation.Valid;

@RestController
@RequestMapping("/api/auth")
public class AuthController {

    private final RegistrationService registrationService;

    public AuthController(
            RegistrationService registrationService
    ) {
        this.registrationService = registrationService;
    }

    @PostMapping("/register")
    public ResponseEntity<Map<String, String>> register(
            @Valid @RequestBody RegisterRequest request
    ) {

        registrationService.register(request);

        return ResponseEntity
                .status(HttpStatus.CREATED)
                .body(
                        Map.of(
                                "message",
                                "Đăng ký tài khoản thành công"
                        )
                );
    }
}