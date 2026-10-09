package com.examflow.backend.service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.stream.Collectors;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

import com.examflow.backend.dto.ApiMessage;
import com.examflow.backend.dto.CloAchievementDto;
import com.examflow.backend.dto.ExamOptionDto;
import com.examflow.backend.dto.ExamQuestionDto;
import com.examflow.backend.dto.SaveAnswerRequest;
import com.examflow.backend.dto.StartExamRequest;
import com.examflow.backend.dto.StudentAttemptDto;
import com.examflow.backend.dto.StudentDashboardDto;
import com.examflow.backend.dto.StudentResultDto;
import com.examflow.backend.dto.StudentSessionDto;
import com.examflow.backend.dto.SubmitExamRequest;
import com.examflow.backend.entity.Answer;
import com.examflow.backend.entity.Clo;
import com.examflow.backend.entity.Exam;
import com.examflow.backend.entity.ExamAttempt;
import com.examflow.backend.entity.ExamQuestion;
import com.examflow.backend.entity.ExamSession;
import com.examflow.backend.entity.ExamSessionStudent;
import com.examflow.backend.entity.StudentAnswer;
import com.examflow.backend.entity.UserEntity;
import com.examflow.backend.exception.ApiException;
import com.examflow.backend.repository.AnswerRepository;
import com.examflow.backend.repository.ExamAttemptRepository;
import com.examflow.backend.repository.ExamQuestionRepository;
import com.examflow.backend.repository.ExamSessionStudentRepository;
import com.examflow.backend.repository.ExamSessionRepository;
import com.examflow.backend.repository.StudentAnswerRepository;
import com.examflow.backend.repository.UserRepository;

import jakarta.transaction.Transactional;
@Service
public class StudentService {
    private final UserRepository userRepository;
    private final ExamSessionStudentRepository registrationRepository;
    private final ExamSessionRepository sessionRepository;
    private final ExamAttemptRepository attemptRepository;
    private final ExamQuestionRepository examQuestionRepository;
    private final AnswerRepository answerRepository;
    private final StudentAnswerRepository studentAnswerRepository;
    private final AntiCheatService antiCheatService;

    public StudentService(
            UserRepository userRepository,
            ExamSessionStudentRepository registrationRepository,
            ExamSessionRepository sessionRepository,
            ExamAttemptRepository attemptRepository,
            ExamQuestionRepository examQuestionRepository,
            AnswerRepository answerRepository,
            StudentAnswerRepository studentAnswerRepository,
            AntiCheatService antiCheatService) {
        this.userRepository = userRepository;
        this.registrationRepository = registrationRepository;
        this.sessionRepository = sessionRepository;
        this.attemptRepository = attemptRepository;
        this.examQuestionRepository = examQuestionRepository;
        this.answerRepository = answerRepository;
        this.studentAnswerRepository = studentAnswerRepository;
        this.antiCheatService = antiCheatService;
    }

    @Transactional
    public StudentDashboardDto getDashboard(Long studentId) {
        UserEntity student = requireStudent(studentId);
        List<StudentSessionDto> sessions = getSessions(studentId);
        List<StudentResultDto> results = getResults(studentId);

        long completed = results.size();
        BigDecimal avg = results.stream()
                .map(StudentResultDto::score)
                .filter(Objects::nonNull)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        if (!results.isEmpty()) {
            avg = avg.divide(BigDecimal.valueOf(results.size()), 2, RoundingMode.HALF_UP);
        }

        return new StudentDashboardDto(
                student.getId(), student.getFullName(), student.getEmail(), student.getDepartment(),
                0, 0, completed, avg, sessions, results.stream().limit(5).toList()
        );
    }

