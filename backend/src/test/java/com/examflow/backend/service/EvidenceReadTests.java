package com.examflow.backend.service;

import com.examflow.backend.controller.EvidenceController;
import com.examflow.backend.entity.UserEntity;
import com.examflow.backend.exception.ApiException;
import jakarta.persistence.EntityManager;
import jakarta.persistence.Query;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.test.util.ReflectionTestUtils;
import java.time.Instant;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class EvidenceReadTests {
    final EntityManager em=mock(EntityManager.class);
    final Query query=mock(Query.class,RETURNS_SELF);
    final EvidenceAccessService access=mock(EvidenceAccessService.class);
    final SupabaseEvidenceStorage storage=mock(SupabaseEvidenceStorage.class);
    final EvidenceReadService service=new EvidenceReadService(access,mock(EvidenceSchema.class),storage,mock(AdminEvidenceService.class));
    @BeforeEach void prepare() { ReflectionTestUtils.setField(service,"em",em); when(em.createNativeQuery(anyString())).thenReturn(query); }
    void row(String provider,String status) { when(query.getResultList()).thenReturn(Collections.singletonList(new Object[]{provider,"exam-evidence","attempt-125/test.jpg",status,"local-copy.jpg"})); }
    @Test void eventFromDifferentAttemptIsRejectedBeforeSigning() {
        when(query.getResultList()).thenReturn(List.of());
        assertEquals(HttpStatus.NOT_FOUND,assertThrows(ApiException.class,()->service.link(null,125L,456L)).getStatus());
        verify(query).setParameter("event",456L); verify(query).setParameter("attempt",125L); verifyNoInteractions(storage);
    }
    @Test void pendingAndFailedAreClearConflictsWithoutSigning() {
        for (String status:List.of("pending","failed")) {
            row("supabase",status);
            assertEquals(HttpStatus.CONFLICT,assertThrows(ApiException.class,()->service.link(null,125L,456L)).getStatus());
        }
        verifyNoInteractions(storage);
    }
    @Test void missingImageIsNotSigned() {
        row("supabase","none");
        assertEquals(HttpStatus.NOT_FOUND,assertThrows(ApiException.class,()->service.link(null,125L,456L)).getStatus());
        verifyNoInteractions(storage);
    }
    @Test void legacyLocalIsKeptSeparate() {
        row("local","none");
        var result=service.link(null,125L,456L);
        assertEquals("local",result.provider()); assertNull(result.url()); verifyNoInteractions(storage);
    }
    @Test void legacyRowsWithNullRiskStillRenderWithoutClaimingAnImage() {
        when(query.getSingleResult()).thenReturn(1L);
        when(query.getResultList()).thenReturn(Collections.singletonList(new Object[]{456L,"TAB_HIDDEN",true,"2026-10-16T10:00:00","M7",null,null,null,"local","none",null,null}));
        var event=service.events(null,125L,0,20).items().get(0);
        assertEquals("LOW",event.riskLevel()); assertFalse(event.hasEvidence()); assertEquals(0,event.riskScore());
    }
    @Test void signUsesOnlyStoredLocationAndResponseCannotBeCached() {
        row("supabase","uploaded");
        var link=new SupabaseEvidenceStorage.SignedLink("https://example.invalid/image",Instant.now().plusSeconds(180),"supabase");
        when(storage.sign(125L,"exam-evidence","attempt-125/test.jpg")).thenReturn(link);
        var response=new EvidenceController(service).link(null,125L,456L);
        assertEquals("no-store",response.getHeaders().getCacheControl()); assertSame(link,response.getBody());
        verify(access).require(null,125L);
    }
    @Test void historyBindsTeacherOwnershipInDatabaseQuery() {
        UserEntity teacher=new UserEntity(); teacher.setId(42L); teacher.setRole("teacher");
        when(access.actor(null)).thenReturn(teacher); when(query.getResultList()).thenReturn(List.of()); when(query.getSingleResult()).thenReturn(0L);
        service.teacherHistory(null,null,"synthetic",0,20);
        verify(em,times(2)).createNativeQuery(contains("c.created_by=:teacher"));
        verify(query,atLeastOnce()).setParameter("admin",false); verify(query,atLeastOnce()).setParameter("teacher",42L);
    }
}
