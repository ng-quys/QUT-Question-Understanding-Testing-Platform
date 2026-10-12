package com.examflow.backend.dto;

public record CreateCourseRequest(
        String code,
        String name,
        Short credits,
        String department
) {
}