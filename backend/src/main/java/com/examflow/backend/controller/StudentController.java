package com.examflow.backend.controller;

import java.util.List;

import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.examflow.backend.dto.ApiMessage;
import com.examflow.backend.dto.SaveAnswerRequest;
import com.examflow.backend.dto.StartExamRequest;
import com.examflow.backend.dto.StudentAttemptDto;
import com.examflow.backend.dto.StudentDashboardDto;
import com.examflow.backend.dto.StudentResultDto;
import com.examflow.backend.dto.StudentSessionDto;
import com.examflow.backend.dto.SubmitExamRequest;
import com.examflow.backend.entity.UserEntity;
import com.examflow.backend.exception.ApiException;
import com.examflow.backend.service.CurrentUserService;
import com.examflow.backend.service.StudentService;

import jakarta.validation.Valid;

@RestController
@RequestMapping("/api/student")
public class StudentController {

    private final StudentService studentService;
    private final CurrentUserService currentUserService;

    public StudentController(
            StudentService studentService,
            CurrentUserService currentUserService
    ) {
        this.studentService = studentService;
        this.currentUserService = currentUserService;
    }

    @GetMapping("/dashboard")
    public StudentDashboardDto dashboard(
            @AuthenticationPrincipal Jwt jwt
    ) {
        return studentService.getDashboard(
                studentId(jwt)
        );
    }

    @GetMapping("/sessions")
    public List<StudentSessionDto> sessions(
            @AuthenticationPrincipal Jwt jwt
    ) {
        return studentService.getSessions(
                studentId(jwt)
        );
    }

    @PostMapping("/sessions/{sessionId}/start")
    public StudentAttemptDto start(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable Long sessionId,
            @RequestBody(required = false)
            StartExamRequest request
    ) {
        return studentService.startExam(
                studentId(jwt),
                sessionId,
                request
        );
    }

    @GetMapping("/attempts/{attemptId}")
    public StudentAttemptDto attempt(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable Long attemptId
    ) {
        return studentService.getAttempt(
                studentId(jwt),
                attemptId
        );
    }

    @PutMapping("/attempts/{attemptId}/answer")
    public ApiMessage saveAnswer(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable Long attemptId,
            @Valid @RequestBody
            SaveAnswerRequest request
    ) {
        return studentService.saveAnswer(
                studentId(jwt),
                attemptId,
                request
        );
    }

    @PostMapping("/attempts/{attemptId}/submit")
    public StudentResultDto submit(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable Long attemptId,
            @Valid @RequestBody
            SubmitExamRequest request
    ) {
        return studentService.submit(
                studentId(jwt),
                attemptId,
                request
        );
    }

    @GetMapping("/results")
    public List<StudentResultDto> results(
            @AuthenticationPrincipal Jwt jwt
    ) {
        return studentService.getResults(
                studentId(jwt)
        );
    }

    @GetMapping("/results/{attemptId}")
    public StudentResultDto result(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable Long attemptId
    ) {
        return studentService.getResult(
                studentId(jwt),
                attemptId
        );
    }

   private Long studentId(Jwt jwt) {

    System.out.println("JWT SUB = " + jwt.getSubject());

    UserEntity user =
            currentUserService.getCurrentUser(jwt);

    System.out.println("DB USER ID = " + user.getId());
    System.out.println("DB EMAIL = " + user.getEmail());
    System.out.println("DB ROLE = [" + user.getRole() + "]");

    if (!"student".equalsIgnoreCase(user.getRole())) {
        throw new ApiException(
                HttpStatus.FORBIDDEN,
                "Yêu cầu quyền sinh viên"
        );
    }

    return user.getId();
}
}