package com.examflow.backend.dto;

public record StudentProfileDto(
        Long studentId,
        String username,
        String email,
        String fullName,
        String department,
        String status,
        boolean hasFacePhoto
) {
}
