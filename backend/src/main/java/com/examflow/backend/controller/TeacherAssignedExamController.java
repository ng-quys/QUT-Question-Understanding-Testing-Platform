package com.examflow.backend.controller;

import com.examflow.backend.service.*;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.*;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import java.util.*;

@RestController
@RequestMapping("/api/teacher/assigned-sittings")
public class TeacherAssignedExamController {
    private final TeacherAssignedExamService service;
    private final CurrentUserService users;
    public TeacherAssignedExamController(TeacherAssignedExamService service,CurrentUserService users){this.service=service;this.users=users;}
    @GetMapping public List<TeacherAssignedExamService.Group> list(@AuthenticationPrincipal Jwt jwt){return service.list(users.getCurrentUser(jwt));}
    @GetMapping("/groups/{id}/exams") public TeacherAssignedExamService.Choices choices(@AuthenticationPrincipal Jwt jwt,@PathVariable long id,@RequestParam(defaultValue="") String search){return service.choices(users.getCurrentUser(jwt),id,search);}
    @GetMapping("/groups/{id}/exams/{examId}") public Map<String,Object> preview(@AuthenticationPrincipal Jwt jwt,@PathVariable long id,@PathVariable long examId){return service.preview(users.getCurrentUser(jwt),id,examId);}
    @PutMapping("/groups/{id}/exam") public TeacherAssignedExamService.Group select(@AuthenticationPrincipal Jwt jwt,@PathVariable long id,@Valid @RequestBody TeacherAssignedExamService.Selection input){return service.select(users.getCurrentUser(jwt),id,input);}
}
