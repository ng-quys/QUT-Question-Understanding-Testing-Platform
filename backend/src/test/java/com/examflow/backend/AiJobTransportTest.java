package com.examflow.backend;

import com.examflow.backend.dto.*;
import com.examflow.backend.service.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.*;
import java.util.concurrent.atomic.AtomicInteger;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

/** No Spring context, real database, production job writes or model calls. */
class AiJobTransportTest {
    @Test void poll503PreservesSafeReasonAndRetryUsesSameTokenOverHttp11() throws Exception {
        var requests=new AtomicInteger();UUID token=UUID.randomUUID();
        var server=HttpServer.create(new InetSocketAddress("127.0.0.1",0),0);
        server.createContext("/credits/jobs/"+token,exchange->{
            boolean correct="GET".equals(exchange.getRequestMethod())&&exchange.getRequestHeaders().getFirst("Upgrade")==null
                &&"test-only-internal-key-at-least-32-characters".equals(exchange.getRequestHeaders().getFirst("X-AI-Internal-Key"));
            int number=requests.incrementAndGet();
            String body=number==1?"{\"detail\":\"AI_INTERNAL_KEY must be configured before generation\"}":"{\"status\":\"succeeded\",\"questions\":[]}";
            byte[] bytes=body.getBytes(StandardCharsets.UTF_8);
            exchange.sendResponseHeaders(correct?(number==1?503:200):400,bytes.length);
            exchange.getResponseBody().write(bytes);exchange.close();
        });server.start();
        try {
            var provider=new AiCreditsProvider(new ObjectMapper());
            ReflectionTestUtils.setField(provider,"url","http://127.0.0.1:"+server.getAddress().getPort());
            ReflectionTestUtils.setField(provider,"key","test-only-internal-key-at-least-32-characters");
            var error=assertThrows(AiCreditsProvider.ProviderException.class,()->provider.status(token));
            assertEquals(503,error.status());assertEquals("AI_INTERNAL_KEY_MISSING",error.code());
            assertFalse(error.getMessage().contains("test-only"));
            assertEquals("succeeded",provider.status(token).path("status").asText());assertEquals(2,requests.get());
        } finally {server.stop(0);}
    }
    @Test void missingBackendKeyDoesNotSendRequest() {
        var provider=new AiCreditsProvider(new ObjectMapper());
        ReflectionTestUtils.setField(provider,"url","http://127.0.0.1:1");
        ReflectionTestUtils.setField(provider,"key","");
        var error=assertThrows(AiCreditsProvider.ProviderException.class,()->provider.status(UUID.randomUUID()));
        assertEquals("BE_INTERNAL_KEY_MISSING",error.code());
    }
    AiGenerateRequest request(){return new AiGenerateRequest(1L,"qwen","","synthetic document",List.of(new AiGenerateRequest.AiUnitDto("Unit",2L,3L,1,0,0)),"proof",0.5);}
    Map<String,Object> row(String state) {
        var row=new HashMap<String,Object>();row.put("id",7L);row.put("requested_by",1L);row.put("execution_token",UUID.randomUUID());
        row.put("credit_state",state);row.put("dispatched_at",Timestamp.from(Instant.now()));
        row.put("lease_expires_at",Timestamp.from(Instant.now().minusSeconds(1)));return row;
    }
    void tick(AiCreditsWorker worker){ReflectionTestUtils.invokeMethod(worker,"tick");}
    @Test void failedStartIsNotReplayedAnd503NeverSettlesOrRefunds() throws Exception {
        var credits=mock(AiCreditsService.class);var provider=mock(AiCreditsProvider.class);var job=row("reserved");
        UUID token=(UUID)job.get("execution_token");
        when(credits.enabled()).thenReturn(true);when(credits.active()).thenReturn(List.of(job));
        when(credits.payload(job)).thenReturn(request());when(credits.claim(7)).thenReturn(true);
        doThrow(new AiCreditsProvider.ProviderException(503,"AI_INTERNAL_KEY_MISSING")).when(provider).start(eq(token),any());
        when(provider.status(token)).thenThrow(new AiCreditsProvider.ProviderException(503,"AI_INTERNAL_KEY_MISSING"));
        doAnswer(i->{job.put("credit_state","unknown");return null;}).when(credits).unknown(eq(7L),eq(token),anyString());
        var worker=new AiCreditsWorker(credits,provider,mock(AiGenerationService.class));
        try {
            tick(worker);tick(worker);
            verify(provider,times(1)).start(eq(token),any());verify(provider,never()).status(token);
            verify(credits,never()).finish(anyLong(),any(),anyList(),anyBoolean(),any(),any());
            verify(credits,never()).checkpoint(anyLong(),any(),anyList());
        } finally {ReflectionTestUtils.invokeMethod(worker,"close");}
    }
    @Test void lostRegistryAfterRestartDoesNotCreateReplacementJob() throws Exception {
        var credits=mock(AiCreditsService.class);var provider=mock(AiCreditsProvider.class);var job=row("unknown");
        UUID token=(UUID)job.get("execution_token");
        when(credits.enabled()).thenReturn(true);when(credits.active()).thenReturn(List.of(job));when(credits.payload(job)).thenReturn(request());
        when(provider.status(token)).thenThrow(new AiCreditsProvider.ProviderException(404,"UPSTREAM_JOB_NOT_FOUND"));
        var worker=new AiCreditsWorker(credits,provider,mock(AiGenerationService.class));
        try {
            tick(worker);tick(worker);
            verifyNoInteractions(provider);
            verify(provider,never()).start(any(),any());verify(credits,never()).claim(anyLong());
            verify(credits,never()).finish(anyLong(),any(),anyList(),anyBoolean(),any(),any());
        } finally {ReflectionTestUtils.invokeMethod(worker,"close");}
    }
    @Test void successfulPollingCheckpointsThenSettlesWithoutRestarting() throws Exception {
        var credits=mock(AiCreditsService.class);var provider=mock(AiCreditsProvider.class);var job=row("running");
        UUID token=(UUID)job.get("execution_token");var mapper=new ObjectMapper();
        var running=mapper.readTree("{\"status\":\"running\",\"questions\":[]}");
        var done=mapper.readTree("{\"status\":\"succeeded\",\"questions\":[]}");
        var questions=List.of(new AiQuestionDto("Question",List.of("a","b","c","d"),0,"","remember",2L,3L));
        when(credits.enabled()).thenReturn(true);when(credits.active()).thenReturn(List.of(job),List.of(job),List.of());
        when(credits.payload(job)).thenReturn(request());when(provider.status(token)).thenReturn(running,done);
        when(provider.questions(running)).thenReturn(List.of());when(provider.questions(done)).thenReturn(questions);
        var worker=new AiCreditsWorker(credits,provider,mock(AiGenerationService.class));
        try {
            tick(worker);tick(worker);tick(worker);
            verify(credits).checkpoint(7,token,List.of());verify(credits,times(1)).finish(7,token,questions,false,null,null);
            verify(provider,never()).start(any(),any());
        } finally {ReflectionTestUtils.invokeMethod(worker,"close");}
    }
    @Test void unknownJobIsIdleWithoutPollingCancelOrTimeoutMutation() {
        var credits=mock(AiCreditsService.class);var provider=mock(AiCreditsProvider.class);var job=row("unknown");
        job.put("cancel_requested_at",Timestamp.from(Instant.now()));
        when(credits.enabled()).thenReturn(true);when(credits.active()).thenReturn(List.of(job));
        var worker=new AiCreditsWorker(credits,provider,mock(AiGenerationService.class));
        try {
            for(int i=0;i<100;i++)tick(worker);
            verifyNoInteractions(provider);
            verify(credits,never()).cancel(anyLong(),anyLong());
            verify(credits,never()).unknown(anyLong(),any(),anyString());
            verify(credits,never()).finish(anyLong(),any(),anyList(),anyBoolean(),any(),any());
        } finally {ReflectionTestUtils.invokeMethod(worker,"close");}
    }
    @Test void transient503BacksOffAndStopsAfterFiveFailures() throws Exception {
        var credits=mock(AiCreditsService.class);var provider=mock(AiCreditsProvider.class);var job=row("running");
        Instant now=Instant.now();job.put("lease_expires_at",Timestamp.from(now.plusSeconds(3600)));
        UUID token=(UUID)job.get("execution_token");
        when(credits.enabled()).thenReturn(true);when(credits.active()).thenReturn(List.of(job));when(credits.payload(job)).thenReturn(request());
        when(provider.status(token)).thenThrow(new AiCreditsProvider.ProviderException(503,"UPSTREAM_UNAVAILABLE"));
        var worker=new AiCreditsWorker(credits,provider,mock(AiGenerationService.class));
        try {
            ReflectionTestUtils.setField(worker,"clock",java.time.Clock.fixed(now,java.time.ZoneOffset.UTC));
            for(int i=0;i<50;i++)tick(worker);
            verify(provider,times(1)).status(token);
            for(int seconds:List.of(5,15,35,75)) {
                ReflectionTestUtils.setField(worker,"clock",java.time.Clock.fixed(now.plusSeconds(seconds),java.time.ZoneOffset.UTC));
                tick(worker);
            }
            ReflectionTestUtils.setField(worker,"clock",java.time.Clock.fixed(now.plusSeconds(10000),java.time.ZoneOffset.UTC));
            for(int i=0;i<50;i++)tick(worker);
            verify(provider,times(5)).status(token);verify(credits,times(1)).unknown(eq(7L),eq(token),anyString());
            verify(credits,never()).finish(anyLong(),any(),anyList(),anyBoolean(),any(),any());
        } finally {ReflectionTestUtils.invokeMethod(worker,"close");}
    }
    @Test void absentUpstreamJobIsNotCancelledOrRetried() throws Exception {
        var credits=mock(AiCreditsService.class);var provider=mock(AiCreditsProvider.class);var job=row("cancel_requested");
        UUID token=(UUID)job.get("execution_token");job.put("cancel_requested_at",Timestamp.from(Instant.now()));
        when(credits.enabled()).thenReturn(true);when(credits.active()).thenReturn(List.of(job));when(credits.payload(job)).thenReturn(request());
        when(provider.status(token)).thenThrow(new AiCreditsProvider.ProviderException(404,"UPSTREAM_JOB_NOT_FOUND"));
        var worker=new AiCreditsWorker(credits,provider,mock(AiGenerationService.class));
        try {
            for(int i=0;i<50;i++)tick(worker);
            verify(provider,times(1)).status(token);verify(provider,never()).cancel(any());
            verify(credits,times(1)).unknown(eq(7L),eq(token),anyString());
            verify(credits,never()).finish(anyLong(),any(),anyList(),anyBoolean(),any(),any());
        } finally {ReflectionTestUtils.invokeMethod(worker,"close");}
    }
    @Test void runningJobReceivesCancelOnlyOnceWhileStatusKeepsPolling() throws Exception {
        var credits=mock(AiCreditsService.class);var provider=mock(AiCreditsProvider.class);var job=row("cancel_requested");
        UUID token=(UUID)job.get("execution_token");job.put("cancel_requested_at",Timestamp.from(Instant.now()));
        when(credits.enabled()).thenReturn(true);when(credits.active()).thenReturn(List.of(job));when(credits.payload(job)).thenReturn(request());
        var running=new ObjectMapper().readTree("{\"status\":\"running\",\"questions\":[]}");
        when(provider.status(token)).thenReturn(running);when(provider.questions(running)).thenReturn(List.of());
        var worker=new AiCreditsWorker(credits,provider,mock(AiGenerationService.class));
        try {
            tick(worker);tick(worker);tick(worker);
            verify(provider,times(3)).status(token);verify(provider,times(1)).cancel(token);
            var order=inOrder(provider);order.verify(provider).status(token);order.verify(provider).questions(running);order.verify(provider).cancel(token);
        } finally {ReflectionTestUtils.invokeMethod(worker,"close");}
    }
    @Test void startStatusAndCancelUseHttp11WithoutUpgradeOrHttp2Settings() throws Exception {
        UUID token=UUID.randomUUID();var count=new AtomicInteger();
        var server=HttpServer.create(new InetSocketAddress("127.0.0.1",0),0);
        server.createContext("/credits/jobs/"+token,exchange->{
            boolean correct="HTTP/1.1".equals(exchange.getProtocol())&&exchange.getRequestHeaders().getFirst("Upgrade")==null
                &&exchange.getRequestHeaders().getFirst("HTTP2-Settings")==null;
            exchange.getRequestBody().readAllBytes();count.incrementAndGet();
            byte[] bytes="{\"status\":\"running\",\"questions\":[],\"cancelRequested\":true}".getBytes(StandardCharsets.UTF_8);
            exchange.sendResponseHeaders(correct?200:400,bytes.length);exchange.getResponseBody().write(bytes);exchange.close();
        });server.start();
        try {
            var provider=new AiCreditsProvider(new ObjectMapper());
            ReflectionTestUtils.setField(provider,"url","http://127.0.0.1:"+server.getAddress().getPort());
            ReflectionTestUtils.setField(provider,"key","test-only-internal-key-at-least-32-characters");
            provider.start(token,request());provider.status(token);provider.cancel(token);assertEquals(3,count.get());
        } finally {server.stop(0);}
    }
}
