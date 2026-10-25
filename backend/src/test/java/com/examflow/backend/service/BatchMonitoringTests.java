package com.examflow.backend.service;

import com.examflow.backend.entity.*;
import com.examflow.backend.exception.ApiException;
import com.examflow.backend.repository.ExamAttemptRepository;
import org.junit.jupiter.api.*;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.transaction.support.*;
import java.net.http.*;
import java.time.LocalDateTime;
import java.util.*;
import java.util.concurrent.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class BatchMonitoringTests {
    final ExamAttemptRepository attempts=mock(ExamAttemptRepository.class);
    final StudentProfileService photos=mock(StudentProfileService.class);
    final HttpClient client=mock(HttpClient.class);
    final BatchMonitoringService service=new BatchMonitoringService(attempts,photos,"http://localhost:8000","test-placeholder",client);
    ExamAttempt attempt;
    @BeforeEach @SuppressWarnings("unchecked") void setup() throws Exception {
        Exam exam=new Exam();
        ExamSession session=new ExamSession();session.setId(7L);session.setRoomId(9L);session.setStatus("ongoing");session.setEndTime(BatchMonitoringService.now().plusHours(1));
        attempt=new ExamAttempt();attempt.setId(1L);attempt.setExam(exam);attempt.setExamSession(session);attempt.setStartedAt(BatchMonitoringService.now());attempt.setStatus("in_progress");
        when(attempts.findOwnedAttempt(1L,25L)).thenReturn(Optional.of(attempt));
        when(photos.getFacePhotoForExam(25L)).thenReturn(new byte[]{-1,-40,-1,-39});
        ReflectionTestUtils.setField(service,"client",client);
        HttpResponse<String> response=mock(HttpResponse.class);when(response.statusCode()).thenReturn(200);when(response.body()).thenReturn("{\"status\":\"connecting\",\"captureAllowed\":true,\"lease\":7}");
        when(client.send(any(HttpRequest.class),any(HttpResponse.BodyHandler.class))).thenReturn(response);
    }
    @AfterEach void cleanup(){service.close();if(TransactionSynchronizationManager.isSynchronizationActive())TransactionSynchronizationManager.clearSynchronization();}
    @Test void anotherStudentCannotSendFramesEvenKnowingAttemptId(){
        assertThrows(ApiException.class,()->service.frame(1L,26L,new BatchMonitoringService.Frame(7,"jpeg-test","audio")));
        verifyNoInteractions(client);
    }
    @Test void submittedAndExpiredAttemptsCannotSendFrames(){
        attempt.setStatus("submitted");assertThrows(ApiException.class,()->service.frame(1,25,new BatchMonitoringService.Frame(7,"jpeg-test","audio")));
        attempt.setStatus("in_progress");attempt.getExamSession().setEndTime(BatchMonitoringService.now().minusSeconds(1));
        assertThrows(ApiException.class,()->service.frame(1,25,new BatchMonitoringService.Frame(7,"jpeg-test","audio")));verifyNoInteractions(client);
    }
    @Test void oversizeFrameRejectedBeforeCallingPython(){
        assertThrows(ApiException.class,()->service.frame(1,25,new BatchMonitoringService.Frame(7,"x".repeat(334001),"")));verifyNoInteractions(client);
    }
    @Test void statusForSubmittedAttemptNeverReRegistersIt(){attempt.setStatus("submitted");assertEquals("stopped",service.status(1,25).path("status").asString());verifyNoInteractions(client);}
    @Test void disabledSessionCannotSendOrReregisterMonitoring(){attempt.getExamSession().setAiEnabled(false);assertFalse(BatchMonitoringService.active(attempt));assertEquals("stopped",service.status(1,25).path("status").asString());assertThrows(ApiException.class,()->service.frame(1,25,new BatchMonitoringService.Frame(7,"jpeg-test","audio")));verifyNoInteractions(client);}
    @Test void registrationIsNotDispatchedBeforeCommitOrOnRollback(){
        TransactionSynchronizationManager.initSynchronization();service.queue(1,25);
        verifyNoInteractions(photos,client);
        for(TransactionSynchronization sync:TransactionSynchronizationManager.getSynchronizations())sync.afterCompletion(TransactionSynchronization.STATUS_ROLLED_BACK);
        verifyNoInteractions(photos,client);
    }
    @Test void slowPhotoAndModelRegistrationDoNotBlockOpeningExam() throws Exception {
        CountDownLatch fetching=new CountDownLatch(1),release=new CountDownLatch(1),sent=new CountDownLatch(1);
        when(photos.getFacePhotoForExam(25L)).thenAnswer(call->{fetching.countDown();assertTrue(release.await(5,TimeUnit.SECONDS));return new byte[]{-1,-40,-1,-39};});
        when(client.send(any(),any(HttpResponse.BodyHandler.class))).thenAnswer(call->{sent.countDown();HttpResponse<String> r=mock(HttpResponse.class);when(r.statusCode()).thenReturn(200);when(r.body()).thenReturn("{}");return r;});
        try{
            service.queue(1,25); // returns while the background worker is blocked on the photo
            assertTrue(fetching.await(3,TimeUnit.SECONDS));assertEquals(1,release.getCount());
            service.queue(1,25);verify(photos,times(1)).getFacePhotoForExam(25L);
        }finally{release.countDown();}
        assertTrue(sent.await(3,TimeUnit.SECONDS));
    }
    @Test void studentReceivesLeaseWithoutAnyServerSecret(){
        var status=service.status(1,25);assertEquals(7,status.path("lease").asLong());assertTrue(status.path("captureAllowed").asBoolean());assertFalse(status.toString().contains("test-placeholder"));
    }
}
