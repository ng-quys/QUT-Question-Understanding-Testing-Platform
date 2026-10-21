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
import java.util.Set;
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
import com.examflow.backend.entity.Clo;
import com.examflow.backend.entity.Exam;
import com.examflow.backend.entity.ExamAttempt;
import com.examflow.backend.entity.ExamQuestion;
import com.examflow.backend.entity.ExamSession;
import com.examflow.backend.entity.ExamSessionStudent;
import com.examflow.backend.entity.StudentAnswer;
import com.examflow.backend.entity.UserEntity;
import com.examflow.backend.exception.ApiException;
import com.examflow.backend.repository.CloRepository;
import com.examflow.backend.repository.ExamAttemptRepository;
import com.examflow.backend.repository.ExamQuestionRepository;
import com.examflow.backend.repository.ExamSessionStudentRepository;
import com.examflow.backend.repository.ExamSessionRepository;
import com.examflow.backend.repository.StudentAnswerRepository;
import com.examflow.backend.repository.UserRepository;

import jakarta.transaction.Transactional;
@Service
public class StudentService {
    @jakarta.persistence.PersistenceContext private jakarta.persistence.EntityManager em;
    private final ExamSnapshotReadService snapshotReadService;
    private final UserRepository userRepository;
    private final ExamSessionStudentRepository registrationRepository;
    private final ExamSessionRepository sessionRepository;
    private final ExamAttemptRepository attemptRepository;
    private final ExamQuestionRepository examQuestionRepository;
    private final CloRepository cloRepository;
    private final StudentAnswerRepository studentAnswerRepository;
    private final AntiCheatService antiCheatService;

    public StudentService(
            UserRepository userRepository,
            ExamSessionStudentRepository registrationRepository,
            ExamSessionRepository sessionRepository,
            ExamAttemptRepository attemptRepository,
            ExamQuestionRepository examQuestionRepository,
            CloRepository cloRepository,
            StudentAnswerRepository studentAnswerRepository,
            AntiCheatService antiCheatService, ExamSnapshotReadService snapshotReadService) {
        this.snapshotReadService = snapshotReadService;
        this.userRepository = userRepository;
        this.registrationRepository = registrationRepository;
        this.sessionRepository = sessionRepository;
        this.attemptRepository = attemptRepository;
        this.examQuestionRepository = examQuestionRepository;
        this.cloRepository = cloRepository;
        this.studentAnswerRepository = studentAnswerRepository;
        this.antiCheatService = antiCheatService;
    }

    @Transactional

