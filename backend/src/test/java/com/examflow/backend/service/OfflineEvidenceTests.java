package com.examflow.backend.service;

import com.examflow.backend.entity.*;
import com.examflow.backend.repository.ExamAttemptRepository;
import com.examflow.backend.exception.ApiException;
import jakarta.persistence.*;
import org.junit.jupiter.api.*;
import org.springframework.test.util.ReflectionTestUtils;
import java.time.*;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class OfflineEvidenceTests {
    final EntityManager em=mock(EntityManager.class);
    final ExamAttemptRepository attempts=mock(ExamAttemptRepository.class);
    final Query q=mock(Query.class,RETURNS_SELF),grant=mock(Query.class,RETURNS_SELF),previous=mock(Query.class,RETURNS_SELF),sum=mock(Query.class,RETURNS_SELF);
    final OfflineEvidenceService service=new OfflineEvidenceService(attempts,mock(StudentProfileService.class),mock(EvidenceSchema.class),mock(SupabaseEvidenceStorage.class));
    final ExamAttempt attempt=new ExamAttempt();final ExamSession session=new ExamSession();
    final String token=UUID.randomUUID().toString(),capture=UUID.randomUUID().toString();
    final LocalDateTime end=LocalDateTime.now(ZoneId.of("Asia/Ho_Chi_Minh")).minusMinutes(1);
    final byte[] bytes={1,2,3};
    @BeforeEach void setup(){
        ReflectionTestUtils.setField(service,"em",em);
        session.setEndTime(end);session.setStatus("completed");attempt.setId(12L);attempt.setExamSession(session);attempt.setStartedAt(end.minusHours(1));attempt.setStatus("completed");
        when(attempts.findOwnedAttempt(12L,7L)).thenReturn(Optional.of(attempt));
        when(em.createNativeQuery(anyString())).thenAnswer(call->{String sql=call.getArgument(0);return sql.startsWith("SELECT token,")?grant:sql.startsWith("SELECT image_hash")?previous:sql.startsWith("SELECT COALESCE(SUM")?sum:q;});
        when(grant.getResultList()).thenReturn(Collections.singletonList(new Object[]{token,end}));
        when(q.getResultList()).thenReturn(List.of(12L));when(q.getSingleResult()).thenReturn(0L);when(sum.getSingleResult()).thenReturn(0L);when(previous.getResultList()).thenReturn(List.of());
    }
    OfflineEvidenceService.Capture frame(){return new OfflineEvidenceService.Capture(token,capture,end.minusSeconds(5).atZone(ZoneId.of("Asia/Ho_Chi_Minh")).toInstant(),1,"unused");}
    @Test void completedAttemptStillAcceptsBeforeDeadlineCaptureForReview(){assertFalse(service.reserve(7L,12L,frame(),bytes));verify(q).setParameter("capture",capture);}
    @Test void wrongOwnerCancelledAndWrongTokenAreRejected(){
        assertThrows(ApiException.class,()->service.reserve(8L,12L,frame(),bytes));
        session.setStatus("cancelled");assertThrows(ApiException.class,()->service.reserve(7L,12L,frame(),bytes));session.setStatus("completed");
        when(grant.getResultList()).thenReturn(Collections.singletonList(new Object[]{UUID.randomUUID().toString(),end}));assertThrows(ApiException.class,()->service.reserve(7L,12L,frame(),bytes));
    }
    @Test void changedScheduleAndAfterDeadlinePhotoAreRejected(){
        when(grant.getResultList()).thenReturn(Collections.singletonList(new Object[]{token,end.minusMinutes(1)}));assertThrows(ApiException.class,()->service.reserve(7L,12L,frame(),bytes));
        when(grant.getResultList()).thenReturn(Collections.singletonList(new Object[]{token,end}));
        assertThrows(ApiException.class,()->service.reserve(7L,12L,new OfflineEvidenceService.Capture(token,capture,end.plusSeconds(1).atZone(ZoneId.of("Asia/Ho_Chi_Minh")).toInstant(),1,""),bytes));
    }
    @Test void sameIdHasImmutableBytesTimeAndSequenceAndRetryAcknowledgesExistingImage(){
        when(previous.getResultList()).thenReturn(Collections.singletonList(new Object[]{OfflineEvidenceService.hash(bytes),"pending",end.minusSeconds(5),1L}));
        assertTrue(service.reserve(7L,12L,frame(),bytes));
        assertThrows(ApiException.class,()->service.reserve(7L,12L,frame(),new byte[]{4}));
        var altered=new OfflineEvidenceService.Capture(token,capture,frame().capturedAt().minusSeconds(1),1,"");assertThrows(ApiException.class,()->service.reserve(7L,12L,altered,bytes));
    }
    @Test void cumulativeQuotaCannotBeBypassedByUploadingSmallSequentialBatches(){when(sum.getSingleResult()).thenReturn(OfflineEvidenceService.MAX_BYTES);assertThrows(ApiException.class,()->service.reserve(7L,12L,frame(),bytes));}
    @Test void finishRequiresAllDeclaredImagesReceived(){when(q.getSingleResult()).thenReturn(1L);assertThrows(ApiException.class,()->service.finish(7L,12L,new OfflineEvidenceService.Finish(token,2,false)));}
    @Test void workerRetriesFailuresWithoutChangingExamOrDroppingJob(){
        var queue=mock(OfflineEvidenceService.class);var storage=mock(SupabaseEvidenceStorage.class);var models=mock(BatchMonitoringService.class);
        var job=new OfflineEvidenceService.Job(12L,capture,"lease",bytes);when(queue.claim()).thenReturn(job);
        when(storage.readOffline(12L,capture)).thenThrow(new IllegalStateException("network"));
        new OfflineEvidenceWorker(queue,storage,models).run();verify(queue).retry(job);verify(queue,never()).analyzed(any(),any());verifyNoInteractions(models);
    }
    @Test void workerPassesOriginalReferenceAndFinishesOnlyAfterAiSucceeds(){
        var queue=mock(OfflineEvidenceService.class);var storage=mock(SupabaseEvidenceStorage.class);var models=mock(BatchMonitoringService.class);
        var job=new OfflineEvidenceService.Job(12L,capture,"lease",bytes);when(queue.claim()).thenReturn(job);when(storage.readOffline(12L,capture)).thenReturn(bytes);
        var result=tools.jackson.databind.json.JsonMapper.builder().build().readTree("{\"ok\":true,\"findings\":[]}");when(models.analyzeOffline(bytes,bytes)).thenReturn(result);
        new OfflineEvidenceWorker(queue,storage,models).run();verify(queue).analyzed(job,result);verify(queue,never()).retry(any());
    }
    @Test void rejectsInvalidImagesAndOversizedDimensionsWithoutDecodingFullBitmap()throws Exception{
        assertThrows(ApiException.class,()->OfflineEvidenceService.image("not-base64"));
        assertThrows(ApiException.class,()->OfflineEvidenceService.image(Base64.getEncoder().encodeToString(new byte[250001])));
        var out=new java.io.ByteArrayOutputStream();javax.imageio.ImageIO.write(new java.awt.image.BufferedImage(32,32,java.awt.image.BufferedImage.TYPE_INT_RGB),"jpg",out);
        assertArrayEquals(out.toByteArray(),OfflineEvidenceService.image(Base64.getEncoder().encodeToString(out.toByteArray())));
        out.reset();javax.imageio.ImageIO.write(new java.awt.image.BufferedImage(1600,1000,java.awt.image.BufferedImage.TYPE_INT_RGB),"jpg",out);
        assertThrows(ApiException.class,()->OfflineEvidenceService.image(Base64.getEncoder().encodeToString(out.toByteArray())));
    }
}
