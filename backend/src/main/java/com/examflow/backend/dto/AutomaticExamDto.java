package com.examflow.backend.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import java.util.List;

public final class AutomaticExamDto {
    private AutomaticExamDto() {}
    public record Group(@NotBlank String dimension, @NotBlank String value, @Min(0) int count) {}
    public record Request(@Positive long courseId, @NotBlank @Size(max=150) String title,
            @NotBlank @Pattern(regexp="[A-Za-z0-9_-]{1,40}") String code,
            @Min(1) @Max(10) int variants, @Min(1) @Max(200) int questions,
            @DecimalMin("0") @DecimalMax("100") double overlapPercent,
            @NotNull @Size(max=150) List<@NotNull @Valid Group> groups,
            boolean shuffleQuestions, boolean shuffleAnswers, boolean antiCheatMode) {}
    public record Option(long id, String label, String content, boolean correct, int position) {}
    public record Item(long id, String content, String explanation, String difficulty,
            String chapter, String topic, String clo, List<Option> answers) {
        public String value(String dimension) {
            return switch(dimension) {
                case "difficulty" -> difficulty;
                case "chapter" -> chapter;
                case "topic" -> topic;
                case "clo" -> clo;
                default -> null;
            };
        }
    }
    public record Choice(String dimension, String value, String label, int available) {}
    public record Bank(int available, List<Choice> choices) {}
    public record CourseChoice(long id, String code, String name) {}
    public record GroupCheck(String dimension, String value, String label, int required, int available) {}
    public record Check(boolean valid, int available, int maximumOverlap, List<GroupCheck> groups,
            List<String> errors, List<String> warnings) {}
    public record Variant(String code, List<Item> questions) {}
    public record Pair(String first, String second, int count, double percent) {}
    public record Preview(String previewId, List<Variant> variants, List<Pair> pairs, long totalOverlap,
            double maximumOverlapPercent, long elapsedMillis, String status, boolean provenOptimal,
            List<GroupCheck> groups, List<String> warnings) {}
    public record Save(@NotBlank String previewId) {}
}
