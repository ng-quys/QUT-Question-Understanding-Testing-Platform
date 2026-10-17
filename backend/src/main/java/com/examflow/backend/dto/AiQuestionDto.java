package com.examflow.backend.dto;
import java.util.List;
public record AiQuestionDto(String content, List<String> options, int correctIndex,
    String explanation, String bloom, Long chapterId, Long cloId) {}
