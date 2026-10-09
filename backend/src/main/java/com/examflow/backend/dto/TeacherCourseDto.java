package com.examflow.backend.dto;

public record TeacherCourseDto(
        Long id,
        String code,
        String name,
        Short credits,
        String department,
        long chapterCount,
        long cloCount,
        long questionCount
) {
}