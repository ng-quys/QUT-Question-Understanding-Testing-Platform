package com.examflow.backend.service;

import com.examflow.backend.entity.ExamAttempt;
import jakarta.persistence.EntityManager;
import jakarta.persistence.Query;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.test.util.ReflectionTestUtils;
import java.util.List;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class EvidencePollingTests {
    @ParameterizedTest
    @ValueSource(strings={"in_progress","completed","expired","cancelled"})
    void eventPageIncludesAuthorizedAttemptStatusEvenWithoutEvents(String status) {
        var access=mock(EvidenceAccessService.class);
        var em=mock(EntityManager.class);
        var query=mock(Query.class,RETURNS_SELF);
        var attempt=new ExamAttempt(); attempt.setStatus(status);
        when(access.require(null,7L)).thenReturn(attempt);
        when(em.createNativeQuery(anyString())).thenReturn(query);
        when(query.getSingleResult()).thenReturn(0L);
        when(query.getResultList()).thenReturn(List.of());
        var service=new EvidenceReadService(access,mock(EvidenceSchema.class),mock(SupabaseEvidenceStorage.class),mock(AdminEvidenceService.class));
        ReflectionTestUtils.setField(service,"em",em);
        var page=service.events(null,7L,0,20);
        assertEquals(status,page.attemptStatus());
        assertTrue(page.items().isEmpty());
        verify(access).require(null,7L);
    }
}
