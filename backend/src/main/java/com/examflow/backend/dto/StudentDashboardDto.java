package com.examflow.backend.dto;

import java.math.BigDecimal;
import java.util.List;

public record StudentDashboardDto(
        Long studentId,
        String fullName,
        String email,
        String department,
        long upcomingSessions,
        long ongoingSessions,
        long completedExams,
        BigDecimal averageScore,
        List<StudentSessionDto> sessions,
        List<StudentResultDto> recentResults
) {}
