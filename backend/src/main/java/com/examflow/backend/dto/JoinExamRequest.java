package com.examflow.backend.dto;

import jakarta.validation.constraints.NotBlank;

public record JoinExamRequest(
        @NotBlank(message = "Mã cuộc thi không được để trống")
        String code
) {
}
