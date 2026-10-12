package com.examflow.backend.controller;

import com.examflow.backend.dto.JoinExamRequest;
import com.examflow.backend.dto.JoinExamResponse;
import com.examflow.backend.dto.ExamSearchResponse;
import com.examflow.backend.entity.ExamSession;
import com.examflow.backend.entity.ExamSessionStudent;
import com.examflow.backend.entity.ExamAttempt;
import com.examflow.backend.entity.UserEntity;
import com.examflow.backend.exception.ApiException;
import com.examflow.backend.repository.ExamSessionRepository;
import com.examflow.backend.repository.ExamSessionStudentRepository;
import com.examflow.backend.repository.ExamAttemptRepository;
import com.examflow.backend.service.CurrentUserService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.Comparator;
import java.util.Optional;

@RestController
@RequestMapping("/api/student/exams")
public class StudentJoinController {
    private static final ZoneId APP_ZONE = ZoneId.of("Asia/Ho_Chi_Minh");
    private final ExamSessionRepository sessionRepository;
    private final ExamSessionStudentRepository registrationRepository;
    private final ExamAttemptRepository attemptRepository;
    private final CurrentUserService currentUserService;

    public StudentJoinController(ExamSessionRepository sessionRepository,
            ExamSessionStudentRepository registrationRepository,
            ExamAttemptRepository attemptRepository,
            CurrentUserService currentUserService) {
        this.sessionRepository = sessionRepository;
        this.registrationRepository = registrationRepository;
        this.attemptRepository = attemptRepository;
        this.currentUserService = currentUserService;
    }

    @PostMapping("/search")
    @Transactional(readOnly = true)
    public ExamSearchResponse search(@AuthenticationPrincipal Jwt jwt,
            @Valid @RequestBody JoinExamRequest request) {
        UserEntity student = requireStudent(jwt);
        LocalDateTime now = LocalDateTime.now(APP_ZONE);
        ExamSession session = resolveSession(request.code().trim(), now);
        var exam = session.getExam();
        var course = exam.getCourse();
        Optional<ExamAttempt> existing = attemptRepository.findByExamSessionIdAndStudentId(
                session.getId(), student.getId());
        String status = existing.map(ExamAttempt::getStatus).orElse(null);
        boolean canEnter = withinSession(session, now)
                && existing.map(a -> resumable(a, now)).orElse(true);
        String message;
        if (completed(status)) {
            message = "Bạn đã nộp bài cho ca thi này.";
        } else if (now.isBefore(session.getStartTime())) {
            message = "Cuộc thi chưa bắt đầu.";
        } else if (!now.isBefore(session.getEndTime())) {
            message = "Cuộc thi đã kết thúc.";
        } else if (existing.isPresent() && !resumable(existing.get(), now)) {
            message = "Bài làm không còn có thể tiếp tục hoặc đã hết thời gian.";
        } else if (existing.isPresent()) {
            message = "Bạn có bài thi đang làm dở, có thể tiếp tục.";
        } else {
            message = "Đã tìm thấy cuộc thi. Kiểm tra thông tin trước khi vào thi.";
        }
        return new ExamSearchResponse(session.getId(), exam.getId(), exam.getCode(), exam.getTitle(),
                course.getCode(), course.getName(), session.getName(), session.getRoomCode(),
                session.getStartTime(), session.getEndTime(), session.getStatus(),
                exam.getDurationMinutes(), exam.getTotalQuestions(), exam.getTotalPoints(),
                existing.isPresent(), status, canEnter, requiresPassword(session), message);
    }

    @PostMapping("/join")
    @Transactional
    public JoinExamResponse join(@AuthenticationPrincipal Jwt jwt,
            @Valid @RequestBody JoinExamRequest request) {
        UserEntity student = requireStudent(jwt);
        LocalDateTime now = LocalDateTime.now(APP_ZONE);
        ExamSession session = resolveSession(request.code().trim(), now);
        if (!withinSession(session, now)) {
            throw new ApiException(HttpStatus.CONFLICT,
                    now.isBefore(session.getStartTime()) ? "Cuộc thi chưa bắt đầu" : "Cuộc thi đã kết thúc");
        }
        Optional<ExamAttempt> attempt = attemptRepository.findByExamSessionIdAndStudentId(
                session.getId(), student.getId());
        if (attempt.isPresent() && !resumable(attempt.get(), now)) {
            throw new ApiException(HttpStatus.CONFLICT,
                    completed(attempt.get().getStatus()) ? "Bạn đã nộp bài cho ca thi này" : "Bài làm không còn có thể tiếp tục");
        }
        var existing = registrationRepository.findByStudentAndSession(student.getId(), session.getId());
        if (existing.isEmpty()) {
            ExamSessionStudent registration = new ExamSessionStudent();
            registration.setExamSession(session);
            registration.setStudent(student);
            registration.setStatus("registered");
            registrationRepository.save(registration);
        }
        var exam = session.getExam();
        var course = exam.getCourse();
        return new JoinExamResponse(session.getId(), exam.getCode(), exam.getTitle(),
                course.getCode(), course.getName(), session.getRoomCode(),
                session.getStartTime().toString(), session.getEndTime().toString(),
                existing.isPresent() ? "Bạn đã tham gia cuộc thi này" : "Tham gia cuộc thi thành công");
    }

    private ExamSession resolveSession(String code, LocalDateTime now) {
        var candidates = sessionRepository.findJoinCandidatesByRoomCode(code);
        Comparator<ExamSession> order = Comparator.comparingInt((ExamSession s) ->
                withinSession(s, now) ? 0 : s.getStartTime().isAfter(now) ? 1 : 2)
                .thenComparing(s -> s.getEndTime().isAfter(now) ? s.getStartTime() : LocalDateTime.MAX.minusNanos(1))
                .thenComparing(ExamSession::getEndTime, Comparator.reverseOrder())
                .thenComparing(ExamSession::getId);
        return candidates.stream().min(order).orElseThrow(() -> new ApiException(
                HttpStatus.NOT_FOUND, "Không tìm thấy ca thi nhận người tham gia với mã này"));
    }

    private boolean requiresPassword(ExamSession session) {
        String password = session.getAccessCode();
        return password != null && !password.isBlank()
                && !password.equals(session.getRoomCode());
    }

    private boolean withinSession(ExamSession session, LocalDateTime time) {
        return !time.isBefore(session.getStartTime()) && time.isBefore(session.getEndTime());
    }

    private boolean completed(String status) {
        return "completed".equalsIgnoreCase(status) || "submitted".equalsIgnoreCase(status);
    }

    private boolean resumable(ExamAttempt attempt, LocalDateTime now) {
        if (!"in_progress".equalsIgnoreCase(attempt.getStatus())) return false;
        LocalDateTime durationEnd = attempt.getStartedAt().plusMinutes(attempt.getExam().getDurationMinutes());
        return now.isBefore(durationEnd) && now.isBefore(attempt.getExamSession().getEndTime());
    }

    private UserEntity requireStudent(Jwt jwt) {
        if (jwt == null) throw new ApiException(HttpStatus.UNAUTHORIZED, "Bạn cần đăng nhập");
        UserEntity user = currentUserService.getCurrentUser(jwt);
        if (user == null || !"student".equalsIgnoreCase(user.getRole())) {
            throw new ApiException(HttpStatus.FORBIDDEN, "Yêu cầu quyền sinh viên");
        }
        return user;
    }
}
