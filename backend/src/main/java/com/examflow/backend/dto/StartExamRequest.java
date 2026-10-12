package com.examflow.backend.dto;

public record StartExamRequest(String accessCode, String roomCode) {
    public StartExamRequest(String accessCode) {
        this(accessCode, null);
    }
}
