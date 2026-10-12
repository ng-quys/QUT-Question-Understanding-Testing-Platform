package com.examflow.backend.dto;

import java.time.LocalDateTime;

public record TeacherExamSessionDto(
    Long id,
    Long examId,
    String examCode,
    String examTitle,
    String courseCode,
    String courseName,
    String name,
    String roomCode,
    String accessCode,
    LocalDateTime startTime,
    LocalDateTime endTime,
    String status,
    long registeredStudents,
    long attempts,
    long submissions
) {}