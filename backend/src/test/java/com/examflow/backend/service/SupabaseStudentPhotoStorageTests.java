package com.examflow.backend.service;

import com.examflow.backend.exception.ApiException;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.http.HttpStatus;
import java.net.http.*;
import java.nio.charset.StandardCharsets;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class SupabaseStudentPhotoStorageTests {
    final HttpClient client=mock(HttpClient.class);
    final SupabaseStudentPhotoStorage storage=new SupabaseStudentPhotoStorage("https://project.invalid","sb_secret_placeholder","student-photos",client);
    final String key=storage.newKey(26L);
    final byte[] jpeg={(byte)255,(byte)216,(byte)255,0,(byte)255,(byte)217};
    @SuppressWarnings("unchecked") HttpResponse<byte[]> response(int code,byte[] bytes) {
        HttpResponse<byte[]> response=mock(HttpResponse.class); when(response.statusCode()).thenReturn(code); when(response.body()).thenReturn(bytes); return response;
    }
    HttpResponse<byte[]> json(int code,String text) { return response(code,text.getBytes(StandardCharsets.UTF_8)); }
    @Test void privateUploadAndAuthenticatedDownloadUseServerKey() throws Exception {
        var privateBucket=json(200,"{\"public\":false}"); var uploaded=json(200,"{}"); var photo=response(200,jpeg);
        when(client.send(any(HttpRequest.class),any(HttpResponse.BodyHandler.class))).thenReturn(privateBucket,uploaded,privateBucket,photo);
        storage.upload(26L,key,jpeg); assertArrayEquals(jpeg,storage.download(26L,"student-photos",key));
        var capture=ArgumentCaptor.forClass(HttpRequest.class); verify(client,times(4)).send(capture.capture(),any());
        var requests=capture.getAllValues(); assertEquals("POST",requests.get(1).method());
        assertTrue(requests.get(3).uri().getPath().contains("/object/authenticated/student-photos/student-26/"));
        for(var request:requests) {
            assertEquals("sb_secret_placeholder",request.headers().firstValue("apikey").orElseThrow());
            assertTrue(request.headers().firstValue("Authorization").isEmpty()); assertTrue(request.timeout().isPresent());
        }
    }
    @Test void publicBucketRejectedBeforeUpload() throws Exception {
        var publicBucket=json(200,"{\"public\":true}");
        when(client.send(any(HttpRequest.class),any(HttpResponse.BodyHandler.class))).thenReturn(publicBucket);
        assertEquals(HttpStatus.SERVICE_UNAVAILABLE,assertThrows(ApiException.class,()->storage.upload(26L,key,jpeg)).getStatus());
        verify(client,times(1)).send(any(),any());
    }
    @Test void wrongOwnerTraversalAndBucketAreRejectedBeforeNetwork() {
        for(String candidate:new String[]{"student-27/"+java.util.UUID.randomUUID()+".jpg","student-26/../../x.jpg","https://other.invalid/image"})
            assertThrows(ApiException.class,()->storage.download(26L,"student-photos",candidate));
        assertThrows(ApiException.class,()->storage.download(26L,"exam-evidence",key)); verifyNoInteractions(client);
    }
    @Test void missingImageAndNetworkFailuresHaveSanitizedErrors() throws Exception {
        var privateBucket=json(200,"{\"public\":false}"); var missing=json(400,"{\"statusCode\":\"404\",\"message\":\"private-key\"}");
        when(client.send(any(HttpRequest.class),any(HttpResponse.BodyHandler.class))).thenReturn(privateBucket,missing);
        var error=assertThrows(ApiException.class,()->storage.download(26L,"student-photos",key));
        assertEquals(HttpStatus.NOT_FOUND,error.getStatus()); assertFalse(error.getMessage().contains("private-key"));
        reset(client); when(client.send(any(HttpRequest.class),any(HttpResponse.BodyHandler.class))).thenThrow(new java.io.IOException("private-key"));
        assertFalse(assertThrows(ApiException.class,()->storage.upload(26L,key,jpeg)).getMessage().contains("private-key"));
    }
    @Test void emptyAndOversizedPhotosRejectedBeforeNetwork() {
        assertThrows(ApiException.class,()->storage.upload(26L,key,new byte[0]));
        assertThrows(ApiException.class,()->storage.upload(26L,key,new byte[SupabaseStudentPhotoStorage.MAX_BYTES+1])); verifyNoInteractions(client);
    }
    @Test void missingConfigDoesNotUsePublicOrLocalFallback() {
        var missing=new SupabaseStudentPhotoStorage("","","student-photos",client);
        assertEquals(HttpStatus.SERVICE_UNAVAILABLE,assertThrows(ApiException.class,()->missing.upload(26L,key,jpeg)).getStatus()); verifyNoInteractions(client);
    }
    @Test void oversizedDownloadIsCancelledWhileReceiving() {
        var body=new SupabaseStudentPhotoStorage.LimitedBody();
        var subscription=mock(java.util.concurrent.Flow.Subscription.class);body.onSubscribe(subscription);
        body.onNext(java.util.List.of(java.nio.ByteBuffer.allocate(SupabaseStudentPhotoStorage.MAX_BYTES+1)));
        verify(subscription).cancel();
        assertThrows(java.util.concurrent.CompletionException.class,()->body.getBody().toCompletableFuture().join());
    }
}