    public StudentDashboardDto getDashboard(Long studentId) {

        UserEntity student = requireStudent(studentId);

        List<StudentSessionDto> sessions = getSessions(studentId);

        List<StudentResultDto> results = getResults(studentId);

        long upcoming = sessions.stream().filter(s -> "scheduled".equalsIgnoreCase(s.sessionStatus())).count();

        long ongoing = sessions.stream().filter(s -> "ongoing".equalsIgnoreCase(s.sessionStatus())).count();

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

                upcoming, ongoing, completed, avg,

                sessions, results.stream().limit(5).toList()

        );

    }

    @Transactional

    public List<StudentSessionDto> getSessions(Long studentId) {

        requireStudent(studentId);

        Map<Long, ExamAttempt> attemptBySession = attemptRepository.findAllByStudentIdWithDetails(studentId)

                .stream().collect(Collectors.toMap(a -> a.getExamSession().getId(), a -> a, (a, b) -> a));

        LocalDateTime now = now();

        return registrationRepository.findAllByStudentIdWithDetails(studentId).stream()
                .filter(reg -> {
                    ExamSession session=reg.getExamSession();
                    ExamAttempt previous=attemptBySession.get(session.getId());
                    boolean legacy=previous!=null && session.getRoomId()==null && "in_progress".equals(previous.getStatus()) && effectiveEnd(previous).isAfter(now);
                    return !session.getStartTime().isAfter(now) && ((session.getPublishedAt()!=null
                        && (previous!=null || (Set.of("scheduled","ongoing").contains(session.getStatus()) && session.getEndTime().isAfter(now)))) || legacy);
                })

                .map(reg -> {

                    ExamSession s = reg.getExamSession();

                    Exam e = s.getExam();

                    ExamAttempt a = attemptBySession.get(s.getId());

                    boolean inWindow = !now.isBefore(s.getStartTime()) && now.isBefore(s.getEndTime());

                    boolean canStart = inWindow && Set.of("scheduled","ongoing").contains(s.getStatus())

                            && (a == null || "in_progress".equalsIgnoreCase(a.getStatus()));

                    return new StudentSessionDto(

                            s.getId(), e.getId(), e.getCode(), e.getTitle(), e.getCourse().getCode(), e.getCourse().getName(),

                            s.getRoomCode(), s.getStartTime(), s.getEndTime(), s.getStatus(), reg.getStatus(),

                            SessionTiming.durationMinutes(s), e.getTotalQuestions(), e.getTotalPoints(),

                            a == null ? null : a.getId(), a == null ? null : a.getStatus(), a == null ? null : a.getScore(),

                            canStart && (a==null || effectiveEnd(a).isAfter(now)), false, s.getName(),
                            s.getRoomId()==null?null:(String)em.createNativeQuery("SELECT name FROM exam_rooms WHERE id=:id").setParameter("id",s.getRoomId()).getSingleResult()

                    );

                }).toList();

    }

    @Transactional
    public StudentAttemptDto startExam(Long studentId, Long sessionId, StartExamRequest request) {
        return startExamForRoom(studentId, sessionId,
                request == null ? null : request.roomCode(),
                request == null ? null : request.accessCode());
    }

    // Compatibility entry point for callers that supply a single room code.
    @Transactional
    public StudentAttemptDto startExamByCode(Long studentId, Long sessionId, String roomCode) {
        return startExamForRoom(studentId, sessionId, roomCode, roomCode);
    }

    private StudentAttemptDto startExamForRoom(Long studentId, Long sessionId,
            String roomCode, String password) {
        UserEntity student = requireStudent(studentId);
        ExamSession session = sessionRepository.findById(sessionId)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Không tìm thấy ca thi"));
        em.find(Exam.class,session.getExam().getId(),jakarta.persistence.LockModeType.PESSIMISTIC_WRITE);
        em.refresh(session,jakarta.persistence.LockModeType.PESSIMISTIC_WRITE);
        requireAssignment(studentId,session,true);
        String code=session.getRoomCode();
        return startExamWithSessionAndRegistration(student, session, code);
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
                if (antiCheatService.isRequired(exam.getId(),session)) {
                    antiCheatService.queueSession(a.getId(), student.getId());
                }
                if (!effectiveEnd(a).isAfter(now())) {
                    antiCheatService.stopSession(a.getId());
                    throw new ApiException(HttpStatus.CONFLICT, "Thời gian làm bài đã kết thúc trong lúc kết nối AI");
                }
                return buildAttemptDto(a);
            }
            throw new ApiException(HttpStatus.CONFLICT, "Thời gian làm bài của bài thi trước đã kết thúc");
        }

        ExamSessionStudent reg = registrationRepository.findByStudentAndSession(student.getId(), session.getId())
                .orElseThrow(() -> new ApiException(HttpStatus.FORBIDDEN,"Bạn không có trong danh sách dự thi"));

        ExamAttempt attempt = new ExamAttempt();
        attempt.setExamSession(session);
        attempt.setExam(exam);
        attempt.setStudent(reg.getStudent());
        attempt.setStartedAt(now);
        attempt.setStatus("in_progress");
        attempt = attemptRepository.save(attempt);
        if (antiCheatService.isRequired(exam.getId(),session)) {
            antiCheatService.queueSession(attempt.getId(), student.getId());
        }
        // The deadline is shared by the whole session; monitoring follows commit.
        return buildAttemptDto(attempt);
    }

    @Transactional
    public StudentAttemptDto getAttempt(Long studentId, Long attemptId) {
        ExamAttempt attempt = attemptRepository.findOwnedAttempt(attemptId, studentId)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Không tìm thấy bài làm"));
        requireAssignment(studentId,attempt.getExamSession(),true);
        if(!effectiveEnd(attempt).isAfter(now()))throw new ApiException(HttpStatus.CONFLICT,"Thời gian làm bài đã kết thúc");
        return buildAttemptDto(attempt);
    }

    @Transactional
    public ApiMessage saveAnswer(Long studentId, Long attemptId, SaveAnswerRequest request) {
        ExamAttempt attempt = requireInProgressAttempt(studentId, attemptId);
        saveAnswerInternal(attempt, request);
        return new ApiMessage("Đã lưu câu trả lời");
    }

    // Snapshot is immutable for an exam_question. Legacy JPA rows are retained for FK compatibility.
    private record FrozenQuestion(String content, Long correctAnswerId, List<ExamOptionDto> options) {}

    private FrozenQuestion frozen(ExamQuestion eq) {
        return snapshotReadService.find(eq.getId())
                .map(snapshot -> new FrozenQuestion(
                        snapshot.content(),
                        snapshot.correctAnswerId(),
                        snapshot.options().stream()
                                .map(option -> new ExamOptionDto(
                                        option.id(), option.label(), option.content()))
                                .toList()))
                .orElseThrow(() -> new ApiException(HttpStatus.CONFLICT, "Đề thi thiếu snapshot câu hỏi " + eq.getId()));
    }

    private void saveAnswerInternal(ExamAttempt attempt, SaveAnswerRequest request) {
        ExamQuestion eq = examQuestionRepository.findByExamIdWithQuestion(attempt.getExam().getId()).stream()
                .filter(x -> x.getQuestionId().equals(request.questionId()))
                .findFirst()
                .orElseThrow(() -> new ApiException(HttpStatus.BAD_REQUEST, "Câu hỏi không thuộc đề thi này"));
        FrozenQuestion snapshot = frozen(eq);
        if (snapshot.options().stream().noneMatch(o -> o.id().equals(request.answerId())))
            throw new ApiException(HttpStatus.BAD_REQUEST, "Đáp án không thuộc snapshot của đề thi");
        StudentAnswer answer = studentAnswerRepository.findByAttemptIdAndQuestionId(attempt.getId(), request.questionId())
                .orElseGet(StudentAnswer::new);
        answer.setAttempt(attempt);
        answer.setQuestionId(eq.getQuestionId());
        answer.setSelectedAnswerId(request.answerId());
        boolean isCorrect = snapshot.correctAnswerId().equals(request.answerId());
        answer.setCorrect(isCorrect);
        answer.setPointsAwarded(isCorrect ? eq.getPoints() : BigDecimal.ZERO);
        answer.setAnsweredAt(now());
        studentAnswerRepository.save(answer);
    }

    @Transactional
    public StudentResultDto submit(Long studentId, Long attemptId, SubmitExamRequest request) {
        ExamAttempt attempt = attemptRepository.findOwnedAttempt(attemptId, studentId)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Không tìm thấy bài làm"));
        requireAssignment(studentId,attempt.getExamSession(),false);
        if ("completed".equalsIgnoreCase(attempt.getStatus()) || "submitted".equalsIgnoreCase(attempt.getStatus())) {
            return getResult(studentId, attemptId);
        }
        if (!"in_progress".equalsIgnoreCase(attempt.getStatus())) {
            throw new ApiException(HttpStatus.CONFLICT, "Bài thi không còn ở trạng thái đang làm");
        }
        if (effectiveEnd(attempt).isAfter(now()) && request != null && request.answers() != null) {
            for (SaveAnswerRequest item : request.answers()) {
                saveAnswerInternal(attempt, item);
            }
        }

        List<ExamQuestion> examQuestions = examQuestionRepository.findByExamIdWithQuestion(attempt.getExam().getId());
        List<StudentAnswer> saved = studentAnswerRepository.findByAttemptIdWithDetails(attemptId);
        Map<Long, StudentAnswer> byQuestion = saved.stream()
                .collect(Collectors.toMap(sa -> sa.getQuestionId(), sa -> sa, (a, b) -> a));

        BigDecimal score = BigDecimal.ZERO;
        for (ExamQuestion eq : examQuestions) {
            StudentAnswer sa = byQuestion.get(eq.getQuestionId());
            if (sa != null && Boolean.TRUE.equals(sa.getCorrect())) {
                score = score.add(eq.getPoints());
            }
        }
        attempt.setScore(score.setScale(2, RoundingMode.HALF_UP));
        attempt.setSubmittedAt(now());
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
        if (!"student".equalsIgnoreCase(user.getRole()) || !"active".equals(user.getStatus())) {
            throw new ApiException(HttpStatus.FORBIDDEN, "Tài khoản không phải sinh viên");
        }
        return user;
    }

    private ExamAttempt requireInProgressAttempt(Long studentId, Long attemptId) {
        ExamAttempt attempt = attemptRepository.findOwnedAttempt(attemptId, studentId)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Không tìm thấy bài làm"));
        requireAssignment(studentId,attempt.getExamSession(),true);
        if (!"in_progress".equalsIgnoreCase(attempt.getStatus())) {
            throw new ApiException(HttpStatus.CONFLICT, "Bài thi không còn ở trạng thái đang làm");
        }
        if (!effectiveEnd(attempt).isAfter(now())) {
            throw new ApiException(HttpStatus.CONFLICT, "Thời gian làm bài đã kết thúc");
        }
        return attempt;
    }

    private void requireAssignment(Long studentId,ExamSession session,boolean entering) {
        requireStudent(studentId);
        if(registrationRepository.findByStudentAndSession(studentId,session.getId()).isEmpty())
            throw new ApiException(HttpStatus.FORBIDDEN,"Bạn không có trong danh sách dự thi");
        boolean legacyContinuation=session.getPublishedAt()==null && session.getRoomId()==null
                && attemptRepository.findByExamSessionIdAndStudentId(session.getId(),studentId)
                    .filter(a->"in_progress".equals(a.getStatus()) && effectiveEnd(a).isAfter(now())).isPresent();
        if(entering && ((session.getPublishedAt()==null&&!legacyContinuation) || !Set.of("scheduled","ongoing").contains(session.getStatus()) || !isWithinSession(session,now())))
            throw new ApiException(HttpStatus.CONFLICT,"Ca thi chưa mở, đã hết giờ hoặc đã đóng");
    }

    private static final ZoneId APP_ZONE = ZoneId.of("Asia/Ho_Chi_Minh");

    private LocalDateTime now() {
        return LocalDateTime.now(APP_ZONE);
    }

    private boolean isWithinSession(ExamSession session, LocalDateTime time) {
        return !time.isBefore(session.getStartTime()) && time.isBefore(session.getEndTime());
    }

    private LocalDateTime effectiveEnd(ExamAttempt attempt) {
        return SessionTiming.deadline(attempt);
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
                .collect(Collectors.toMap(sa -> sa.getQuestionId(), sa -> sa, (a, b) -> a));
        List<ExamQuestionDto> questions = examQuestionRepository.findByExamIdWithQuestion(attempt.getExam().getId()).stream()
                .map(eq -> {
                    FrozenQuestion snapshot = frozen(eq);
                    List<ExamOptionDto> options = snapshot.options();
                    StudentAnswer saved = existing.get(eq.getQuestionId());
                    Long cloId = snapshotReadService.find(eq.getId()).orElseThrow().cloId();
                    String cloCode = cloId == null ? null : cloRepository.findById(cloId).map(Clo::getCode).orElse(null);
                    return new ExamQuestionDto(
                            eq.getQuestionId(), eq.getPosition(), snapshot.content(), eq.getPoints(),
                            cloCode, options, saved == null ? null : saved.getSelectedAnswerId()
                    );
                }).toList();
        Exam exam = attempt.getExam();
        return new StudentAttemptDto(
                attempt.getId(), attempt.getExamSession().getId(), exam.getId(), exam.getCode(), exam.getTitle(),
                exam.getCourse().getCode(), exam.getCourse().getName(), SessionTiming.durationMinutes(attempt.getExamSession()), exam.getTotalPoints(),
                attempt.getStartedAt(), effectiveEnd(attempt), attempt.getStatus(), questions
        );
    }

    private StudentResultDto buildResultDto(ExamAttempt attempt, List<ExamQuestion> examQuestions, List<StudentAnswer> savedAnswers) {
        int correct = (int) savedAnswers.stream().filter(sa -> Boolean.TRUE.equals(sa.getCorrect())).count();
        Map<Long, Long> linkClos = snapshotReadService.findCloIds(examQuestions.stream().map(ExamQuestion::getId).toList());
        Map<Long, Long> questionClos = new java.util.HashMap<>();
        for (ExamQuestion question : examQuestions) {
            Long cloId = linkClos.get(question.getId());
            if (cloId != null) questionClos.putIfAbsent(question.getQuestionId(), cloId);
        }
        Map<Long, List<StudentAnswer>> byClo = savedAnswers.stream()
                .filter(sa -> questionClos.containsKey(sa.getQuestionId()))
                .collect(Collectors.groupingBy(sa -> questionClos.get(sa.getQuestionId())));
        List<CloAchievementDto> cloAchievement = byClo.entrySet().stream().map(entry -> {
            Clo clo = cloRepository.findById(entry.getKey())
                    .orElseThrow(() -> new ApiException(HttpStatus.CONFLICT, "CLO không tồn tại trong Main DB"));
            List<StudentAnswer> items = entry.getValue();
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
