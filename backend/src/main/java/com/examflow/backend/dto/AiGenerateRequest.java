package com.examflow.backend.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.*;

import java.util.List;

public record AiGenerateRequest(
    @NotNull Long courseId,
    @NotBlank String provider,
    String instruction,
    String sourceText,
    @NotEmpty List<@Valid AiUnitDto> units
) {
    public record AiUnitDto(
        String name,
        Long chapterId,
        Long cloId,
        @Min(0) @Max(30) int nb,
        @Min(0) @Max(30) int th,
        @Min(0) @Max(30) int vd
    ) {}
}