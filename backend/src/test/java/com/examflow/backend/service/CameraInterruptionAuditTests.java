package com.examflow.backend.service;

import jakarta.persistence.EntityManager;
import jakarta.persistence.Query;
import org.junit.jupiter.api.*;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import java.util.List;
import static org.mockito.Mockito.*;
import static org.junit.jupiter.api.Assertions.*;

class CameraInterruptionAuditTests {
    final CameraVerificationService camera=mock(CameraVerificationService.class);
    final EntityManager em=mock(EntityManager.class);
    final Query query=mock(Query.class,RETURNS_SELF);
    final AntiCheatService service=mock(AntiCheatService.class,CALLS_REAL_METHODS);
    boolean previousSchemaFlag;
    @BeforeEach void setup(){
        previousSchemaFlag=(Boolean)ReflectionTestUtils.getField(AntiCheatService.class,"tableEnsured");
        ReflectionTestUtils.setField(AntiCheatService.class,"tableEnsured",true);
        ReflectionTestUtils.setField(service,"cameraVerification",camera);
        ReflectionTestUtils.setField(service,"entityManager",em);
        when(em.createNativeQuery(anyString())).thenReturn(query);
        when(camera.interruptions(12)).thenReturn(List.of(new CameraVerificationService.Interruption("end",1800000000000L,1800000007000L)));
        TransactionSynchronizationManager.initSynchronization();
    }
    @AfterEach void cleanup(){
        TransactionSynchronizationManager.clearSynchronization();
        ReflectionTestUtils.setField(AntiCheatService.class,"tableEnsured",previousSchemaFlag);
    }
    @Test void durationIsRecordedWithoutPenaltyAndOnlyAcknowledgedAfterCommit(){
        service.syncCameraInterruptions(12);
        verify(query,atLeastOnce()).setParameter("duration",7.0);
        verify(query,atLeastOnce()).setParameter("active",false);
        verify(query).setParameter("score",0);
        verify(query,atLeastOnce()).setParameter("event","CAMERA_DEVICE_UNAVAILABLE");
        verify(camera,never()).acknowledge(anyLong(),anyString());
        TransactionSynchronizationManager.getSynchronizations().forEach(TransactionSynchronization::afterCommit);
        verify(camera).acknowledge(12,"end");
    }
    @Test void rollbackLeavesInterruptionAvailableForRetry(){
        service.syncCameraInterruptions(12);
        TransactionSynchronizationManager.getSynchronizations().forEach(sync->sync.afterCompletion(TransactionSynchronization.STATUS_ROLLED_BACK));
        verify(camera,never()).acknowledge(anyLong(),anyString());
    }
    @Test void healthyCameraDoesNotWriteAuditRowsOnEveryPoll(){
        when(camera.interruptions(12)).thenReturn(List.of());
        service.syncCameraInterruptions(12);
        verifyNoInteractions(em);assertTrue(TransactionSynchronizationManager.getSynchronizations().isEmpty());
    }
    @Test void permissionDeniedHasReviewPointsOnlyOnStartAndConnectionLossNeverDoes(){
        when(camera.interruptions(12)).thenReturn(List.of(new CameraVerificationService.Interruption("start",1800000000000L,0,"permission_denied")));
        service.syncCameraInterruptions(12);
        verify(query).setParameter("event","CAMERA_PERMISSION_DENIED");verify(query).setParameter("score",30);
        clearInvocations(query);
        when(camera.interruptions(12)).thenReturn(List.of(new CameraVerificationService.Interruption("end",1800000000000L,1800000007000L,"permission_denied")));
        service.syncCameraInterruptions(12);verify(query).setParameter("score",0);
        clearInvocations(query);
        when(camera.interruptions(12)).thenReturn(List.of(new CameraVerificationService.Interruption("network",1800000007000L,0,"connection_lost")));
        service.syncCameraInterruptions(12);verify(query).setParameter("event","MONITORING_CONNECTION_LOST");verify(query).setParameter("score",0);
    }
}
