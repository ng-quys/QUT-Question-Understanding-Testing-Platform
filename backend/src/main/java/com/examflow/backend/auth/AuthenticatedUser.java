package com.examflow.backend.auth;

public record AuthenticatedUser(Long userId, String role, String email) {}
