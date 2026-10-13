package com.examflow.backend.dto;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;

public final class AdminDto {
    private AdminDto() {}

    public record Dashboard(
            long totalUsers, long activeUsers, long students, long teachers, long admins,
            long courses, long exams, long sessions, long attempts, long inProgressAttempts,
            long completedAttempts, BigDecimal averageScore, long recentCompletedAttempts,
            long highRiskAttempts
    ) {}

    public record UserRow(Long id, String username, String email, String fullName, String role,
                          String department, String status, LocalDateTime createdAt) {}

    public record CourseRow(Long id, String code, String name, String department, String status,
                            long questionCount, long examCount, long sessionCount) {}

    public record ExamRow(Long id, String code, String title, String courseCode, String courseName,
                          Integer durationMinutes, Integer totalQuestions, BigDecimal totalPoints,
                          String status, LocalDateTime examDate, Boolean antiCheatMode,
                          long sessionCount, long attemptCount, BigDecimal averageScore) {}

    public record SessionRow(Long id, Long examId, String examCode, String examTitle, String className,
                             String roomCode, String accessCode, LocalDateTime startTime,
                             LocalDateTime endTime, String status, long registeredCount, long attemptCount) {}

    public record AttemptRow(Long id, Long sessionId, String studentUsername, String studentName,
                             String examCode, String examTitle, LocalDateTime startedAt,
                             LocalDateTime submittedAt, BigDecimal score, BigDecimal totalPoints,
                             String status, long browserEvents, long aiEvents) {}

    public record AttemptDetail(AttemptRow attempt, List<BrowserEvent> events) {}

    public record BrowserEvent(Long id, String event, boolean active, LocalDateTime occurredAt, String module, double duration, int riskScore, String riskLevel, String sourceModule, String evidencePath) {}

    public record AntiCheatSummary(Long attemptId, long totalEvents, long tabHidden,
                                   long fullscreenExit, long windowBlur, long copy,
                                   long paste, long rightClick, long violationEvents, long aiEvents, int riskScore, String riskLevel) {}

    public record AuditRow(Long id, Long actorId, String actorUsername, String action,
                           String targetType, String targetId, String detail, LocalDateTime createdAt) {}
}
