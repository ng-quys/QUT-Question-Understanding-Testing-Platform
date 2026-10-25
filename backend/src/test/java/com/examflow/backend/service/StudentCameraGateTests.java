package com.examflow.backend.service;

import com.examflow.backend.entity.*;
import com.examflow.backend.repository.*;
import com.examflow.backend.dto.*;
import com.examflow.backend.exception.ApiException;
import jakarta.persistence.*;
import org.junit.jupiter.api.*;
import org.springframework.test.util.ReflectionTestUtils;
import java.time.*;
import java.math.BigDecimal;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class StudentCameraGateTests {
    final UserRepository users=mock(UserRepository.class);
    final ExamSessionRepository sessions=mock(ExamSessionRepository.class);
    final ExamSessionStudentRepository registrations=mock(ExamSessionStudentRepository.class);
    final ExamAttemptRepository attempts=mock(ExamAttemptRepository.class);
    final ExamQuestionRepository questions=mock(ExamQuestionRepository.class);
    final StudentAnswerRepository answers=mock(StudentAnswerRepository.class);
    final AntiCheatService ai=mock(AntiCheatService.class);
    final CameraVerificationService gate=mock(CameraVerificationService.class);
    final OfflineSubmissionService offline=mock(OfflineSubmissionService.class);
    final ExamSnapshotReadService snapshots=mock(ExamSnapshotReadService.class);
    final StudentService service=new StudentService(users,registrations,sessions,attempts,questions,mock(CloRepository.class),answers,ai,snapshots);
    final ExamSession session=new ExamSession();final ExamAttempt attempt=new ExamAttempt();
    @BeforeEach void setup(){
        var em=mock(EntityManager.class);ReflectionTestUtils.setField(service,"em",em);ReflectionTestUtils.setField(service,"cameraVerification",gate);ReflectionTestUtils.setField(service,"offlineSubmissions",offline);
        var user=new UserEntity();user.setId(1L);user.setRole("student");user.setStatus("active");
        when(users.findById(1L)).thenReturn(Optional.of(user));
        var course=new Course();course.setCode("CS01");course.setName("Course");
        var exam=new Exam();exam.setId(2L);exam.setCode("EX1");exam.setTitle("Paper");exam.setCourse(course);exam.setTotalPoints(BigDecimal.TEN);
        session.setId(7L);session.setExam(exam);session.setStatus("ongoing");session.setPublishedAt(Instant.now());session.setStartTime(ExamOrganizationService.now().minusMinutes(1));session.setEndTime(ExamOrganizationService.now().plusHours(1));
        when(sessions.findById(7L)).thenReturn(Optional.of(session));
        var registration=new ExamSessionStudent();registration.setStudent(user);registration.setExamSession(session);
        when(registrations.findByStudentAndSession(1L,7L)).thenReturn(Optional.of(registration));
        attempt.setId(12L);attempt.setStudent(user);attempt.setExam(exam);attempt.setExamSession(session);attempt.setStartedAt(session.getStartTime());attempt.setStatus("in_progress");
        when(attempts.findOwnedAttempt(12L,1L)).thenReturn(Optional.of(attempt));
        when(attempts.findByExamSessionIdAndStudentId(7L,1L)).thenReturn(Optional.of(attempt));
        when(ai.isRequired(2L,session)).thenReturn(true);
        when(questions.findByExamIdWithQuestion(2L)).thenReturn(List.of());when(answers.findByAttemptIdWithDetails(12L)).thenReturn(List.of());when(snapshots.findCloIds(anyList())).thenReturn(Map.of());
    }
    @Test void startWithoutValidProofCannotCreateAnAttemptOrReadQuestions(){
        when(gate.consume(1L,7L,null)).thenThrow(new ApiException(org.springframework.http.HttpStatus.CONFLICT,"Cần xác minh camera"));
        assertThrows(ApiException.class,()->service.startExam(1L,7L,null));
        verify(attempts,never()).save(any());verifyNoInteractions(questions);
    }
    @Test void rawAttemptReadAndAnswerApiCannotBypassCameraLock(){
        doThrow(new ApiException(org.springframework.http.HttpStatus.CONFLICT,"Cần xác minh camera")).when(gate).requireHealthy(12L,1L);
        assertThrows(ApiException.class,()->service.getAttempt(1L,12L));
        assertThrows(ApiException.class,()->service.saveAnswer(1L,12L,new SaveAnswerRequest(3L,4L)));
        verifyNoInteractions(questions);verify(answers,never()).save(any());
    }
    @Test void submitCannotSmuggleNewAnswersWhileCameraIsLocked(){
        doThrow(new ApiException(org.springframework.http.HttpStatus.CONFLICT,"Cần xác minh camera")).when(gate).requireHealthy(12L,1L);
        assertThrows(ApiException.class,()->service.submit(1L,12L,new SubmitExamRequest(List.of(new SaveAnswerRequest(3L,4L)))));
        verifyNoInteractions(questions);verify(answers,never()).save(any());
    }
    @Test void expiryCanFinalizeSavedWorkWithoutCameraAndCannotAddLateAnswers(){
        session.setEndTime(ExamOrganizationService.now().minusSeconds(1));
        var result=service.submit(1L,12L,new SubmitExamRequest(List.of(new SaveAnswerRequest(3L,4L))));
        assertEquals("completed",result.status());verifyNoInteractions(gate);verify(answers,never()).save(any());
    }
    @Test void aDisabledAiPolicyDoesNotRequireCamera(){
        when(ai.isRequired(2L,session)).thenReturn(false);
        assertEquals(12L,service.getAttempt(1L,12L).attemptId());verifyNoInteractions(gate);
    }
    @Test void preflightDoesNotStartExamOrExposeQuestions(){
        when(gate.check(1L,7L,"jpeg-test")).thenReturn(new CameraVerificationService.Result(true,false,"no_face","Chưa thấy khuôn mặt",null,0));
        assertFalse(service.checkCamera(1L,7L,"jpeg-test").verified());
        verify(attempts,never()).save(any());verifyNoInteractions(questions);
    }
    @Test void restorationKeepsTheSameAttemptAndOriginalDeadline(){
        var proof=new CameraVerificationService.Proof(1,7);when(gate.consume(1L,7L,"proof")).thenReturn(proof);
        var end=session.getEndTime();service.restoreCamera(1,12,"proof");
        verify(gate).bind(12L,proof,end.atZone(ZoneId.of("Asia/Ho_Chi_Minh")).toInstant().toEpochMilli());
        assertEquals(end,session.getEndTime());verify(attempts,never()).save(any());verifyNoInteractions(questions);
    }
    OfflineSubmissionRequest deferred(){return new OfflineSubmissionRequest(UUID.randomUUID().toString(),UUID.randomUUID().toString(),session.getEndTime().atZone(ZoneId.of("Asia/Ho_Chi_Minh")).toInstant(),null,List.of(new SaveAnswerRequest(3L,4L)));}
    @Test void deferredSubmissionGradesValidSnapshotAfterDeadlineAndRecordsReceipt(){
        session.setEndTime(ExamOrganizationService.now().minusSeconds(10));
        var link=new ExamQuestion();link.setId(33L);link.setQuestionId(3L);link.setExam(attempt.getExam());link.setPoints(BigDecimal.TEN);
        when(questions.findByExamIdWithQuestion(2L)).thenReturn(List.of(link));
        when(snapshots.find(33L)).thenReturn(Optional.of(new ExamSnapshotReadService.Snapshot(33L,3L,null,"Frozen question","",4L,List.of(new ExamSnapshotReadService.Option(4L,"A","Correct")))));
        var saved=new StudentAnswer();saved.setQuestionId(3L);saved.setSelectedAnswerId(4L);saved.setCorrect(true);
        when(answers.findByAttemptIdWithDetails(12L)).thenReturn(List.of(saved));
        var result=service.submitOffline(1L,12L,deferred());
        assertEquals(0,BigDecimal.TEN.compareTo(result.score()));assertEquals("completed",result.status());
        verify(answers).save(any(StudentAnswer.class));verify(ai).recordOfflineReceipt(12L,null);verifyNoInteractions(gate);
    }
    @Test void matchingDeferredRetryReturnsGradeWithoutSavingOrRecordingAnotherReceipt(){
        attempt.setStatus("completed");attempt.setScore(BigDecimal.TEN);var request=deferred();when(offline.accept(attempt,request)).thenReturn(true);
        assertEquals(0,BigDecimal.TEN.compareTo(service.submitOffline(1L,12L,request).score()));
        verify(answers,never()).save(any());verify(ai,never()).recordOfflineReceipt(anyLong(),any());
    }
    @Test void cameraStillProtectsDeferredSubmissionBeforeDeadline(){
        doThrow(new ApiException(org.springframework.http.HttpStatus.CONFLICT,"Camera bị chặn")).when(gate).requireHealthy(12L,1L);
        assertThrows(ApiException.class,()->service.submitOffline(1L,12L,deferred()));verify(answers,never()).save(any());
    }
    @Test void anotherStudentCannotUseDeferredSubmissionForThisAttempt(){
        assertThrows(ApiException.class,()->service.submitOffline(2L,12L,deferred()));verifyNoInteractions(offline);
    }
    @Test void delayedAutosaveCannotOverwriteAnAlreadySubmittedSnapshot(){
        var em=(EntityManager)ReflectionTestUtils.getField(service,"em");
        doAnswer(call->{attempt.setStatus("completed");return null;}).when(em).refresh(attempt,LockModeType.PESSIMISTIC_WRITE);
        assertThrows(ApiException.class,()->service.saveAnswer(1L,12L,new SaveAnswerRequest(3L,4L)));
        verify(answers,never()).save(any());
    }
}
