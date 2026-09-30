package com.examflow.backend.service;

import com.examflow.backend.dto.*;
import com.examflow.backend.entity.*;
import com.examflow.backend.exception.ApiException;
import com.examflow.backend.repository.*;
import jakarta.transaction.Transactional;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDateTime;
import java.util.*;
import java.util.stream.Collectors;

@Service
public class StudentService {
    private final UserRepository userRepository;
    private final ExamSessionStudentRepository registrationRepository;
    private final ExamAttemptRepository attemptRepository;
    private final ExamQuestionRepository examQuestionRepository;
    private final AnswerRepository answerRepository;
    private final StudentAnswerRepository studentAnswerRepository;

    public StudentService(
            UserRepository userRepository,
            ExamSessionStudentRepository registrationRepository,
            ExamAttemptRepository attemptRepository,
            ExamQuestionRepository examQuestionRepository,
            AnswerRepository answerRepository,
            StudentAnswerRepository studentAnswerRepository) {
        this.userRepository = userRepository;
        this.registrationRepository = registrationRepository;
        this.attemptRepository = attemptRepository;
        this.examQuestionRepository = examQuestionRepository;
        this.answerRepository = answerRepository;
        this.studentAnswerRepository = studentAnswerRepository;
    }

    @Transactional
    public StudentDashboardDto getDashboard(Long studentId) {
        UserEntity student = requireStudent(studentId);
        List<StudentSessionDto> sessions = getSessions(studentId);
        List<StudentResultDto> results = getResults(studentId);

        long upcoming = sessions.stream().filter(s -> "scheduled".equalsIgnoreCase(s.sessionStatus())).count();
        long ongoing = sessions.stream().filter(s -> "ongoing".equalsIgnoreCase(s.sessionStatus())).count();
        long completed = results.stream().filter(r -> "completed".equalsIgnoreCase(r.status())).count();
        BigDecimal avg = results.stream()
                .map(StudentResultDto::score)
                .filter(Objects::nonNull)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        if (!results.isEmpty()) {
            avg = avg.divide(BigDecimal.valueOf(results.size()), 2, RoundingMode.HALF_UP);
        }

        return new StudentDashboardDto(
                student.getId(), student.getFullName(), student.getEmail(), student.getDepartment(),
                upcoming, ongoing, completed, avg,
                sessions, results.stream().limit(5).toList()
        );
    }

    @Transactional
    public List<StudentSessionDto> getSessions(Long studentId) {
        requireStudent(studentId);
        Map<Long, ExamAttempt> attemptBySession = attemptRepository.findAllByStudentIdWithDetails(studentId)
                .stream().collect(Collectors.toMap(a -> a.getExamSession().getId(), a -> a, (a, b) -> a));

        LocalDateTime now = LocalDateTime.now();
        return registrationRepository.findAllByStudentIdWithDetails(studentId).stream()
                .map(reg -> {
                    ExamSession s = reg.getExamSession();
                    Exam e = s.getExam();
                    ExamAttempt a = attemptBySession.get(s.getId());
                    boolean inWindow = !now.isBefore(s.getStartTime()) && now.isBefore(s.getEndTime());
                    boolean canStart = ("ongoing".equalsIgnoreCase(s.getStatus()) || inWindow)
                            && (a == null || "in_progress".equalsIgnoreCase(a.getStatus()));
                    return new StudentSessionDto(
                            s.getId(), e.getId(), e.getCode(), e.getTitle(), e.getCourse().getCode(), e.getCourse().getName(),
                            s.getRoomCode(), s.getStartTime(), s.getEndTime(), s.getStatus(), reg.getStatus(),
                            e.getDurationMinutes(), e.getTotalQuestions(), e.getTotalPoints(),
                            a == null ? null : a.getId(), a == null ? null : a.getStatus(), a == null ? null : a.getScore(),
                            canStart, s.getAccessCode() != null && !s.getAccessCode().isBlank()
                    );
                }).toList();
    }

