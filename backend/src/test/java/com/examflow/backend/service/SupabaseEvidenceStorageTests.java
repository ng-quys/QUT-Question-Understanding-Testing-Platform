package com.examflow.backend.service;

import com.examflow.backend.exception.ApiException;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.http.HttpStatus;
import java.net.http.*;
import java.time.Instant;
import java.util.UUID;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class SupabaseEvidenceStorageTests {
    final HttpClient client=mock(HttpClient.class);
    final SupabaseEvidenceStorage storage=new SupabaseEvidenceStorage("https://project.invalid","sb_secret_test_placeholder","exam-evidence",client);
    final String key="attempt-125/"+UUID.randomUUID()+".jpg";
    @SuppressWarnings("unchecked") HttpResponse<String> response(int code,String body) {
        HttpResponse<String> response=mock(HttpResponse.class); when(response.statusCode()).thenReturn(code); when(response.body()).thenReturn(body); return response;
    }
    @Test void privateBucketProducesShortLivedUrlWithServerSecretOnly() throws Exception {
        var bucketResponse=response(200,"{\"public\":false}"); var signResponse=response(200,"{\"signedURL\":\"/object/sign/exam-evidence/"+key+"?token=test-placeholder\"}");
        when(client.send(any(HttpRequest.class),any(HttpResponse.BodyHandler.class))).thenReturn(bucketResponse,signResponse);
        Instant before=Instant.now(); var link=storage.sign(125L,"exam-evidence",key);
        assertTrue(link.expiresAt().isAfter(before.plusSeconds(179))); assertTrue(link.expiresAt().isBefore(Instant.now().plusSeconds(181)));
        assertTrue(link.url().startsWith("https://project.invalid/storage/v1/object/sign/"));
        var capture=ArgumentCaptor.forClass(HttpRequest.class); verify(client,times(2)).send(capture.capture(),any());
        for (var request:capture.getAllValues()) { assertEquals("sb_secret_test_placeholder",request.headers().firstValue("apikey").orElseThrow()); assertTrue(request.headers().firstValue("Authorization").isEmpty()); }
        assertEquals("POST",capture.getAllValues().get(1).method());
    }
    @Test void publicBucketIsRejectedWithoutSigning() throws Exception {
        var bucketResponse=response(200,"{\"public\":true}");
        when(client.send(any(HttpRequest.class),any(HttpResponse.BodyHandler.class))).thenReturn(bucketResponse);
        assertEquals(HttpStatus.SERVICE_UNAVAILABLE,assertThrows(ApiException.class,()->storage.sign(125L,"exam-evidence",key)).getStatus()); verify(client,times(1)).send(any(),any());
    }
    @Test void missingStorageObjectIsClearAndDoesNotExposeBody() throws Exception {
        var bucketResponse=response(200,"{\"public\":false}"); var missingResponse=response(400,"{\"statusCode\":\"404\",\"message\":\"private-url-or-key\"}");
        when(client.send(any(HttpRequest.class),any(HttpResponse.BodyHandler.class))).thenReturn(bucketResponse,missingResponse);
        var error=assertThrows(ApiException.class,()->storage.sign(125L,"exam-evidence",key));
        assertEquals(HttpStatus.NOT_FOUND,error.getStatus()); assertFalse(error.getMessage().contains("private-url-or-key"));
    }
    @Test void arbitraryObjectKeysWrongAttemptAndWrongBucketAreRejected() {
        for(String candidate:new String[]{"attempt-126/"+UUID.randomUUID()+".jpg","attempt-125/../../secret.jpg","https://other.invalid/photo","attempt-125/name@email.jpg"}) assertThrows(ApiException.class,()->storage.sign(125L,"exam-evidence",candidate));
        assertThrows(ApiException.class,()->storage.sign(125L,"other-bucket",key)); verifyNoInteractions(client);
    }
    @Test void networkFailureIsSanitized() throws Exception {
        when(client.send(any(HttpRequest.class),any(HttpResponse.BodyHandler.class))).thenThrow(new java.io.IOException("secret-query-url"));
        assertFalse(assertThrows(ApiException.class,()->storage.sign(125L,"exam-evidence",key)).getMessage().contains("secret-query-url"));
    }
}
