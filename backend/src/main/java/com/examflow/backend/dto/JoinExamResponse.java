package com.examflow.backend.dto;

public record JoinExamResponse(
        Long sessionId,
        String examCode,
        String examTitle,
        String courseCode,
        String courseName,
        String roomCode,
        String startTime,
        String endTime,
        String message
) {
}
