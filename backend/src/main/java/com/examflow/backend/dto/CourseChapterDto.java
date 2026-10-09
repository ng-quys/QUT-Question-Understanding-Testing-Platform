package com.examflow.backend.dto;

import java.util.List;

public record CourseChapterDto(Long id, Long courseId, int order, String code, String name, List<CourseTopicDto> topics) {}
