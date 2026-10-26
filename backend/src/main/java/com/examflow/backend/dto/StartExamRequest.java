package com.examflow.backend.dto;

public record StartExamRequest(String accessCode, String roomCode, String verificationToken) {
    public StartExamRequest(String accessCode,String roomCode) {this(accessCode,roomCode,null);}
    public StartExamRequest(String accessCode) {
        this(accessCode, null, null);
    }
}
