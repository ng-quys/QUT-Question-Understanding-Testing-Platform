package com.examflow.backend.dto;

import java.time.LocalDateTime;
import java.util.List;

public record CreateExamSessionRequest(
    Long examId,
    String name,
    String roomCode,
    String accessCode,
    LocalDateTime startTime,
    LocalDateTime endTime,
    List<Long> studentIds
) {}