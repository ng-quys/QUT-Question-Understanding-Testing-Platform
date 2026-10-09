package com.examflow.backend.controller;

import com.examflow.backend.dto.CreateExamSessionRequest;
import com.examflow.backend.dto.TeacherExamSessionDto;
import com.examflow.backend.service.TeacherExamSessionService;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/teacher/exam-sessions")
public class TeacherExamSessionController {

    private final TeacherExamSessionService service;

    public TeacherExamSessionController(TeacherExamSessionService service) {
        this.service = service;
    }

    @GetMapping
    public List<TeacherExamSessionDto> list() {
        return service.list();
    }

    @PostMapping
    public TeacherExamSessionDto create(@RequestBody CreateExamSessionRequest request) {
        return service.create(request);
    }

    @PatchMapping("/{id}/status")
    public TeacherExamSessionDto updateStatus(@PathVariable Long id, @RequestParam String value) {
        return service.setStatus(id, value);
    }
}