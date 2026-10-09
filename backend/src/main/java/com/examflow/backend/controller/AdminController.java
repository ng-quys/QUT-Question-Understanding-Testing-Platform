package com.examflow.backend.controller;

import com.examflow.backend.auth.AuthenticatedUser;
import com.examflow.backend.dto.AdminDto;
import com.examflow.backend.exception.ApiException;
import com.examflow.backend.service.AdminService;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/admin")
public class AdminController {
    private final AdminService service;
    private final com.examflow.backend.service.AntiCheatService antiCheatService;
    public AdminController(AdminService service, com.examflow.backend.service.AntiCheatService antiCheatService){this.service=service;this.antiCheatService=antiCheatService;}
    @GetMapping("/ai-runtime") public tools.jackson.databind.JsonNode runtime(@AuthenticationPrincipal AuthenticatedUser u){requireAdmin(u);return antiCheatService.runtimeStatus();}
    @PatchMapping("/exams/{id}/ai-policy") public java.util.Map<String,Object> policy(@AuthenticationPrincipal AuthenticatedUser u,@PathVariable Long id,@RequestParam boolean enabled){requireAdmin(u);return antiCheatService.updatePolicy(id,enabled);}


    @GetMapping("/dashboard") public AdminDto.Dashboard dashboard(@AuthenticationPrincipal AuthenticatedUser u){requireAdmin(u);return service.dashboard();}
    @GetMapping("/users") public List<AdminDto.UserRow> users(@AuthenticationPrincipal AuthenticatedUser u,@RequestParam(defaultValue="") String q,@RequestParam(defaultValue="") String role,@RequestParam(defaultValue="") String status){requireAdmin(u);return service.users(q,role,status);}
    @GetMapping("/students") public List<AdminDto.UserRow> students(@AuthenticationPrincipal AuthenticatedUser u,@RequestParam(defaultValue="") String q,@RequestParam(defaultValue="") String status){requireAdmin(u);return service.students(q,status);}
    @GetMapping("/teachers") public List<AdminDto.UserRow> teachers(@AuthenticationPrincipal AuthenticatedUser u,@RequestParam(defaultValue="") String q,@RequestParam(defaultValue="") String status){requireAdmin(u);return service.teachers(q,status);}
    @GetMapping("/courses") public List<AdminDto.CourseRow> courses(@AuthenticationPrincipal AuthenticatedUser u,@RequestParam(defaultValue="") String q){requireAdmin(u);return service.courses(q);}
    @GetMapping("/exams") public List<AdminDto.ExamRow> exams(@AuthenticationPrincipal AuthenticatedUser u,@RequestParam(defaultValue="") String q,@RequestParam(defaultValue="") String status){requireAdmin(u);return service.exams(q,status);}
    @GetMapping("/sessions") public List<AdminDto.SessionRow> sessions(@AuthenticationPrincipal AuthenticatedUser u,@RequestParam(defaultValue="") String q,@RequestParam(defaultValue="") String status){requireAdmin(u);return service.sessions(q,status);}
    @GetMapping("/attempts") public List<AdminDto.AttemptRow> attempts(@AuthenticationPrincipal AuthenticatedUser u,@RequestParam(defaultValue="") String q,@RequestParam(defaultValue="") String status){requireAdmin(u);return service.attempts(q,status);}
    @GetMapping("/attempts/{id}") public AdminDto.AttemptDetail attempt(@AuthenticationPrincipal AuthenticatedUser u,@PathVariable Long id){requireAdmin(u);return service.attemptDetail(id);}
    @GetMapping("/anti-cheating/{attemptId}") public AdminDto.AntiCheatSummary antiCheat(@AuthenticationPrincipal AuthenticatedUser u,@PathVariable Long attemptId){requireAdmin(u);return service.antiCheat(attemptId);}
    @GetMapping("/audit-logs") public List<AdminDto.AuditRow> auditLogs(@AuthenticationPrincipal AuthenticatedUser u){requireAdmin(u);return service.auditLogs();}
    @PatchMapping("/users/{id}/status") public AdminDto.UserRow updateStatus(@AuthenticationPrincipal AuthenticatedUser u,@PathVariable Long id,@RequestParam String status){requireAdmin(u);return service.updateUserStatus(u.userId(),id,status);}

    private void requireAdmin(AuthenticatedUser u){if(u==null||!"admin".equalsIgnoreCase(u.role()))throw new ApiException(HttpStatus.FORBIDDEN,"Bạn không có quyền quản trị hệ thống");}
}
