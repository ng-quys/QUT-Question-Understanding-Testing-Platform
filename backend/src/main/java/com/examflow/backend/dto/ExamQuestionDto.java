package com.examflow.backend.dto;

import java.math.BigDecimal;
import java.util.List;

public record ExamQuestionDto(
        Long questionId,
        Integer position,
        String content,
        BigDecimal points,
        String cloCode,
        List<ExamOptionDto> options,
        Long selectedAnswerId
) {}