    @Transactional
    public StudentAttemptDto startExam(Long studentId, Long sessionId, StartExamRequest request) {
        requireStudent(studentId);
        ExamSessionStudent reg = registrationRepository.findRegistration(studentId, sessionId)
                .orElseThrow(() -> new ApiException(HttpStatus.FORBIDDEN, "Bạn không được đăng ký trong ca thi này"));

        ExamSession session = reg.getExamSession();
        Exam exam = session.getExam();
        Optional<ExamAttempt> existing = attemptRepository.findByExamSessionIdAndStudentId(sessionId, studentId);
        if (existing.isPresent()) {
            ExamAttempt a = existing.get();
            if ("completed".equalsIgnoreCase(a.getStatus()) || "submitted".equalsIgnoreCase(a.getStatus())) {
                throw new ApiException(HttpStatus.CONFLICT, "Bạn đã nộp bài cho ca thi này");
            }
            return buildAttemptDto(a);
        }

        LocalDateTime now = LocalDateTime.now();
        boolean inWindow = !now.isBefore(session.getStartTime()) && now.isBefore(session.getEndTime());
        if (!("ongoing".equalsIgnoreCase(session.getStatus()) || inWindow)) {
            throw new ApiException(HttpStatus.CONFLICT, "Ca thi chưa mở hoặc đã kết thúc");
        }
        if (session.getAccessCode() != null && !session.getAccessCode().isBlank()) {
            String supplied = request == null ? null : request.accessCode();
            if (!session.getAccessCode().equals(supplied)) {
                throw new ApiException(HttpStatus.FORBIDDEN, "Mã truy cập ca thi không đúng");
            }
        }

        ExamAttempt attempt = new ExamAttempt();
        attempt.setExamSession(session);
        attempt.setExam(exam);
        attempt.setStudent(reg.getStudent());
        attempt.setStartedAt(now);
        attempt.setStatus("in_progress");
        attempt = attemptRepository.save(attempt);
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
        ExamQuestion eq = examQuestionRepository.findByExamIdWithQuestion(attempt.getExam().getId()).stream()
                .filter(x -> x.getQuestion().getId().equals(request.questionId()))
                .findFirst()
                .orElseThrow(() -> new ApiException(HttpStatus.BAD_REQUEST, "Câu hỏi không thuộc đề thi này"));
        Answer selected = answerRepository.findByIdAndQuestionId(request.answerId(), request.questionId())
                .orElseThrow(() -> new ApiException(HttpStatus.BAD_REQUEST, "Đáp án không thuộc câu hỏi"));

        StudentAnswer answer = studentAnswerRepository.findByAttemptIdAndQuestionId(attemptId, request.questionId())
                .orElseGet(StudentAnswer::new);
        answer.setAttempt(attempt);
        answer.setQuestion(eq.getQuestion());
        answer.setSelectedAnswer(selected);
        answer.setCorrect(selected.getCorrect());
        answer.setPointsAwarded(Boolean.TRUE.equals(selected.getCorrect()) ? eq.getPoints() : BigDecimal.ZERO);
        answer.setAnsweredAt(LocalDateTime.now());
        studentAnswerRepository.save(answer);
        return new ApiMessage("Đã lưu câu trả lời");
    }

    @Transactional
    public StudentResultDto submit(Long studentId, Long attemptId, SubmitExamRequest request) {
        ExamAttempt attempt = requireInProgressAttempt(studentId, attemptId);
        if (request != null && request.answers() != null) {
            for (SaveAnswerRequest item : request.answers()) {
                saveAnswer(studentId, attemptId, item);
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
        attempt.setSubmittedAt(LocalDateTime.now());
        attempt.setStatus("completed");
        attemptRepository.save(attempt);
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
        if (LocalDateTime.now().isAfter(attempt.getExamSession().getEndTime())) {
            throw new ApiException(HttpStatus.CONFLICT, "Ca thi đã kết thúc");
        }
        return attempt;
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
                attempt.getStartedAt(), attempt.getExamSession().getEndTime(), attempt.getStatus(), questions
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
