package com.examflow.backend.controller;

import com.examflow.backend.auth.AuthenticatedUser;
import com.examflow.backend.dto.*;
import com.examflow.backend.exception.ApiException;
import com.examflow.backend.service.StudentService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/student")
public class StudentController {
    private final StudentService studentService;
    private final com.examflow.backend.service.AntiCheatService antiCheatService;

    public StudentController(StudentService studentService, com.examflow.backend.service.AntiCheatService antiCheatService) {
        this.studentService = studentService;
        this.antiCheatService = antiCheatService;
    }

    @GetMapping("/dashboard")
    public StudentDashboardDto dashboard(@AuthenticationPrincipal AuthenticatedUser user) {
        return studentService.getDashboard(studentId(user));
    }

    @GetMapping("/sessions")
    public List<StudentSessionDto> sessions(@AuthenticationPrincipal AuthenticatedUser user) {
        return studentService.getSessions(studentId(user));
    }

    @PostMapping("/sessions/{sessionId}/start")
    public StudentAttemptDto start(@AuthenticationPrincipal AuthenticatedUser user,
                                   @PathVariable Long sessionId,
                                   @RequestBody(required = false) StartExamRequest request) {
        return studentService.startExamByCode(studentId(user), sessionId, request == null ? null : request.accessCode());
    }

    @GetMapping("/attempts/{attemptId}")
    public StudentAttemptDto attempt(@AuthenticationPrincipal AuthenticatedUser user,
                                     @PathVariable Long attemptId) {
        return studentService.getAttempt(studentId(user), attemptId);
    }

    @PutMapping("/attempts/{attemptId}/answer")
    public ApiMessage saveAnswer(@AuthenticationPrincipal AuthenticatedUser user,
                                 @PathVariable Long attemptId,
                                 @Valid @RequestBody SaveAnswerRequest request) {
        return studentService.saveAnswer(studentId(user), attemptId, request);
    }

    @PostMapping("/attempts/{attemptId}/submit")
    public StudentResultDto submit(@AuthenticationPrincipal AuthenticatedUser user,
                                   @PathVariable Long attemptId,
                                   @Valid @RequestBody SubmitExamRequest request) {
        return studentService.submit(studentId(user), attemptId, request);
    }

    @GetMapping("/attempts/{attemptId}/ai-status")
    public tools.jackson.databind.JsonNode aiStatus(@AuthenticationPrincipal AuthenticatedUser user,
                                                           @PathVariable Long attemptId) {
        return antiCheatService.studentRuntimeStatus(attemptId, studentId(user));
    }

    @GetMapping("/results")
    public List<StudentResultDto> results(@AuthenticationPrincipal AuthenticatedUser user) {
        return studentService.getResults(studentId(user));
    }

    @GetMapping("/results/{attemptId}")
    public StudentResultDto result(@AuthenticationPrincipal AuthenticatedUser user,
                                   @PathVariable Long attemptId) {
        return studentService.getResult(studentId(user), attemptId);
    }

    private Long studentId(AuthenticatedUser user) {
        if (user == null || !"student".equalsIgnoreCase(user.role())) {
            throw new ApiException(HttpStatus.FORBIDDEN, "Yêu cầu quyền sinh viên");
        }
        return user.userId();
    }
}
