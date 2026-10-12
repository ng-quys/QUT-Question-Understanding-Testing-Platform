package com.examflow.backend.dto;

public record CourseTopicDto(Long id, Long chapterId, String code, String name, long questionCount) {}
