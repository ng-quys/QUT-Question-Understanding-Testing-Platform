package com.examflow.backend.service;

import java.time.LocalDateTime;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

import com.examflow.backend.dto.CreateExamSessionRequest;
import com.examflow.backend.dto.TeacherExamSessionDto;
import com.examflow.backend.entity.Exam;
import com.examflow.backend.entity.ExamSession;
import com.examflow.backend.entity.ExamSessionStudent;
import com.examflow.backend.entity.UserEntity;
import com.examflow.backend.exception.ApiException;
import com.examflow.backend.repository.ExamAttemptRepository;
import com.examflow.backend.repository.ExamRepository;
import com.examflow.backend.repository.ExamSessionRepository;
import com.examflow.backend.repository.ExamSessionStudentRepository;
import com.examflow.backend.repository.UserRepository;

import jakarta.transaction.Transactional;

@Service
public class TeacherExamSessionService {

    private final ExamSessionRepository sessions;
    private final ExamRepository exams;
    private final UserRepository users;
    private final ExamSessionStudentRepository regs;
    private final ExamAttemptRepository attempts;

    public TeacherExamSessionService(
        ExamSessionRepository sessions,
        ExamRepository exams,
        UserRepository users,
        ExamSessionStudentRepository regs,
        ExamAttemptRepository attempts
    ) {
        this.sessions = sessions;
        this.exams = exams;
        this.users = users;
        this.regs = regs;
        this.attempts = attempts;
    }

    public List<TeacherExamSessionDto> list() {
        return sessions.findAllWithDetails().stream()
            .map(this::dto)
            .toList();
    }

    @Transactional
    public synchronized TeacherExamSessionDto create(CreateExamSessionRequest request) {
        if (request.examId() == null || request.startTime() == null || request.endTime() == null || !request.endTime().isAfter(request.startTime())) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Thời gian ca thi không hợp lệ");
        }

        Exam exam = exams.findById(request.examId())
            .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Không tìm thấy đề thi"));

        String name = request.name() == null || request.name().isBlank() ? exam.getTitle() : request.name().trim();
        if (sessions.existsByExamIdAndNameIgnoreCaseAndStartTimeAndEndTime(exam.getId(), name, request.startTime(), request.endTime())) {
            throw new ApiException(HttpStatus.CONFLICT, "Ca thi này đã được tạo. Vui lòng tải lại danh sách.");
        }
        String room = (request.roomCode() == null || request.roomCode().isBlank())
            ? "EXAM-" + UUID.randomUUID().toString().substring(0, 8).toUpperCase()
            : request.roomCode().trim().toUpperCase();

        if (sessions.existsByRoomCodeIgnoreCase(room)) {
            throw new ApiException(HttpStatus.CONFLICT, "Mã phòng đã tồn tại");
        }

        ExamSession session = new ExamSession();
        session.setExam(exam);
        session.setName(name);
        session.setRoomCode(room);
        session.setAccessCode(room);
        session.setStartTime(request.startTime());
        session.setEndTime(request.endTime());
        session.setStatus(statusFor(request.startTime(), request.endTime()));
        
        session = sessions.save(session);

        if (request.studentIds() != null) {
            for (Long studentId : new LinkedHashSet<>(request.studentIds())) {
                UserEntity student = users.findById(studentId)
                    .orElseThrow(() -> new ApiException(HttpStatus.BAD_REQUEST, "Không tìm thấy sinh viên ID " + studentId));

                if (!"student".equalsIgnoreCase(student.getRole())) {
                    throw new ApiException(HttpStatus.BAD_REQUEST, "User ID " + studentId + " không phải sinh viên");
                }

                ExamSessionStudent registration = new ExamSessionStudent();
                registration.setExamSession(session);
                registration.setStudent(student);
                registration.setStatus("registered");
                regs.save(registration);
            }
        }

        exam.setStatus(request.startTime().isAfter(LocalDateTime.now()) ? "upcoming" : "ongoing");
        exam.setExamDate(request.startTime());
        exams.save(exam);

        return dto(session);
    }

    @Transactional
    public TeacherExamSessionDto setStatus(Long id, String status) {
        if (!Set.of("scheduled", "ongoing", "completed", "cancelled").contains(status)) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Trạng thái không hợp lệ");
        }

        ExamSession session = sessions.findWithDetails(id)
            .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Không tìm thấy ca thi"));

        session.setStatus(status);
        sessions.save(session);

        return dto(session);
    }

    private String statusFor(LocalDateTime startTime, LocalDateTime endTime) {
        LocalDateTime now = LocalDateTime.now();
        if (now.isBefore(startTime)) {
            return "scheduled";
        }
        if (now.isBefore(endTime)) {
            return "ongoing";
        }
        return "completed";
    }

    private TeacherExamSessionDto dto(ExamSession session) {
        return new TeacherExamSessionDto(
            session.getId(),
            session.getExam().getId(),
            session.getExam().getCode(),
            session.getExam().getTitle(),
            session.getExam().getCourse().getCode(),
            session.getExam().getCourse().getName(),
            session.getName(),
            session.getRoomCode(),
            session.getAccessCode(),
            session.getStartTime(),
            session.getEndTime(),
            session.getStatus(),
            regs.countByExamSessionId(session.getId()),
            attempts.countByExamSessionId(session.getId()),
            attempts.countByExamSessionIdAndStatusIn(session.getId(), List.of("submitted", "completed"))
        );
    }
}