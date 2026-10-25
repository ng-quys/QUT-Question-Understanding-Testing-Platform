package com.examflow.backend.service;

import com.examflow.backend.entity.ExamAttempt;
import com.examflow.backend.exception.ApiException;
import jakarta.persistence.*;
import org.junit.jupiter.api.*;
import org.springframework.http.HttpStatus;
import org.springframework.test.util.ReflectionTestUtils;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class EvidenceGroupingTests {
    final EntityManager em=mock(EntityManager.class);
    final EvidenceAccessService access=mock(EvidenceAccessService.class);
    final EvidenceSchema schema=mock(EvidenceSchema.class);
    final Query counts=mock(Query.class,RETURNS_SELF),keys=mock(Query.class,RETURNS_SELF),rows=mock(Query.class,RETURNS_SELF);
    final EvidenceReadService service=new EvidenceReadService(access,schema,mock(SupabaseEvidenceStorage.class),mock(AdminEvidenceService.class));
    @BeforeEach void setup(){
        ReflectionTestUtils.setField(service,"em",em);
        var attempt=new ExamAttempt();attempt.setStatus("in_progress");when(access.require(null,125L)).thenReturn(attempt);
        when(em.createNativeQuery(startsWith("SELECT COUNT(*)"))).thenReturn(counts);
        when(em.createNativeQuery(startsWith("SELECT COALESCE"))).thenReturn(keys);
        when(em.createNativeQuery(startsWith("SELECT id,event"))).thenReturn(rows);
    }
    @Test void offlineProgressAndReceiptTimeRemainAvailableAfterAttemptSubmission(){
        var offline=mock(OfflineEvidenceService.class);ReflectionTestUtils.setField(service,"offlineEvidence",offline);
        var attempt=new ExamAttempt();attempt.setStatus("completed");when(access.require(null,125L)).thenReturn(attempt);
        var summary=new OfflineEvidenceService.Summary(1,1,0,0,true,false);when(offline.summary(125L)).thenReturn(summary);
        when(counts.getSingleResult()).thenReturn(new Object[]{1L,1L});when(keys.getResultList()).thenReturn(List.of("capture:photo"));
        Object[] value=Arrays.copyOf(row(1,"photo"),15);value[4]="OFFLINE";value[13]="2026-10-25T09:00:00";value[14]="pending";
        when(rows.getResultList()).thenReturn(Collections.singletonList(value));
        var result=service.groupedEvents(null,125L,0,20);
        assertEquals("completed",result.attemptStatus());assertEquals(summary,result.offlineEvidence());
        assertEquals("pending",result.items().get(0).analysisStatus());assertEquals(value[13],result.items().get(0).receivedAt());
        verify(access).require(null,125L);
    }
    Object[] row(long id,String capture){return new Object[]{id,"SPEECH",true,"2026-10-23T10:00:00","M10",2.0,50,"HIGH","supabase","uploaded","photo.jpg",null,capture};}
    @Test void paginationKeepsEveryWarningFromOneCaptureTogether(){
        when(counts.getSingleResult()).thenReturn(new Object[]{23L,2L});when(keys.getResultList()).thenReturn(List.of("capture:frame-a"));
        var all=new ArrayList<Object[]>();for(int i=0;i<21;i++)all.add(row(i+1,"frame-a"));when(rows.getResultList()).thenReturn(all);
        var page=service.groupedEvents(null,125L,0,1);
        assertEquals(23,page.total());assertEquals(2,page.groupTotal());assertEquals(21,page.items().size());assertTrue(page.items().stream().allMatch(event->"frame-a".equals(event.captureId())));
        verify(keys).setMaxResults(1);verify(rows,never()).setMaxResults(anyInt());verify(rows).setParameter("groups",List.of("capture:frame-a"));verify(rows).setParameter("id",125L);
    }
    @Test void legacyEventsStayIndividuallyIdentifiedAndEmptyPageKeepsCounts(){
        when(counts.getSingleResult()).thenReturn(new Object[]{23L,22L});when(keys.getResultList()).thenReturn(List.of());
        var page=service.groupedEvents(null,125L,2,20);assertEquals(22,page.groupTotal());assertTrue(page.items().isEmpty());
        verify(em,atLeastOnce()).createNativeQuery(contains("'event:' || id::text"));verify(keys).setFirstResult(40);verifyNoInteractions(rows);
    }
    @Test void groupedEndpointCannotBypassAttemptAccess(){
        when(access.require(null,125L)).thenThrow(new ApiException(HttpStatus.FORBIDDEN,"Không được phụ trách"));
        assertThrows(ApiException.class,()->service.groupedEvents(null,125L,0,20));verifyNoInteractions(em,schema);
    }
}
