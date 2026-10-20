package com.examflow.backend.controller;
import com.examflow.backend.service.*;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.*;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import java.util.*;
@RestController
@RequestMapping("/api/teacher/exam-library")
public class TeacherExamLibraryController {
    private final TeacherExamLibraryService service;private final CurrentUserService users;
    public TeacherExamLibraryController(TeacherExamLibraryService service,CurrentUserService users){this.service=service;this.users=users;}
    @GetMapping public List<Map<String,Object>> list(@AuthenticationPrincipal Jwt jwt){return service.list(users.getCurrentUser(jwt));}
    @GetMapping("/{id}") public Map<String,Object> detail(@AuthenticationPrincipal Jwt jwt,@PathVariable long id){return service.detail(users.getCurrentUser(jwt),id);}
    @PutMapping("/{id}") public Map<String,Object> edit(@AuthenticationPrincipal Jwt jwt,@PathVariable long id,@Valid @RequestBody TeacherExamLibraryService.Edit input){return service.edit(users.getCurrentUser(jwt),id,input);}
    @DeleteMapping("/{id}") @ResponseStatus(org.springframework.http.HttpStatus.NO_CONTENT) public void delete(@AuthenticationPrincipal Jwt jwt,@PathVariable long id){service.delete(users.getCurrentUser(jwt),id);}
}
