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
    private final com.examflow.backend.service.AdminAccountService accounts;
    public AdminController(AdminService service, com.examflow.backend.service.AntiCheatService antiCheatService, AdminIdentityService identityService, com.examflow.backend.service.AdminAccountService accounts){this.accounts=accounts;this.identityService=identityService;this.service=service;this.antiCheatService=antiCheatService;}
    @GetMapping("/ai-runtime") public tools.jackson.databind.JsonNode runtime(@AuthenticationPrincipal Jwt u){requireAdmin(u);return antiCheatService.runtimeStatus();}
    @jakarta.transaction.Transactional
    @PatchMapping("/exams/{id}/ai-policy") public java.util.Map<String,Object> policy(@AuthenticationPrincipal Jwt u,@PathVariable Long id,@RequestParam boolean enabled){UserEntity admin=requireAdmin(u);var result=antiCheatService.updatePolicy(id,enabled);service.auditPolicy(admin.getId(),id,enabled);return result;}


    @GetMapping("/dashboard") public AdminDto.Dashboard dashboard(@AuthenticationPrincipal Jwt u){requireAdmin(u);return service.dashboard();}
    @GetMapping("/users") public List<AdminDto.UserRow> users(@AuthenticationPrincipal Jwt u,@RequestParam(defaultValue="") String q,@RequestParam(defaultValue="") String role,@RequestParam(defaultValue="") String status){requireAdmin(u);return service.users(q,role,status);}
    @GetMapping("/users/academic-options") public java.util.Map<String,Object> academicOptions(@AuthenticationPrincipal Jwt u){requireAdmin(u);return accounts.academicOptions();}
    @GetMapping("/students") public List<AdminDto.UserRow> students(@AuthenticationPrincipal Jwt u,@RequestParam(defaultValue="") String q,@RequestParam(defaultValue="") String status){requireAdmin(u);return service.students(q,status);}
    @GetMapping("/teachers") public List<AdminDto.UserRow> teachers(@AuthenticationPrincipal Jwt u,@RequestParam(defaultValue="") String q,@RequestParam(defaultValue="") String status){requireAdmin(u);return service.teachers(q,status);}
    @GetMapping("/courses") public List<AdminDto.CourseRow> courses(@AuthenticationPrincipal Jwt u,@RequestParam(defaultValue="") String q){requireAdmin(u);return service.courses(q);}
    @GetMapping("/exams") public List<AdminDto.ExamRow> exams(@AuthenticationPrincipal Jwt u,@RequestParam(defaultValue="") String q,@RequestParam(defaultValue="") String status){requireAdmin(u);return service.exams(q,status);}
    @GetMapping("/sessions") public List<AdminDto.SessionRow> sessions(@AuthenticationPrincipal Jwt u,@RequestParam(defaultValue="") String q,@RequestParam(defaultValue="") String status){requireAdmin(u);return service.sessions(q,status);}
    @GetMapping("/attempts") public List<AdminDto.AttemptRow> attempts(@AuthenticationPrincipal Jwt u,@RequestParam(defaultValue="") String q,@RequestParam(defaultValue="") String status){requireAdmin(u);return service.attempts(q,status);}
    @GetMapping("/attempts/{id}") public AdminDto.AttemptDetail attempt(@AuthenticationPrincipal Jwt u,@PathVariable Long id){requireAdmin(u);return service.attemptDetail(id);}
    @GetMapping("/anti-cheating/{attemptId}") public AdminDto.AntiCheatSummary antiCheat(@AuthenticationPrincipal Jwt u,@PathVariable Long attemptId){requireAdmin(u);return service.antiCheat(attemptId);}
    @GetMapping("/audit-logs") public List<AdminDto.AuditRow> auditLogs(@AuthenticationPrincipal Jwt u){requireAdmin(u);return service.auditLogs();}
    @PatchMapping("/users/{id}/status") public AdminDto.UserRow updateStatus(@AuthenticationPrincipal Jwt u,@PathVariable Long id,@RequestParam String status){return accounts.status(requireAdmin(u).getId(),id,status);}
    @PostMapping("/users") public AdminDto.UserRow create(@AuthenticationPrincipal Jwt u,@jakarta.validation.Valid @RequestBody com.examflow.backend.service.AdminAccountService.Create request){return accounts.create(requireAdmin(u).getId(),request);}
    @PutMapping("/users/{id}") public AdminDto.UserRow edit(@AuthenticationPrincipal Jwt u,@PathVariable Long id,@jakarta.validation.Valid @RequestBody com.examflow.backend.service.AdminAccountService.Edit request){return accounts.edit(requireAdmin(u).getId(),id,request);}
    @PutMapping("/users/{id}/password")
    public java.util.Map<String, String> resetPassword(@AuthenticationPrincipal Jwt u, @PathVariable Long id, @RequestBody java.util.Map<String, String> body) {
        String newPassword = body.get("password");
        accounts.resetPassword(requireAdmin(u).getId(), id, newPassword);
        return java.util.Map.of("message", "Đã đặt lại mật khẩu thành công");
    }
    @PostMapping("/users/{id}/repair-identity") public AdminDto.UserRow repairIdentity(@AuthenticationPrincipal Jwt jwt,@PathVariable Long id){return accounts.repairIdentity(requireAdmin(jwt).getId(),id);}

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
