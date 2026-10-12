package com.examflow.backend.controller;

import com.examflow.backend.dto.CreateCourseRequest;
import com.examflow.backend.dto.TeacherCourseDto;
import com.examflow.backend.service.TeacherCourseService;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/teacher/courses")
public class TeacherCourseController {

    private final TeacherCourseService teacherCourseService;

    public TeacherCourseController(
            TeacherCourseService teacherCourseService
    ) {
        this.teacherCourseService = teacherCourseService;
    }

    @GetMapping
    public List<TeacherCourseDto> getCourses(
            @AuthenticationPrincipal Jwt jwt
    ) {
        return teacherCourseService.getCourses(jwt);
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public TeacherCourseDto createCourse(
            @AuthenticationPrincipal Jwt jwt,
            @RequestBody CreateCourseRequest request
    ) {
        return teacherCourseService.createCourse(jwt, request);
    }
}