package com.examflow.backend.dto;

import java.util.List;

public record QuickExamResult(ExamSummaryDto exam, int mediumCount, int goodCount, int excellentCount,
                              int maximumAllowedOverlap, int actualMaximumOverlap, List<Long> questionIds,
                              List<String> warnings) {}
