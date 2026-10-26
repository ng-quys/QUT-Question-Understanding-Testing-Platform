package com.examflow.backend.service;

import com.examflow.backend.exception.ApiException;
import org.junit.jupiter.api.*;
import tools.jackson.databind.json.JsonMapper;
import java.time.*;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class CameraVerificationTests {
    static class TestClock extends Clock {
        long millis=1800000000000L;
        public ZoneId getZone(){return ZoneOffset.UTC;}
        public Clock withZone(ZoneId zone){return this;}
        public Instant instant(){return Instant.ofEpochMilli(millis);}
        public long millis(){return millis;}
        void advance(long value){millis+=value;}
    }
    final TestClock clock=new TestClock();
    final BatchMonitoringService models=mock(BatchMonitoringService.class);
    final StudentProfileService photos=mock(StudentProfileService.class);
    final CameraVerificationService service=new CameraVerificationService(models,photos,clock);
    final JsonMapper json=JsonMapper.builder().build();
    @BeforeEach void setup(){
        when(photos.referenceVersion(1L)).thenReturn("photo-v1");
        when(photos.lockReferenceVersion(1L)).thenReturn("photo-v1");
        when(photos.getFacePhoto(1L)).thenReturn(new byte[]{1,2,3});
        when(models.verifyIdentity(anyString(),any())).thenReturn(json.valueToTree(Map.of("verified",true,"reason","verified")));
    }
    CameraVerificationService.Result successfulCheck(){
        assertFalse(service.check(1,7,"test-jpeg").verified());clock.advance(800);
        assertFalse(service.check(1,7,"test-jpeg").verified());clock.advance(800);
        return service.check(1,7,"test-jpeg");
    }
    void bind(){var check=successfulCheck();var proof=service.consume(1,7,check.verificationToken());service.bind(12,proof,clock.millis()+3600000);}
    @Test void requiresMultipleGoodFramesBeforeIssuingOneUseStudentAndSessionBoundProof(){
        var result=successfulCheck();assertTrue(result.verified());assertNotNull(result.verificationToken());
        assertThrows(ApiException.class,()->service.consume(2,7,result.verificationToken()));
        assertThrows(ApiException.class,()->service.consume(1,8,result.verificationToken()));
        assertNotNull(service.consume(1,7,result.verificationToken()));
        assertThrows(ApiException.class,()->service.consume(1,7,result.verificationToken()));
    }
    @Test void expiredProofAndChangedReferenceAreRejected(){
        var result=successfulCheck();clock.advance(15001);
        assertThrows(ApiException.class,()->service.consume(1,7,result.verificationToken()));
        clock.advance(1000);service.check(1,7,"test-jpeg");clock.advance(800);service.check(1,7,"test-jpeg");clock.advance(800);
        var fresh=service.check(1,7,"test-jpeg");
        when(photos.lockReferenceVersion(1L)).thenReturn("photo-v2");
        assertThrows(ApiException.class,()->service.consume(1,7,fresh.verificationToken()));
    }
    @Test void aFailedObservationRevokesAnAlreadyIssuedProof(){
        var result=successfulCheck();clock.advance(800);
        when(models.verifyIdentity(anyString(),any())).thenReturn(json.valueToTree(Map.of("verified",false,"reason","no_face")));
        assertFalse(service.check(1,7,"test-jpeg").verified());
        assertThrows(ApiException.class,()->service.consume(1,7,result.verificationToken()));
    }
    @Test void rateLimitedCallsDoNotCountAsIndependentFrames(){
        service.check(1,7,"test-jpeg");
        for(int i=0;i<10;i++)assertFalse(service.check(1,7,"test-jpeg").verified());
        verify(models,times(1)).verifyIdentity(anyString(),any());
    }
    @Test void shortCheckReusesPhotoButChangedPhotoStillPreventsEntry(){
        var result=successfulCheck();
        verify(photos,times(1)).referenceVersion(1L);
        verify(photos,times(1)).getFacePhoto(1L);
        when(photos.lockReferenceVersion(1L)).thenReturn("replaced-photo");
        assertThrows(ApiException.class,()->service.consume(1,7,result.verificationToken()));
    }
    @Test void slowModelDoesNotRestartAnOtherwiseConsecutiveCheck(){
        when(models.verifyIdentity(anyString(),any())).thenAnswer(call->{clock.advance(5000);return json.valueToTree(Map.of("verified",true));});
        assertFalse(service.check(1,7,"test-jpeg").verified());clock.advance(800);
        assertFalse(service.check(1,7,"test-jpeg").verified());clock.advance(800);
        assertTrue(service.check(1,7,"test-jpeg").verified());
    }
    @Test void clientCameraFlagCannotGrantOrRestoreVerification(){
        service.device(12,1,true);assertFalse(service.status(12,1).cameraVerified());
        bind();assertTrue(service.status(12,1).cameraVerified());
        clock.advance(100);assertFalse(service.device(12,1,false));clock.advance(5000);assertTrue(service.device(12,1,false));
        service.device(12,1,true);assertFalse(service.status(12,1).cameraVerified());
        assertFalse(service.status(12,2).cameraVerified());
    }
    @Test void healthyCameraIsNotMisreportedAsDisconnectedWhileAiIsRegisteringOrWaiting(){
        bind();
        for(int i=0;i<20;i++){
            clock.advance(5000);service.device(12,1,true);
            service.observe(12,json.valueToTree(Map.of("status",i%2==0?"unregistered":"waiting")));
            assertTrue(service.status(12,1).cameraVerified());
        }
        clock.advance(30001);
        var lost=service.status(12,1);assertFalse(lost.cameraVerified());assertEquals("connection_lost",lost.cameraReason());
    }
    @Test void oldModelResultsCannotUndoHardwareInterruptionButFreshVerifiedFramesCan(){
        bind();long earlier=clock.millis();clock.advance(1000);service.device(12,1,false);clock.advance(5000);service.device(12,1,false);service.device(12,1,true);
        service.observe(12,json.valueToTree(Map.of("cameraState","verified","lastProcessedAt",earlier/1000.0)));
        assertFalse(service.status(12,1).cameraVerified());
        clock.advance(1000);service.observe(12,json.valueToTree(Map.of("cameraState","verified","lastProcessedAt",clock.millis()/1000.0)));
        assertTrue(service.status(12,1).cameraVerified());
    }
    @Test void waitingForRoundRobinDoesNotCountAsMissingCameraCoverage(){
        bind();clock.advance(12000);service.device(12,1,true);service.observe(12,json.valueToTree(Map.of("status","waiting")));
        clock.advance(5000);assertTrue(service.status(12,1).cameraVerified());
    }
    @Test void priorBlockedSampleDoesNotOverrideFreshEntryCheck(){
        bind();service.observe(12,json.valueToTree(Map.of("cameraState","blocked","lastProcessedAt",(clock.millis()-1000)/1000.0,"cameraReason","no_face")));
        assertTrue(service.status(12,1).cameraVerified());
    }
    @Test void shortHardwareGlitchesDoNotAccumulateAndConfirmedLossRecordsItsDuration(){
        bind();long first=clock.millis();service.device(12,1,false);clock.advance(4999);
        assertTrue(service.status(12,1).cameraVerified());service.device(12,1,true);
        clock.advance(1000);service.device(12,1,false);long start=clock.millis();clock.advance(4999);
        assertTrue(service.status(12,1).cameraVerified());clock.advance(1);
        assertFalse(service.status(12,1).cameraVerified());
        var events=service.interruptions(12);assertEquals(1,events.size());assertEquals(start,events.get(0).since());assertEquals(0,events.get(0).until());
        clock.advance(2000);service.device(12,1,true);
        assertFalse(service.status(12,1).cameraVerified());
        service.observe(12,json.valueToTree(Map.of("cameraState","verified","lastProcessedAt",clock.millis()/1000.0)));
        assertTrue(service.status(12,1).cameraVerified());
        assertEquals(7000,service.interruptions(12).get(1).until()-start);
        service.acknowledge(12,events.get(0).key());assertEquals(1,service.interruptions(12).size());
    }
    @Test void oldFramesCannotUnlockWhileHardwareIsStillMissing(){
        bind();service.device(12,1,false);clock.advance(5000);assertFalse(service.status(12,1).cameraVerified());
        clock.advance(1000);service.observe(12,json.valueToTree(Map.of("cameraState","verified","lastProcessedAt",clock.millis()/1000.0)));
        assertFalse(service.status(12,1).cameraVerified());
    }
    @Test void freshPreflightClosesExistingInterruptionWithoutLosingUnacknowledgedEvents(){
        bind();service.device(12,1,false);long start=clock.millis();clock.advance(5000);service.status(12,1);
        bind();assertTrue(service.status(12,1).cameraVerified());assertEquals(2,service.interruptions(12).size());
        assertEquals(start,service.interruptions(12).get(1).since());assertTrue(service.interruptions(12).get(1).until()>start);
    }
    @Test void maintenanceClosesAbandonedInterruptionAtOriginalDeadline(){
        var check=successfulCheck();service.bind(12,service.consume(1,7,check.verificationToken()),clock.millis()+10000);
        long start=clock.millis();service.device(12,1,false);clock.advance(5000);assertFalse(service.maintain(12));
        assertEquals(1,service.interruptions(12).size());clock.advance(9000);assertTrue(service.maintain(12));
        var end=service.interruptions(12).get(1);assertEquals(start+10000,end.until());
        assertTrue(service.attemptIds().contains(12L));service.clear(12);assertFalse(service.attemptIds().contains(12L));
    }
    @Test void ordinaryExamDeadlineDoesNotCreateCameraInterruption(){
        bind();clock.advance(3600000);service.finish(12);assertTrue(service.interruptions(12).isEmpty());
    }
    @Test void endingAnAttemptClearsItsCameraGrant(){bind();service.clear(12);assertFalse(service.status(12,1).cameraVerified());}
    @Test void explicitPermissionDenialKeepsItsReasonAndIsNotOverwrittenByAi(){
        bind();service.device(12,1,false,"permission_denied");clock.advance(5000);
        assertEquals("permission_denied",service.status(12,1).cameraReason());
        service.observe(12,json.valueToTree(Map.of("cameraState","blocked","cameraReason","identity_mismatch","lastProcessedAt",clock.millis()/1000.0)));
        assertEquals("permission_denied",service.status(12,1).cameraReason());
        assertEquals("permission_denied",service.interruptions(12).get(0).reason());
    }
    @Test void unknownDeviceFailureCannotBeReclassifiedAsDeniedPermission(){
        bind();service.device(12,1,false,"fake_reason");clock.advance(5000);
        assertEquals("device_unavailable",service.status(12,1).cameraReason());
        assertEquals(0,MonitoringReviewPolicy.interruptionScore(service.interruptions(12).get(0).reason(),true));
    }
    @Test void losingConnectionClosesPriorCauseAndPreservesEachSeparateDuration(){
        bind();service.device(12,1,false,"permission_denied");clock.advance(5000);service.status(12,1);
        clock.advance(26000);assertEquals("connection_lost",service.status(12,1).cameraReason());
        var events=service.interruptions(12);assertEquals(3,events.size());
        assertEquals("permission_denied",events.get(1).reason());assertTrue(events.get(1).until()>events.get(1).since());
        assertEquals("connection_lost",events.get(2).reason());assertEquals(events.get(1).until(),events.get(2).since());
    }
    @Test void oldAiMismatchCannotReclassifyADeviceInterruptionAfterPermissionReturns(){
        bind();long old=clock.millis();service.device(12,1,false,"permission_denied");clock.advance(5000);
        service.status(12,1);service.device(12,1,true);
        service.observe(12,json.valueToTree(Map.of("cameraState","blocked","cameraReason","identity_mismatch","lastProcessedAt",old/1000.0)));
        assertEquals("permission_denied",service.status(12,1).cameraReason());assertEquals(1,service.interruptions(12).size());
    }
    @Test void connectivityLossDoesNotBlockAnswerSyncButRealDeviceLossStillDoes(){
        bind();clock.advance(31000);assertEquals("connection_lost",service.status(12,1).cameraReason());
        assertDoesNotThrow(()->service.requireHealthy(12,1));
        service.device(12,1,false,"permission_denied");clock.advance(5000);service.device(12,1,false,"permission_denied");
        assertThrows(ApiException.class,()->service.requireHealthy(12,1));
    }
    @Test void multiplePeopleSignalCannotRevokeAnExistingIdentityVerification(){
        bind();clock.advance(1000);
        service.observe(12,json.valueToTree(Map.of("cameraState","blocked","cameraReason","multiple_people","lastProcessedAt",clock.millis()/1000.0)));
        assertTrue(service.status(12,1).cameraVerified());assertDoesNotThrow(()->service.requireHealthy(12,1));
        assertTrue(service.interruptions(12).isEmpty());
    }
}
