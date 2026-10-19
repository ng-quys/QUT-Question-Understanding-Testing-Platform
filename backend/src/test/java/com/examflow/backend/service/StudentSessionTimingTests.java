package com.examflow.backend.service;

import com.examflow.backend.dto.SaveAnswerRequest;
import com.examflow.backend.entity.*;
import com.examflow.backend.exception.ApiException;
import com.examflow.backend.repository.*;
import org.junit.jupiter.api.*;
import java.math.BigDecimal;
import java.time.*;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class StudentSessionTimingTests {
    final UserRepository users=mock(UserRepository.class);
    final ExamSessionStudentRepository registrations=mock(ExamSessionStudentRepository.class);
    final ExamAttemptRepository attempts=mock(ExamAttemptRepository.class);
    final ExamQuestionRepository questions=mock(ExamQuestionRepository.class);
    final AnswerRepository answers=mock(AnswerRepository.class);
    final StudentAnswerRepository saved=mock(StudentAnswerRepository.class);
    final StudentService service=new StudentService(users,registrations,mock(ExamSessionRepository.class),attempts,questions,answers,saved,mock(AntiCheatService.class));
    final LocalDateTime clock=LocalDateTime.now(ZoneId.of("Asia/Ho_Chi_Minh"));
    Exam exam; ExamSession session; ExamAttempt attempt; ExamSessionStudent registration;

    @BeforeEach void setup() {
        UserEntity student=new UserEntity();student.setId(1L);student.setRole("student");student.setStatus("active");
        when(users.findById(1L)).thenReturn(Optional.of(student));
        Course course=new Course();course.setCode("CS01");course.setName("Test course");
        exam=new Exam();exam.setId(2L);exam.setCourse(course);exam.setCode("TEST");exam.setTitle("Shared paper");exam.setTotalQuestions(1);exam.setTotalPoints(BigDecimal.TEN);
        session=new ExamSession();session.setId(3L);session.setExam(exam);session.setStartTime(clock.minusMinutes(90));session.setEndTime(clock.plusMinutes(30));session.setStatus("ongoing");session.setPublishedAt(Instant.now());
        attempt=new ExamAttempt();attempt.setId(4L);attempt.setStudent(student);attempt.setExam(exam);attempt.setExamSession(session);attempt.setStartedAt(clock.minusMinutes(80));attempt.setStatus("in_progress");
        registration=new ExamSessionStudent();registration.setStudent(student);registration.setExamSession(session);
        when(registrations.findByStudentAndSession(1L,3L)).thenReturn(Optional.of(registration));
        when(registrations.findAllByStudentIdWithDetails(1L)).thenReturn(List.of(registration));
        when(attempts.findOwnedAttempt(4L,1L)).thenReturn(Optional.of(attempt));
        when(attempts.findAllByStudentIdWithDetails(1L)).thenReturn(List.of(attempt));
        Question question=new Question();question.setId(5L);
        ExamQuestion link=new ExamQuestion();link.setExam(exam);link.setQuestion(question);link.setPoints(BigDecimal.TEN);
        when(questions.findByExamIdWithQuestion(2L)).thenReturn(List.of(link));
        Answer answer=new Answer();answer.setId(6L);answer.setQuestion(question);answer.setCorrect(true);
        when(answers.findByIdAndQuestionId(6L,5L)).thenReturn(Optional.of(answer));
        when(saved.findByAttemptIdAndQuestionId(4L,5L)).thenReturn(Optional.empty());
    }

    @Test void lateArrivalKeepsSharedDeadlineAndCanStillSaveAfterEightyMinutes() {
        var listed=service.getSessions(1L).get(0);
        assertEquals(120,listed.durationMinutes());assertTrue(listed.canStart());
        assertEquals(session.getEndTime(),SessionTiming.deadline(attempt));
        service.saveAnswer(1L,4L,new SaveAnswerRequest(5L,6L));
        verify(saved).save(any(StudentAnswer.class));
    }

    @Test void sessionEndRejectsFurtherAnswersRegardlessOfRecentArrival() {
        session.setEndTime(clock.minusSeconds(1));attempt.setStartedAt(clock.minusMinutes(1));
        assertThrows(ApiException.class,()->service.saveAnswer(1L,4L,new SaveAnswerRequest(5L,6L)));
        verify(saved,never()).save(any());
    }

    @Test void samePaperUsesDifferentDurationsInDifferentSessions() {
        ExamSession other=new ExamSession();other.setId(7L);other.setExam(exam);other.setStartTime(clock.minusMinutes(5));other.setEndTime(clock.plusMinutes(25));other.setStatus("ongoing");other.setPublishedAt(Instant.now());
        ExamSessionStudent assigned=new ExamSessionStudent();assigned.setExamSession(other);
        when(registrations.findAllByStudentIdWithDetails(1L)).thenReturn(List.of(registration,assigned));
        var listed=service.getSessions(1L);
        assertEquals(120,listed.get(0).durationMinutes());assertEquals(30,listed.get(1).durationMinutes());
    }
}
