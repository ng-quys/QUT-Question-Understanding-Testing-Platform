package com.examflow.backend.controller;
import com.examflow.backend.service.*;
import org.springframework.web.bind.annotation.*;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import java.util.Map;
@RestController
@RequestMapping("/api/teacher/overview")
public class TeacherOverviewController {
    private final TeacherOverviewService service;private final CurrentUserService users;
    public TeacherOverviewController(TeacherOverviewService service,CurrentUserService users){this.service=service;this.users=users;}
    @GetMapping public Map<String,Object> overview(@AuthenticationPrincipal Jwt jwt){return service.overview(users.getCurrentUser(jwt));}
}