    /**
     * Student history only: return sessions that have a completed/submitted attempt.
     * Upcoming/ongoing sessions are intentionally not exposed in the portal list.
     */
    @Transactional
    public List<StudentSessionDto> getSessions(Long studentId) {
        requireStudent(studentId);
        Map<Long, ExamSessionStudent> registrationBySession = registrationRepository
                .findAllByStudentIdWithDetails(studentId).stream()
                .collect(Collectors.toMap(r -> r.getExamSession().getId(), r -> r, (a, b) -> a));

        return attemptRepository.findAllByStudentIdWithDetails(studentId).stream()
                .filter(a -> "completed".equalsIgnoreCase(a.getStatus()) || "submitted".equalsIgnoreCase(a.getStatus()))
                .map(a -> {
                    ExamSession session = a.getExamSession();
                    Exam exam = a.getExam();
                    ExamSessionStudent reg = registrationBySession.get(session.getId());
                    return new StudentSessionDto(
                            session.getId(), exam.getId(), exam.getCode(), exam.getTitle(),
                            exam.getCourse().getCode(), exam.getCourse().getName(), session.getRoomCode(),
                            session.getStartTime(), session.getEndTime(), session.getStatus(),
                            reg == null ? "completed" : reg.getStatus(), exam.getDurationMinutes(),
                            exam.getTotalQuestions(), exam.getTotalPoints(), a.getId(), a.getStatus(), a.getScore(),
                            false, false
                    );
                }).toList();
    }

    @Transactional
    public StudentAttemptDto startExam(Long studentId, Long sessionId, StartExamRequest request) {
        UserEntity student = requireStudent(studentId);
        ExamSession session = registrationRepository.findRegistration(studentId, sessionId)
                .map(ExamSessionStudent::getExamSession)
                .orElseThrow(() -> new ApiException(HttpStatus.FORBIDDEN, "Bạn chưa tham gia cuộc thi này"));
        return startExamWithSession(student, session, request);
    }

    /** Starts an attempt after the access code has been verified. Registration is created lazily. */
    @Transactional
    public StudentAttemptDto startExamByCode(Long studentId, Long sessionId, String joinCode) {
        UserEntity student = requireStudent(studentId);
        ExamSession session = sessionRepository.findById(sessionId)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Không tìm thấy ca thi"));

        String normalizedCode = joinCode == null ? "" : joinCode.trim();
        if (normalizedCode.isBlank() || session.getExam() == null
                || session.getExam().getCode() == null
                || !session.getExam().getCode().trim().equalsIgnoreCase(normalizedCode)) {
            throw new ApiException(HttpStatus.FORBIDDEN, "Mã cuộc thi không khớp với ca thi này");
        }

        return startExamWithSessionAndRegistration(student, session, normalizedCode);
    }

    private StudentAttemptDto startExamWithSession(UserEntity student, ExamSession session, StartExamRequest request) {
        String supplied = request == null ? null : request.accessCode();
        return startExamWithSessionAndRegistration(student, session, supplied);
    }

    private StudentAttemptDto startExamWithSessionAndRegistration(UserEntity student, ExamSession session, String supplied) {
        Exam exam = session.getExam();
        LocalDateTime now = now();
        if (!isWithinSession(session, now)) {
            throw new ApiException(HttpStatus.CONFLICT, now.isBefore(session.getStartTime())
                    ? "Cuộc thi chưa bắt đầu" : "Cuộc thi đã kết thúc");
        }

        antiCheatService.lockPolicy(exam.getId());
        Optional<ExamAttempt> existing = attemptRepository.findByExamSessionIdAndStudentId(session.getId(), student.getId());
        if (existing.isPresent()) {
            ExamAttempt a = existing.get();
            if ("completed".equalsIgnoreCase(a.getStatus()) || "submitted".equalsIgnoreCase(a.getStatus())) {
                throw new ApiException(HttpStatus.CONFLICT, "Bạn đã nộp bài cho ca thi này");
            }
            if (effectiveEnd(a).isAfter(now)) {
                if (antiCheatService.isRequired(exam.getId())) {
                    antiCheatService.startSession(a.getId(), student.getId());
                }
                if (!effectiveEnd(a).isAfter(now())) {
                    antiCheatService.stopSession(a.getId());
                    throw new ApiException(HttpStatus.CONFLICT, "Thời gian làm bài đã kết thúc trong lúc kết nối AI");
                }
                return buildAttemptDto(a);
            }
            finalizeAttempt(a);
            throw new ApiException(HttpStatus.CONFLICT, "Thời gian làm bài của bài thi trước đã kết thúc");
        }

        ExamSessionStudent reg = registrationRepository.findByStudentAndSession(student.getId(), session.getId())
                .orElseGet(() -> {
                    ExamSessionStudent created = new ExamSessionStudent();
                    created.setExamSession(session);
                    created.setStudent(student);
                    created.setStatus("registered");
                    return registrationRepository.save(created);
                });

        ExamAttempt attempt = new ExamAttempt();
        attempt.setExamSession(session);
        attempt.setExam(exam);
        attempt.setStudent(reg.getStudent());
        attempt.setStartedAt(now);
        attempt.setStatus("in_progress");
        attempt = attemptRepository.save(attempt);
        if (antiCheatService.isRequired(exam.getId())) {
            try {
                antiCheatService.startSession(attempt.getId(), student.getId(), true);
                if (!isWithinSession(session, now())) {
                    antiCheatService.stopSession(attempt.getId());
                    throw new ApiException(HttpStatus.CONFLICT, "Ca thi đã kết thúc trong lúc chuẩn bị AI");
                }
            } catch (RuntimeException e) {
                // Session may have started even when the HTTP response was lost.
                antiCheatService.stopSession(attempt.getId());
                throw e;
            }
        }
        // New attempts start counting only after the readiness handshake.
        attempt.setStartedAt(now());
        attemptRepository.save(attempt);
        return buildAttemptDto(attempt);
    }

