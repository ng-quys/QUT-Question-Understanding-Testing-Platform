package com.examflow.backend.controller;

import com.examflow.backend.dto.*;
import com.examflow.backend.service.TeacherExamService;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.*;
import java.util.List;

@RestController
@RequestMapping("/api/teacher/exams")
public class TeacherExamController {
    private final TeacherExamService service;
    public TeacherExamController(TeacherExamService service){ this.service=service; }
    @GetMapping public List<ExamSummaryDto> list(){ return service.list(); }
    @PatchMapping("/{id}/status") public ExamSummaryDto status(@PathVariable Long id,@RequestParam String value){ return service.setStatus(id,value); }
    @DeleteMapping("/{id}") @ResponseStatus(org.springframework.http.HttpStatus.NO_CONTENT) public void delete(@PathVariable Long id){ service.delete(id); }
    @PostMapping("/quick") public QuickExamResult quick(@Valid @RequestBody QuickExamRequest request){ return service.createQuick(request); }
}
