package com.examflow.backend.controller;

import com.examflow.backend.service.*;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.*;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import java.util.Map;

@RestController
@RequestMapping("/api/admin/organization/department-exams")
public class DepartmentExamController {
    private final DepartmentExamService service;private final CurrentUserService users;
    public DepartmentExamController(DepartmentExamService service,CurrentUserService users){this.service=service;this.users=users;}
    @GetMapping("/options") public Map<String,Object> options(@AuthenticationPrincipal Jwt jwt){return service.options(users.getCurrentUser(jwt));}
    @GetMapping("/candidates") public Map<String,Object> candidates(@AuthenticationPrincipal Jwt jwt,@RequestParam long courseId,@RequestParam long periodId,@RequestParam String department){return service.candidates(users.getCurrentUser(jwt),courseId,periodId,department);}
    @PostMapping("/preview") public Map<String,Object> preview(@AuthenticationPrincipal Jwt jwt,@Valid @RequestBody DepartmentExamService.Input input){return service.preview(users.getCurrentUser(jwt),input);}
    @PostMapping public Map<String,Object> create(@AuthenticationPrincipal Jwt jwt,@Valid @RequestBody DepartmentExamService.Input input){return service.create(users.getCurrentUser(jwt),input);}
    @GetMapping public Map<String,Object> list(@AuthenticationPrincipal Jwt jwt,@RequestParam(defaultValue="") String search,@RequestParam(defaultValue="0") int page,@RequestParam(defaultValue="") String status){return service.list(users.getCurrentUser(jwt),search,page,status);}
    @PostMapping("/{id}/publish") public Map<String,Object> publishSitting(@AuthenticationPrincipal Jwt jwt,@PathVariable long id){return service.publishSitting(users.getCurrentUser(jwt),id);}
    @GetMapping("/{id}") public Map<String,Object> detail(@AuthenticationPrincipal Jwt jwt,@PathVariable long id){return service.detail(users.getCurrentUser(jwt),id);}
    @PutMapping("/{id}/schedule") public Map<String,Object> schedule(@AuthenticationPrincipal Jwt jwt,@PathVariable long id,@Valid @RequestBody DepartmentExamService.ScheduleInput input){return service.schedule(users.getCurrentUser(jwt),id,input);}
    @PutMapping("/groups/{id}") public Map<String,Object> assign(@AuthenticationPrincipal Jwt jwt,@PathVariable long id,@Valid @RequestBody DepartmentExamService.Assignment input){return service.assign(users.getCurrentUser(jwt),id,input);}
    @PostMapping("/groups/{id}/publish") public Map<String,Object> publish(@AuthenticationPrincipal Jwt jwt,@PathVariable long id){return service.publish(users.getCurrentUser(jwt),id);}
    @PostMapping("/groups/{id}/cancel") public Map<String,Object> cancel(@AuthenticationPrincipal Jwt jwt,@PathVariable long id){return service.cancel(users.getCurrentUser(jwt),id);}
    @PatchMapping("/groups/{id}/ai-policy") public Map<String,Object> aiPolicy(@AuthenticationPrincipal Jwt jwt,@PathVariable long id,@RequestParam boolean enabled){return service.aiPolicy(users.getCurrentUser(jwt),id,enabled);}
}
