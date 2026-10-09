package com.examflow.backend.dto;

import lombok.AllArgsConstructor;
import lombok.Getter;

@Getter
@AllArgsConstructor
public class CourseResponse {

    private Long id;
    private String code;
    private String name;
    private Integer credits;
    private String department;

    private long chaptersCount;
    private long cloCount;
    private long questionCount;
}