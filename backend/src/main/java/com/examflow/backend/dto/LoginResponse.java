package com.examflow.backend.dto;

public record LoginResponse(
        String token,
        Long userId,
        String username,
        String email,
        String fullName,
        String role,
        String department
) {}