    @Transactional
    public StudentAttemptDto getAttempt(Long studentId, Long attemptId) {
        ExamAttempt attempt = attemptRepository.findOwnedAttempt(attemptId, studentId)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Không tìm thấy bài làm"));
        return buildAttemptDto(attempt);
    }

    @Transactional
    public ApiMessage saveAnswer(Long studentId, Long attemptId, SaveAnswerRequest request) {
        ExamAttempt attempt = requireInProgressAttempt(studentId, attemptId);
        saveAnswerInternal(attempt, request);
        return new ApiMessage("Đã lưu câu trả lời");
    }

    private void saveAnswerInternal(ExamAttempt attempt, SaveAnswerRequest request) {
        ExamQuestion eq = examQuestionRepository.findByExamIdWithQuestion(attempt.getExam().getId()).stream()
                .filter(x -> x.getQuestion().getId().equals(request.questionId()))
                .findFirst()
                .orElseThrow(() -> new ApiException(HttpStatus.BAD_REQUEST, "Câu hỏi không thuộc đề thi này"));
        Answer selected = answerRepository.findByIdAndQuestionId(request.answerId(), request.questionId())
                .orElseThrow(() -> new ApiException(HttpStatus.BAD_REQUEST, "Đáp án không thuộc câu hỏi"));

        StudentAnswer answer = studentAnswerRepository.findByAttemptIdAndQuestionId(attempt.getId(), request.questionId())
                .orElseGet(StudentAnswer::new);
        answer.setAttempt(attempt);
        answer.setQuestion(eq.getQuestion());
        answer.setSelectedAnswer(selected);
        answer.setCorrect(selected.getCorrect());
        answer.setPointsAwarded(Boolean.TRUE.equals(selected.getCorrect()) ? eq.getPoints() : BigDecimal.ZERO);
        answer.setAnsweredAt(now());
        studentAnswerRepository.save(answer);
    }

