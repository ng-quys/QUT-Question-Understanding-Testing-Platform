package com.examflow.backend.dto;

import java.time.LocalDateTime;

public record ExamSummaryDto(Long id, String code, String title, Long courseId, String courseCode,
                             String courseName, Integer durationMinutes, Integer totalQuestions,
                             String status, LocalDateTime examDate, boolean shuffleQuestions,
                             boolean shuffleAnswers, boolean antiCheatMode) {}
