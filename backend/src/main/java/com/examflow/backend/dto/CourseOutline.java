package com.examflow.backend.dto;

import java.util.List;

/** Editable draft; no inferred CLO/topic relationships or Bloom levels. */
public record CourseOutline(Metadata course, List<Chapter> chapters, List<Clo> clos, List<String> warnings) {
    public record Metadata(String code, String name, Integer credits, String department) {}
    public record Chapter(String code, String name, List<Topic> topics) {}
    public record Topic(String code, String name) {}
    public record Clo(String code, String description) {}
    public record Confirmation(CourseOutline outline, boolean appendExisting) {}
    public record Counts(int chapters, int topics, int clos) {}
    public record Plan(Long courseId, boolean existing, Counts created, Counts skipped, List<String> conflicts) {}
}
