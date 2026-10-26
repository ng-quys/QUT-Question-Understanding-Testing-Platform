package com.examflow.backend.service;

import com.examflow.backend.dto.AntiCheatEventRequest;
import com.examflow.backend.entity.ExamAttempt;
import com.examflow.backend.repository.ExamAttemptRepository;
import jakarta.persistence.*;
import org.junit.jupiter.api.*;
import org.springframework.test.util.ReflectionTestUtils;
import java.time.*;
import java.util.*;
import static org.mockito.Mockito.*;

class FullscreenReviewTests {
    final EntityManager em=mock(EntityManager.class);
    final ExamAttemptRepository attempts=mock(ExamAttemptRepository.class);
    final AntiCheatService service=mock(AntiCheatService.class,CALLS_REAL_METHODS);
    final Query latest=mock(Query.class,RETURNS_SELF),count=mock(Query.class,RETURNS_SELF),write=mock(Query.class,RETURNS_SELF);
    boolean schema;
    @BeforeEach void setup(){
        schema=(Boolean)ReflectionTestUtils.getField(AntiCheatService.class,"tableEnsured");
        ReflectionTestUtils.setField(AntiCheatService.class,"tableEnsured",true);
        ReflectionTestUtils.setField(service,"entityManager",em);ReflectionTestUtils.setField(service,"attemptRepository",attempts);
        var attempt=new ExamAttempt();attempt.setStatus("in_progress");when(attempts.findOwnedAttempt(12L,42L)).thenReturn(Optional.of(attempt));
        when(em.createNativeQuery(anyString())).thenReturn(write);
        when(em.createNativeQuery(startsWith("SELECT id,active"))).thenReturn(latest);
        when(em.createNativeQuery(startsWith("SELECT COUNT(*)"))).thenReturn(count);
    }
    @AfterEach void cleanup(){ReflectionTestUtils.setField(AntiCheatService.class,"tableEnsured",schema);}
    @Test void repeatedStartIsIgnoredInsteadOfInflatingOccurrences(){
        when(latest.getResultList()).thenReturn(Collections.singletonList(new Object[]{1L,true,LocalDateTime.now()}));
        service.recordBrowserEvent(42L,12L,new AntiCheatEventRequest("FULLSCREEN_EXIT",true,"2099-01-01"));
        verify(em,never()).createNativeQuery(startsWith("INSERT"));verifyNoInteractions(count);
    }
    @Test void thirdDistinctExitGetsThirtyReviewPointsFromServerCount(){
        when(latest.getResultList()).thenReturn(Collections.singletonList(new Object[]{4L,false,LocalDateTime.now()}));
        when(count.getSingleResult()).thenReturn(2L);
        service.recordBrowserEvent(42L,12L,new AntiCheatEventRequest("FULLSCREEN_EXIT",true,"2099-01-01"));
        verify(write).setParameter("score",30);verify(write).setParameter("level","MEDIUM");
    }
    @Test void restorationScoresOriginalExitAndEndRowDoesNotRepeatPoints(){
        var start=LocalDateTime.now(ZoneId.of("Asia/Ho_Chi_Minh")).minusSeconds(12);
        when(latest.getResultList()).thenReturn(Collections.singletonList(new Object[]{5L,true,start}));
        when(count.getSingleResult()).thenReturn(1L);
        service.recordBrowserEvent(42L,12L,new AntiCheatEventRequest("FULLSCREEN_EXIT",false,"2099-01-01"));
        verify(write).setParameter("score",20);verify(write).setParameter("score",0);
        verify(write).setParameter("id",5L);
        verify(write,atLeastOnce()).setParameter(eq("duration"),doubleThat(value->value>=12&&value<20));
    }
}
