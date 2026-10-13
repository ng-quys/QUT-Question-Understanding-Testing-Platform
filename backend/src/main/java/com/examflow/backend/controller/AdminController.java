package com.examflow.backend.controller;

import org.springframework.security.oauth2.jwt.Jwt;
import com.examflow.backend.service.AdminIdentityService;
import com.examflow.backend.entity.UserEntity;
import com.examflow.backend.dto.AdminDto;
import com.examflow.backend.service.AdminService;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/admin")
public class AdminController {
    private final AdminService service;
    private final com.examflow.backend.service.AntiCheatService antiCheatService;
    private final AdminIdentityService identityService;
    public AdminController(AdminService service, com.examflow.backend.service.AntiCheatService antiCheatService, AdminIdentityService identityService){this.identityService=identityService;this.service=service;this.antiCheatService=antiCheatService;}
    @GetMapping("/ai-runtime") public tools.jackson.databind.JsonNode runtime(@AuthenticationPrincipal Jwt u){requireAdmin(u);return antiCheatService.runtimeStatus();}
    @jakarta.transaction.Transactional
    @PatchMapping("/exams/{id}/ai-policy") public java.util.Map<String,Object> policy(@AuthenticationPrincipal Jwt u,@PathVariable Long id,@RequestParam boolean enabled){UserEntity admin=requireAdmin(u);var result=antiCheatService.updatePolicy(id,enabled);service.auditPolicy(admin.getId(),id,enabled);return result;}


    @GetMapping("/dashboard") public AdminDto.Dashboard dashboard(@AuthenticationPrincipal Jwt u){requireAdmin(u);return service.dashboard();}
    @GetMapping("/users") public List<AdminDto.UserRow> users(@AuthenticationPrincipal Jwt u,@RequestParam(defaultValue="") String q,@RequestParam(defaultValue="") String role,@RequestParam(defaultValue="") String status){requireAdmin(u);return service.users(q,role,status);}
    @GetMapping("/students") public List<AdminDto.UserRow> students(@AuthenticationPrincipal Jwt u,@RequestParam(defaultValue="") String q,@RequestParam(defaultValue="") String status){requireAdmin(u);return service.students(q,status);}
    @GetMapping("/teachers") public List<AdminDto.UserRow> teachers(@AuthenticationPrincipal Jwt u,@RequestParam(defaultValue="") String q,@RequestParam(defaultValue="") String status){requireAdmin(u);return service.teachers(q,status);}
    @GetMapping("/courses") public List<AdminDto.CourseRow> courses(@AuthenticationPrincipal Jwt u,@RequestParam(defaultValue="") String q){requireAdmin(u);return service.courses(q);}
    @GetMapping("/exams") public List<AdminDto.ExamRow> exams(@AuthenticationPrincipal Jwt u,@RequestParam(defaultValue="") String q,@RequestParam(defaultValue="") String status){requireAdmin(u);return service.exams(q,status);}
    @GetMapping("/sessions") public List<AdminDto.SessionRow> sessions(@AuthenticationPrincipal Jwt u,@RequestParam(defaultValue="") String q,@RequestParam(defaultValue="") String status){requireAdmin(u);return service.sessions(q,status);}
    @GetMapping("/attempts") public List<AdminDto.AttemptRow> attempts(@AuthenticationPrincipal Jwt u,@RequestParam(defaultValue="") String q,@RequestParam(defaultValue="") String status){requireAdmin(u);return service.attempts(q,status);}
    @GetMapping("/attempts/{id}") public AdminDto.AttemptDetail attempt(@AuthenticationPrincipal Jwt u,@PathVariable Long id){requireAdmin(u);return service.attemptDetail(id);}
    @GetMapping("/anti-cheating/{attemptId}") public AdminDto.AntiCheatSummary antiCheat(@AuthenticationPrincipal Jwt u,@PathVariable Long attemptId){requireAdmin(u);return service.antiCheat(attemptId);}
    @GetMapping("/audit-logs") public List<AdminDto.AuditRow> auditLogs(@AuthenticationPrincipal Jwt u){requireAdmin(u);return service.auditLogs();}
    @PatchMapping("/users/{id}/status") public AdminDto.UserRow updateStatus(@AuthenticationPrincipal Jwt u,@PathVariable Long id,@RequestParam String status){return service.updateUserStatus(requireAdmin(u).getId(),id,status);}

    @GetMapping("/me")
    public java.util.Map<String,Object> me(@AuthenticationPrincipal Jwt jwt) {
        UserEntity user = requireAdmin(jwt);
        return java.util.Map.of("userId", user.getId(), "username", user.getUsername(),
                "email", user.getEmail(), "fullName", user.getFullName(), "role", "admin");
    }

    private UserEntity requireAdmin(Jwt jwt) {
        return identityService.requireAdmin(jwt);
    }
}
