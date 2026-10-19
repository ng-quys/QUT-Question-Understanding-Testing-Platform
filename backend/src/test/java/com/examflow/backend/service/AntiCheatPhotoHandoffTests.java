package com.examflow.backend.service;

import com.examflow.backend.entity.*;
import com.examflow.backend.exception.ApiException;
import com.examflow.backend.repository.ExamAttemptRepository;
import jakarta.persistence.*;
import org.junit.jupiter.api.*;
import org.mockito.ArgumentCaptor;
import org.springframework.http.HttpStatus;
import org.springframework.test.util.ReflectionTestUtils;
import tools.jackson.databind.json.JsonMapper;
import java.net.http.*;
import java.nio.charset.StandardCharsets;
import java.time.LocalDateTime;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class AntiCheatPhotoHandoffTests {
    final AntiCheatService service=mock(AntiCheatService.class,CALLS_REAL_METHODS);
    final HttpClient client=mock(HttpClient.class);
    final StudentProfileService photos=mock(StudentProfileService.class);
    @BeforeEach void setup() {
        var attempts=mock(ExamAttemptRepository.class);
        var attempt=mock(ExamAttempt.class,RETURNS_DEEP_STUBS);
        when(attempts.findOwnedAttempt(101L,26L)).thenReturn(Optional.of(attempt));
        when(attempt.getStartedAt()).thenReturn(LocalDateTime.now());
        when(attempt.getExamSession().getEndTime()).thenReturn(LocalDateTime.now().plusHours(1));
        var em=mock(EntityManager.class); when(em.createNativeQuery(anyString())).thenReturn(mock(Query.class));
        ReflectionTestUtils.setField(service,"attemptRepository",attempts);
        ReflectionTestUtils.setField(service,"studentProfiles",photos);
        ReflectionTestUtils.setField(service,"httpClient",client);
        ReflectionTestUtils.setField(service,"objectMapper",JsonMapper.builder().build());
        ReflectionTestUtils.setField(service,"entityManager",em);
        ReflectionTestUtils.setField(service,"pythonUrl","http://127.0.0.1:8000");
        ReflectionTestUtils.setField(service,"internalSecret","internal-test-placeholder");
    }
    @Test @SuppressWarnings("unchecked") void startSendsCurrentReferenceBytesWithoutDiskPathOrStorageSecret() throws Exception {
        byte[] reference={(byte)255,(byte)216,(byte)255,(byte)217};
        when(photos.getFacePhotoForExam(26L)).thenReturn(reference);
        HttpResponse<String> response=mock(HttpResponse.class);when(response.statusCode()).thenReturn(200);when(response.body()).thenReturn("{\"ready\":true}");
        when(client.send(any(HttpRequest.class),any(HttpResponse.BodyHandler.class))).thenReturn(response);
        service.startSession(101L,26L,true);
        var request=ArgumentCaptor.forClass(HttpRequest.class);verify(client).send(request.capture(),any());
        var subscriber=HttpResponse.BodySubscribers.ofByteArray();
        request.getValue().bodyPublisher().orElseThrow().subscribe(new java.util.concurrent.Flow.Subscriber<java.nio.ByteBuffer>() {
            public void onSubscribe(java.util.concurrent.Flow.Subscription s) { subscriber.onSubscribe(s); }
            public void onNext(java.nio.ByteBuffer buffer) { subscriber.onNext(List.of(buffer)); }
            public void onError(Throwable error) { subscriber.onError(error); }
            public void onComplete() { subscriber.onComplete(); }
        });
        String json=new String(subscriber.getBody().toCompletableFuture().get(),StandardCharsets.UTF_8);
        var data=JsonMapper.builder().build().readTree(json);
        assertEquals(101,data.path("attemptId").asLong()); assertEquals(26,data.path("studentId").asLong());
        assertArrayEquals(reference,Base64.getDecoder().decode(data.path("referencePhotoBase64").asString()));
        assertFalse(data.has("referenceImage"));assertFalse(json.contains("sb_secret"));assertFalse(json.contains("student-profiles"));
        assertEquals("internal-test-placeholder",request.getValue().headers().firstValue("X-AntiCheat-Secret").orElseThrow());
    }
    @Test void missingCloudReferenceStopsStartBeforeContactingPython() {
        when(photos.getFacePhotoForExam(26L)).thenThrow(new ApiException(HttpStatus.BAD_GATEWAY,"Storage offline"));
        assertThrows(ApiException.class,()->service.startSession(101L,26L,true));verifyNoInteractions(client);
    }
}