    @Transactional
    public StudentResultDto submit(Long studentId, Long attemptId, SubmitExamRequest request) {
        ExamAttempt attempt = attemptRepository.findOwnedAttempt(attemptId, studentId)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Không tìm thấy bài làm"));
        if ("completed".equalsIgnoreCase(attempt.getStatus()) || "submitted".equalsIgnoreCase(attempt.getStatus())) {
            return getResult(studentId, attemptId);
        }
        if (!"in_progress".equalsIgnoreCase(attempt.getStatus())) {
            throw new ApiException(HttpStatus.CONFLICT, "Bài thi không còn ở trạng thái đang làm");
        }
        if (request != null && request.answers() != null) {
            for (SaveAnswerRequest item : request.answers()) {
                // Final submission is allowed at the exact deadline. Persist the
                // submitted selections without applying the normal save-answer
                // time guard again.
                saveAnswerInternal(attempt, item);
            }
        }

        List<ExamQuestion> examQuestions = examQuestionRepository.findByExamIdWithQuestion(attempt.getExam().getId());
        List<StudentAnswer> saved = studentAnswerRepository.findByAttemptIdWithDetails(attemptId);
        Map<Long, StudentAnswer> byQuestion = saved.stream()
                .collect(Collectors.toMap(sa -> sa.getQuestion().getId(), sa -> sa, (a, b) -> a));

        BigDecimal score = BigDecimal.ZERO;
        for (ExamQuestion eq : examQuestions) {
            StudentAnswer sa = byQuestion.get(eq.getQuestion().getId());
            if (sa != null && Boolean.TRUE.equals(sa.getCorrect())) {
                score = score.add(eq.getPoints());
            }
        }
        attempt.setScore(score.setScale(2, RoundingMode.HALF_UP));
        attempt.setSubmittedAt(LocalDateTime.now(
    ZoneId.of("Asia/Ho_Chi_Minh")
));
        attempt.setStatus("completed");
        attemptRepository.save(attempt);
        antiCheatService.stopSession(attempt.getId());
        return buildResultDto(attempt, examQuestions, saved);
    }

    @Transactional
    public List<StudentResultDto> getResults(Long studentId) {
        requireStudent(studentId);
        return attemptRepository.findAllByStudentIdWithDetails(studentId).stream()
                .filter(a -> "completed".equalsIgnoreCase(a.getStatus()) || "submitted".equalsIgnoreCase(a.getStatus()))
                .map(a -> buildResultDto(
                        a,
                        examQuestionRepository.findByExamIdWithQuestion(a.getExam().getId()),
                        studentAnswerRepository.findByAttemptIdWithDetails(a.getId())
                ))
                .toList();
    }

    @Transactional
    public StudentResultDto getResult(Long studentId, Long attemptId) {
        ExamAttempt attempt = attemptRepository.findOwnedAttempt(attemptId, studentId)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Không tìm thấy kết quả"));
        if (!("completed".equalsIgnoreCase(attempt.getStatus()) || "submitted".equalsIgnoreCase(attempt.getStatus()))) {
            throw new ApiException(HttpStatus.CONFLICT, "Bài thi chưa được nộp");
        }
        return buildResultDto(
                attempt,
                examQuestionRepository.findByExamIdWithQuestion(attempt.getExam().getId()),
                studentAnswerRepository.findByAttemptIdWithDetails(attemptId)
        );
    }

    private UserEntity requireStudent(Long studentId) {
        UserEntity user = userRepository.findById(studentId)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Không tìm thấy sinh viên"));
        if (!"student".equalsIgnoreCase(user.getRole())) {
            throw new ApiException(HttpStatus.FORBIDDEN, "Tài khoản không phải sinh viên");
        }
        return user;
    }

    private ExamAttempt requireInProgressAttempt(Long studentId, Long attemptId) {
        ExamAttempt attempt = attemptRepository.findOwnedAttempt(attemptId, studentId)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Không tìm thấy bài làm"));
        if (!"in_progress".equalsIgnoreCase(attempt.getStatus())) {
            throw new ApiException(HttpStatus.CONFLICT, "Bài thi không còn ở trạng thái đang làm");
        }
        if (!effectiveEnd(attempt).isAfter(now())) {
            throw new ApiException(HttpStatus.CONFLICT, "Thời gian làm bài đã kết thúc");
        }
        return attempt;
    }

    private static final ZoneId APP_ZONE = ZoneId.of("Asia/Ho_Chi_Minh");

    private LocalDateTime now() {
        return LocalDateTime.now(APP_ZONE);
    }

    private boolean isWithinSession(ExamSession session, LocalDateTime time) {
        return !time.isBefore(session.getStartTime()) && time.isBefore(session.getEndTime());
    }

    private LocalDateTime effectiveEnd(ExamAttempt attempt) {
        LocalDateTime byDuration = attempt.getStartedAt().plusMinutes(attempt.getExam().getDurationMinutes());
        LocalDateTime sessionEnd = attempt.getExamSession().getEndTime();
        return byDuration.isBefore(sessionEnd) ? byDuration : sessionEnd;
    }

