package com.examflow.backend.service;

import com.examflow.backend.dto.*;
import com.examflow.backend.entity.*;
import com.examflow.backend.exception.ApiException;
import jakarta.persistence.*;
import org.junit.jupiter.api.*;
import org.springframework.test.util.ReflectionTestUtils;
import java.time.*;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class OfflineSubmissionTests {
    final OfflineSubmissionService service=new OfflineSubmissionService();
    final EntityManager em=mock(EntityManager.class);
    final Query query=mock(Query.class,RETURNS_SELF);
    final ExamAttempt attempt=new ExamAttempt();final ExamSession session=new ExamSession();
    final String token=UUID.randomUUID().toString(),submission=UUID.randomUUID().toString();
    final ZoneId zone=ZoneId.of("Asia/Ho_Chi_Minh");
    @BeforeEach void setup(){
        ReflectionTestUtils.setField(service,"em",em);when(em.createNativeQuery(anyString())).thenReturn(query);
        session.setEndTime(LocalDateTime.now(zone).minusMinutes(5));session.setStatus("completed");
        attempt.setId(12L);attempt.setStartedAt(session.getEndTime().minusHours(1));attempt.setExamSession(session);attempt.setStatus("in_progress");
        when(query.getResultList()).thenReturn(Collections.singletonList(new Object[]{token,session.getEndTime(),null,null,null}));
    }
    Instant deadline(){return session.getEndTime().atZone(zone).toInstant();}
    OfflineSubmissionRequest request(String suppliedToken,Instant frozen,List<SaveAnswerRequest> answers){return new OfflineSubmissionRequest(suppliedToken,submission,frozen,deadline().minusSeconds(30),answers);}
    @Test void validGrantAcceptsLateFrozenSnapshotAndRecordsActualReceiptTime(){
        assertFalse(service.accept(attempt,request(token,deadline(),List.of(new SaveAnswerRequest(1L,11L)))));
        verify(query).setParameter("late",true);verify(query).setParameter("submission",submission);verify(query).setParameter("frozen",session.getEndTime());
    }
    @Test void noGrantWrongGrantChangedDeadlineAndClientTimeBeyondDeadlineAreRejected(){
        assertThrows(ApiException.class,()->service.accept(attempt,request(UUID.randomUUID().toString(),deadline(),List.of())));
        assertThrows(ApiException.class,()->service.accept(attempt,request(token,deadline().plusSeconds(1),List.of())));
        when(query.getResultList()).thenReturn(List.of());assertThrows(ApiException.class,()->service.accept(attempt,request(token,deadline(),List.of())));
        when(query.getResultList()).thenReturn(Collections.singletonList(new Object[]{token,session.getEndTime().minusMinutes(1),null,null,null}));
        assertThrows(ApiException.class,()->service.accept(attempt,request(token,deadline(),List.of())));
        verify(query,never()).setParameter(eq("late"),any());
    }
    @Test void duplicateQuestionsCancelledSessionAndCompletedAttemptCannotChangeAnswers(){
        assertThrows(ApiException.class,()->service.accept(attempt,request(token,deadline(),List.of(new SaveAnswerRequest(1L,11L),new SaveAnswerRequest(1L,12L)))));
        session.setStatus("cancelled");assertThrows(ApiException.class,()->service.accept(attempt,request(token,deadline(),List.of())));
        session.setStatus("completed");attempt.setStatus("completed");assertThrows(ApiException.class,()->service.accept(attempt,request(token,deadline(),List.of())));
    }
    @Test void identicalRetryReturnsExistingResultButDifferentSnapshotCannotReplaceIt(){
        var request=request(token,deadline(),List.of(new SaveAnswerRequest(1L,11L)));
        service.accept(attempt,request);
        var hash=org.mockito.ArgumentCaptor.forClass(String.class);verify(query).setParameter(eq("hash"),hash.capture());
        clearInvocations(query);
        when(query.getResultList()).thenReturn(Collections.singletonList(new Object[]{token,session.getEndTime(),LocalDateTime.now(zone),submission,hash.getValue()}));
        attempt.setStatus("completed");assertTrue(service.accept(attempt,request));
        assertThrows(ApiException.class,()->service.accept(attempt,request(token,deadline(),List.of(new SaveAnswerRequest(1L,12L)))));
        verify(query,never()).setParameter(eq("late"),any());
    }
    @Test void cannotIssueNewGrantAfterDeadline(){assertThrows(ApiException.class,()->service.issue(attempt,true));}
}
