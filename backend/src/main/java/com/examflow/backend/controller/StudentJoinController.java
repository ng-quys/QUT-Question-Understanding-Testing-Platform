package com.examflow.backend.controller;

import com.examflow.backend.auth.AuthenticatedUser;
import com.examflow.backend.dto.JoinExamRequest;
import com.examflow.backend.dto.JoinExamResponse;
import com.examflow.backend.dto.ExamSearchResponse;
import com.examflow.backend.entity.ExamSession;
import com.examflow.backend.entity.ExamSessionStudent;
import com.examflow.backend.exception.ApiException;
import com.examflow.backend.repository.ExamSessionRepository;
import com.examflow.backend.repository.ExamSessionStudentRepository;
import com.examflow.backend.repository.ExamAttemptRepository;
import com.examflow.backend.entity.ExamAttempt;
import com.examflow.backend.repository.UserRepository;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.Optional;

@RestController
@RequestMapping("/api/student/exams")
public class StudentJoinController {
    private final ExamSessionRepository sessionRepository;
    private final ExamSessionStudentRepository registrationRepository;
    private final UserRepository userRepository;
    private final ExamAttemptRepository attemptRepository;

    public StudentJoinController(
            ExamSessionRepository sessionRepository,
            ExamSessionStudentRepository registrationRepository,
            UserRepository userRepository,
            ExamAttemptRepository attemptRepository) {
        this.sessionRepository = sessionRepository;
        this.registrationRepository = registrationRepository;
        this.userRepository = userRepository;
        this.attemptRepository = attemptRepository;
    }

    @PostMapping("/search")
    public ExamSearchResponse search(
            @AuthenticationPrincipal AuthenticatedUser user,
            @Valid @RequestBody JoinExamRequest request) {
        Long studentId = studentId(user);
        String code = request.code().trim();

        ExamSession session = sessionRepository.findByExamCode(code)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Không tìm thấy cuộc thi với mã này"));

        var exam = session.getExam();
        var course = exam.getCourse();
        LocalDateTime now = LocalDateTime.now(ZoneId.of("Asia/Ho_Chi_Minh"));
        boolean inWindow = !now.isBefore(session.getStartTime()) && now.isBefore(session.getEndTime());
        boolean activeStatus = "ongoing".equalsIgnoreCase(session.getStatus()) || "scheduled".equalsIgnoreCase(session.getStatus());
        boolean canEnter = inWindow && activeStatus;
        Optional<ExamAttempt> existing = attemptRepository.findByExamSessionIdAndStudentId(studentId, session.getId());
        boolean alreadyAttempted = existing.isPresent();
        String attemptStatus = existing.map(ExamAttempt::getStatus).orElse(null);
        if (alreadyAttempted && ("completed".equalsIgnoreCase(attemptStatus) || "submitted".equalsIgnoreCase(attemptStatus))) {
            canEnter = false;
        }
        String message = alreadyAttempted && "in_progress".equalsIgnoreCase(attemptStatus)
                ? "Bạn đang có bài thi chưa hoàn thành. Có thể tiếp tục bài thi này."
                : canEnter
                    ? "Đã tìm thấy cuộc thi. Kiểm tra thông tin trước khi vào thi."
                    : now.isBefore(session.getStartTime())
                        ? "Cuộc thi chưa bắt đầu."
                        : "Cuộc thi đã kết thúc.";

        return new ExamSearchResponse(
                session.getId(), exam.getId(), exam.getCode(), exam.getTitle(),
                course.getCode(), course.getName(), session.getName(), session.getRoomCode(),
                session.getStartTime(), session.getEndTime(), session.getStatus(),
                exam.getDurationMinutes(), exam.getTotalQuestions(), exam.getTotalPoints(),
                alreadyAttempted, attemptStatus, canEnter, message);
    }

    @PostMapping("/join")
    public JoinExamResponse join(
            @AuthenticationPrincipal AuthenticatedUser user,
            @Valid @RequestBody JoinExamRequest request) {
        Long studentId = studentId(user);
        String code = request.code().trim();

        ExamSession session = sessionRepository.findByExamCode(code)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Mã cuộc thi không tồn tại hoặc đã hết hiệu lực"));

        if (!"scheduled".equalsIgnoreCase(session.getStatus())
                && !"ongoing".equalsIgnoreCase(session.getStatus())) {
            throw new ApiException(HttpStatus.CONFLICT, "Cuộc thi không còn nhận người tham gia");
        }

        var existing = registrationRepository.findByStudentAndSession(studentId, session.getId());
        if (existing.isEmpty()) {
            ExamSessionStudent registration = new ExamSessionStudent();
            registration.setExamSession(session);
            // Load the student through the existing registration query contract.
            // A lightweight reference avoids an additional user lookup.
            registration.setStudent(userRepository.getReferenceById(studentId));
            registration.setStatus("registered");
            registrationRepository.save(registration);
        }

        var exam = session.getExam();
        var course = exam.getCourse();
        return new JoinExamResponse(
                session.getId(), exam.getCode(), exam.getTitle(), course.getCode(), course.getName(),
                session.getRoomCode(), session.getStartTime().toString(), session.getEndTime().toString(),
                existing.isPresent() ? "Bạn đã tham gia cuộc thi này" : "Tham gia cuộc thi thành công"
        );
    }

    private Long studentId(AuthenticatedUser user) {
        if (user == null || !"student".equalsIgnoreCase(user.role())) {
            throw new ApiException(HttpStatus.FORBIDDEN, "Yêu cầu quyền sinh viên");
        }
        return user.userId();
    }
}