    private void finalizeAttempt(ExamAttempt attempt) {
        List<ExamQuestion> questions = examQuestionRepository.findByExamIdWithQuestion(attempt.getExam().getId());
        List<StudentAnswer> saved = studentAnswerRepository.findByAttemptIdWithDetails(attempt.getId());
        BigDecimal score = saved.stream()
                .filter(sa -> Boolean.TRUE.equals(sa.getCorrect()))
                .map(StudentAnswer::getPointsAwarded)
                .filter(Objects::nonNull)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        attempt.setScore(score.setScale(2, RoundingMode.HALF_UP));
        attempt.setSubmittedAt(now());
        attempt.setStatus("completed");
        attemptRepository.save(attempt);
        antiCheatService.stopSession(attempt.getId());
    }

    private StudentAttemptDto buildAttemptDto(ExamAttempt attempt) {
        Map<Long, StudentAnswer> existing = studentAnswerRepository.findByAttemptIdWithDetails(attempt.getId()).stream()
                .collect(Collectors.toMap(sa -> sa.getQuestion().getId(), sa -> sa, (a, b) -> a));
        List<ExamQuestionDto> questions = examQuestionRepository.findByExamIdWithQuestion(attempt.getExam().getId()).stream()
                .map(eq -> {
                    List<ExamOptionDto> options = answerRepository.findByQuestionIdOrderByPositionAsc(eq.getQuestion().getId())
                            .stream().map(a -> new ExamOptionDto(a.getId(), a.getLabel(), a.getContent())).toList();
                    StudentAnswer saved = existing.get(eq.getQuestion().getId());
                    return new ExamQuestionDto(
                            eq.getQuestion().getId(), eq.getPosition(), eq.getQuestion().getContent(), eq.getPoints(),
                            eq.getQuestion().getClo() == null ? null : eq.getQuestion().getClo().getCode(),
                            options, saved == null || saved.getSelectedAnswer() == null ? null : saved.getSelectedAnswer().getId()
                    );
                }).toList();
        Exam exam = attempt.getExam();
        return new StudentAttemptDto(
                attempt.getId(), attempt.getExamSession().getId(), exam.getId(), exam.getCode(), exam.getTitle(),
                exam.getCourse().getCode(), exam.getCourse().getName(), exam.getDurationMinutes(), exam.getTotalPoints(),
                attempt.getStartedAt(), effectiveEnd(attempt), attempt.getStatus(), questions
        );
    }

    private StudentResultDto buildResultDto(ExamAttempt attempt, List<ExamQuestion> examQuestions, List<StudentAnswer> savedAnswers) {
        int correct = (int) savedAnswers.stream().filter(sa -> Boolean.TRUE.equals(sa.getCorrect())).count();
        Map<Long, List<StudentAnswer>> byClo = savedAnswers.stream()
                .filter(sa -> sa.getQuestion().getClo() != null)
                .collect(Collectors.groupingBy(sa -> sa.getQuestion().getClo().getId()));
        List<CloAchievementDto> cloAchievement = byClo.values().stream().map(items -> {
            Clo clo = items.get(0).getQuestion().getClo();
            int answered = items.size();
            int correctCount = (int) items.stream().filter(sa -> Boolean.TRUE.equals(sa.getCorrect())).count();
            double percent = answered == 0 ? 0.0 : Math.round((correctCount * 10000.0 / answered)) / 100.0;
            return new CloAchievementDto(clo.getId(), clo.getCode(), clo.getDescription(), answered, correctCount, percent);
        }).sorted(Comparator.comparing(CloAchievementDto::cloCode)).toList();

        Exam exam = attempt.getExam();
        return new StudentResultDto(
                attempt.getId(), exam.getId(), exam.getCode(), exam.getTitle(), exam.getCourse().getCode(), exam.getCourse().getName(),
                attempt.getScore() == null ? BigDecimal.ZERO : attempt.getScore(), exam.getTotalPoints(), attempt.getSubmittedAt(),
                attempt.getStatus(), correct, examQuestions.size(), cloAchievement
        );
    }
}
