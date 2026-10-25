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
import com.examflow.backend.service.AntiCheatService;
import tools.jackson.databind.JsonNode;

import jakarta.validation.Valid;

@RestController
@RequestMapping("/api/student")
public class StudentController {

    private final AntiCheatService antiCheatService;
    private final StudentService studentService;
    private final CurrentUserService currentUserService;

    public StudentController(
            StudentService studentService,
            CurrentUserService currentUserService,
            AntiCheatService antiCheatService
    ) {
        this.antiCheatService = antiCheatService;
        this.studentService = studentService;
        this.currentUserService = currentUserService;
    }

    @GetMapping("/clock") public java.util.Map<String,Object> clock(@AuthenticationPrincipal Jwt jwt){studentId(jwt);return java.util.Map.of("serverTime",java.time.Instant.now());}

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

    public record CameraImage(String jpeg){}
    public record CameraDevice(boolean available,String reason){}
    public record CameraProof(String verificationToken){}
    @PostMapping("/attempts/{id}/offline-grant") public com.examflow.backend.service.OfflineSubmissionService.Grant offlineGrant(@AuthenticationPrincipal Jwt jwt,@PathVariable long id){return studentService.offlineGrant(studentId(jwt),id);}
    @PostMapping("/attempts/{id}/offline-evidence") public com.examflow.backend.service.OfflineEvidenceService.Receipt offlineEvidence(@AuthenticationPrincipal Jwt jwt,@PathVariable long id,@RequestBody com.examflow.backend.service.OfflineEvidenceService.Capture frame){return studentService.uploadOfflineEvidence(studentId(jwt),id,frame);}
    @PostMapping("/attempts/{id}/offline-evidence/finish") public ApiMessage finishOfflineEvidence(@AuthenticationPrincipal Jwt jwt,@PathVariable long id,@RequestBody com.examflow.backend.service.OfflineEvidenceService.Finish manifest){studentService.finishOfflineEvidence(studentId(jwt),id,manifest);return new ApiMessage("Đã nhận đủ ảnh thiết bị báo cáo.");}
    @PostMapping("/attempts/{id}/offline-submit") public StudentResultDto offlineSubmit(@AuthenticationPrincipal Jwt jwt,@PathVariable long id,@Valid @RequestBody com.examflow.backend.dto.OfflineSubmissionRequest request){return studentService.submitOffline(studentId(jwt),id,request);}
    @PostMapping("/attempts/{id}/camera-restore") public com.examflow.backend.service.CameraVerificationService.CameraHealth restoreCamera(@AuthenticationPrincipal Jwt jwt,@PathVariable long id,@RequestBody CameraProof proof){return studentService.restoreCamera(studentId(jwt),id,proof.verificationToken());}
    @GetMapping("/sessions/{id}/camera-check") public java.util.Map<String,Object> cameraRequirements(@AuthenticationPrincipal Jwt jwt,@PathVariable long id){return studentService.cameraRequirements(studentId(jwt),id);}
    @PostMapping("/sessions/{id}/camera-check") public com.examflow.backend.service.CameraVerificationService.Result cameraCheck(@AuthenticationPrincipal Jwt jwt,@PathVariable long id,@RequestBody CameraImage image){return studentService.checkCamera(studentId(jwt),id,image.jpeg());}
    @PostMapping("/attempts/{id}/camera-health") public com.examflow.backend.service.CameraVerificationService.CameraHealth cameraHealth(@AuthenticationPrincipal Jwt jwt,@PathVariable long id,@RequestBody CameraDevice device){return studentService.cameraHealth(studentId(jwt),id,device.available(),device.reason());}

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

    @GetMapping("/attempts/{attemptId}/ai-status")
    public JsonNode aiStatus(@AuthenticationPrincipal Jwt jwt, @PathVariable Long attemptId) {
        return antiCheatService.studentRuntimeStatus(attemptId, studentId(jwt));
    }

    @PostMapping("/attempts/{attemptId}/ai-frame")
    public JsonNode frame(@AuthenticationPrincipal Jwt jwt,@PathVariable Long attemptId,@RequestBody com.examflow.backend.service.BatchMonitoringService.Frame frame){
        return antiCheatService.cameraFrame(attemptId,studentId(jwt),frame);
    }
    @PostMapping("/attempts/{attemptId}/ai-reconnect")
    public void reconnect(@AuthenticationPrincipal Jwt jwt,@PathVariable Long attemptId){antiCheatService.reconnect(attemptId,studentId(jwt));}

    private Long studentId(Jwt jwt) {
        if (jwt == null) {
            throw new ApiException(HttpStatus.UNAUTHORIZED, "Bạn cần đăng nhập");
        }
        UserEntity user = currentUserService.getCurrentUser(jwt);
        if (user == null || !"student".equalsIgnoreCase(user.getRole())) {
            throw new ApiException(HttpStatus.FORBIDDEN, "Yêu cầu quyền sinh viên");
        }
        return user.getId();
    }
}
