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
    @Test void registryChangeDuringRequestDoesNotMarkJobUnknown()throws Exception {
        var credits=mock(AiCreditsService.class);var provider=mock(AiCreditsProvider.class);var job=row("running");
        UUID token=(UUID)job.get("execution_token");
        when(credits.enabled()).thenReturn(true);when(credits.active()).thenReturn(List.of(job));
        when(credits.payload(job)).thenReturn(request());
        when(provider.status(token)).thenThrow(new AiCreditsProvider.ProviderException(409,"UPSTREAM_REGISTRY_MISMATCH"));
        var worker=worker(credits,provider,job);
        try {
            tick(worker);verify(credits,never()).unknownOwned(anyLong(),any(),anyString());
            verify(credits,never()).checkpointOwned(anyLong(),any(),anyList());
            verify(credits,never()).finishOwned(anyLong(),any(),anyList(),anyBoolean(),any(),any());
            verify(provider,never()).start(any(),any(),anyString());
        }finally{ReflectionTestUtils.invokeMethod(worker,"close");}
    }
    @Test void disabledSecondaryNeverPollsAnotherInstancesRegistryOrAllocatesCredits() {
        var credits=mock(AiCreditsService.class);var provider=mock(AiCreditsProvider.class);
        var worker=worker(credits,provider,null);
        ReflectionTestUtils.setField(worker,"workerEnabled",false);
        try {
            ReflectionTestUtils.invokeMethod(worker,"start");
            for(int i=0;i<10;i++)tick(worker);
            verifyNoInteractions(credits,provider);
        } finally {ReflectionTestUtils.invokeMethod(worker,"close");}
    }
    @Test void restartedBackendReadsExistingTerminalResultWithoutStartingGeneration() throws Exception {
        var credits=mock(AiCreditsService.class);var provider=mock(AiCreditsProvider.class);var job=row("running");
        UUID token=(UUID)job.get("execution_token");
        var done=new ObjectMapper().readTree("{\"status\":\"succeeded\",\"questions\":[]}");
        var questions=List.of(new AiQuestionDto("Retained question",List.of("a","b","c","d"),0,"Explanation","understand",null,3L,"Synthetic source evidence long enough."));
        when(credits.enabled()).thenReturn(true);when(credits.active()).thenReturn(List.of(job));
        when(credits.payload(job)).thenReturn(request());when(provider.status(token)).thenReturn(done);
        when(provider.questions(done)).thenReturn(questions);
        var worker=worker(credits,provider,job);
        try {
            tick(worker);
            verify(credits).finish(7,token,questions,false,null,null);
            verify(provider,never()).start(any(),any());verify(credits,never()).claim(anyLong());
        } finally {ReflectionTestUtils.invokeMethod(worker,"close");}
    }
    @Test void temporaryNetworkFailureRecoversSameTokenAndPreservesTerminalResult() throws Exception {
        var credits=mock(AiCreditsService.class);var provider=mock(AiCreditsProvider.class);var job=row("running");
        Instant now=Instant.now();job.put("lease_expires_at",Timestamp.from(now.plusSeconds(3600)));
        UUID token=(UUID)job.get("execution_token");
        var done=new ObjectMapper().readTree("{\"status\":\"succeeded\",\"questions\":[]}");
        when(credits.enabled()).thenReturn(true);when(credits.active()).thenReturn(List.of(job));
        when(credits.payload(job)).thenReturn(request());
        when(provider.status(token)).thenThrow(new java.net.SocketTimeoutException()).thenReturn(done);
        when(provider.questions(done)).thenReturn(List.of());
        var worker=worker(credits,provider,job);
        try {
            ReflectionTestUtils.setField(worker,"clock",java.time.Clock.fixed(now,java.time.ZoneOffset.UTC));tick(worker);
            verify(credits,never()).unknown(anyLong(),any(),anyString());
            ReflectionTestUtils.setField(worker,"clock",java.time.Clock.fixed(now.plusSeconds(5),java.time.ZoneOffset.UTC));tick(worker);
            verify(provider,times(2)).status(token);verify(provider,never()).start(any(),any());
            verify(credits).finish(7,token,List.of(),false,null,null);
        } finally {ReflectionTestUtils.invokeMethod(worker,"close");}
    }
    @Test void explicitReconciliationRecoversExistingResultOnceAndNeverUsesReleaseFallback() throws Exception {
        var credits=mock(AiCreditsService.class);var provider=mock(AiCreditsProvider.class);var job=row("unknown");
        UUID token=(UUID)job.get("execution_token");
        var done=new ObjectMapper().readTree("{\"status\":\"succeeded\",\"questions\":[]}");
        var questions=List.of(new AiQuestionDto("Retained question",List.of("a","b","c","d"),0,"Explanation","understand",null,3L,"Synthetic source evidence long enough."));
        when(credits.raw(7)).thenReturn(job);when(credits.payload(job)).thenReturn(request());
        when(provider.status(token)).thenReturn(done);when(provider.questions(done)).thenReturn(questions);
        when(credits.job(1,7)).thenAnswer(i->Map.of("creditState",job.get("credit_state")));
        doAnswer(i->{job.put("credit_state","succeeded");return null;})
            .when(credits).finish(7,token,questions,false,2L,"Fixture recovery");
        var worker=worker(credits,provider,job);
        try {
            assertEquals("succeeded",worker.reconcile(2,7,true,"Fixture recovery").get("creditState"));
            worker.reconcile(2,7,true,"Fixture recovery");
            verify(credits,times(1)).finish(7,token,questions,false,2L,"Fixture recovery");
            verify(credits,never()).reconcile(anyLong(),anyLong(),anyBoolean(),anyString());
            verify(provider,never()).start(any(),any());verify(provider,times(1)).status(token);
        } finally {ReflectionTestUtils.invokeMethod(worker,"close");}
    }
    @Test void anotherWorkerWithMissingRegistryCanMarkOwnersRunningJobUnknown() throws Exception {
        // Pure mock reproduction: no production job, connection, model or ledger write.
        var credits=mock(AiCreditsService.class);
        var ownerProvider=mock(AiCreditsProvider.class);
        var otherProvider=mock(AiCreditsProvider.class);
        var shared=row("reserved");
        shared.put("lease_expires_at",Timestamp.from(Instant.now().plusSeconds(3600)));
        UUID token=(UUID)shared.get("execution_token");
        when(credits.enabled()).thenReturn(true);
        when(credits.active()).thenReturn(List.of(shared));
        when(credits.payload(shared)).thenReturn(request());
        when(credits.claim(7L)).thenAnswer(i->{shared.put("credit_state","running");return true;});
        when(otherProvider.status(token)).thenThrow(new AiCreditsProvider.ProviderException(404,"UPSTREAM_JOB_NOT_FOUND"));
        doAnswer(i->{shared.put("credit_state","unknown");return null;})
            .when(credits).unknown(eq(7L),eq(token),anyString());
        var owner=worker(credits,ownerProvider,shared);
        var other=worker(credits,otherProvider,shared);
        try {
            tick(owner);assertEquals("running",shared.get("credit_state"));
            tick(other);assertEquals("unknown",shared.get("credit_state"));
            tick(owner);
            verify(ownerProvider,times(1)).start(eq(token),any(),anyString(),eq(7L));
            verify(ownerProvider,never()).status(token);
            verify(otherProvider,times(1)).status(token);
            verify(credits,never()).finish(anyLong(),any(),anyList(),anyBoolean(),any(),any());
        } finally {
            ReflectionTestUtils.invokeMethod(owner,"close");
            ReflectionTestUtils.invokeMethod(other,"close");
        }
    }
    @Test void cloStartSendsTrustedClosCountAndNullLegacyFieldsOverHttp11() throws Exception {
        var mapper=new ObjectMapper();
        var captured=new java.util.concurrent.atomic.AtomicReference<com.fasterxml.jackson.databind.JsonNode>();
        var protocol=new java.util.concurrent.atomic.AtomicReference<String>();
        var method=new java.util.concurrent.atomic.AtomicReference<String>();
        var auth=new java.util.concurrent.atomic.AtomicReference<String>();
        UUID token=UUID.randomUUID();
        var server=HttpServer.create(new InetSocketAddress("127.0.0.1",0),0);
        server.createContext("/credits/jobs/"+token,exchange->{
            captured.set(mapper.readTree(exchange.getRequestBody()));
            protocol.set(exchange.getProtocol());method.set(exchange.getRequestMethod());
            auth.set(exchange.getRequestHeaders().getFirst("X-AI-Internal-Key"));
            byte[] body="{\"status\":\"running\",\"questions\":[]}".getBytes(StandardCharsets.UTF_8);
            exchange.sendResponseHeaders(202,body.length);exchange.getResponseBody().write(body);exchange.close();
        });server.start();
        try {
            var provider=new AiCreditsProvider(mapper);
            ReflectionTestUtils.setField(provider,"url","http://127.0.0.1:"+server.getAddress().getPort());
            ReflectionTestUtils.setField(provider,"key","test-only-internal-key-at-least-32-characters");
            var request=new AiGenerateRequest(11L,"qwen",null,"Synthetic document for HTTP contract",null,
                "synthetic-proof",0.5,List.of(25L),10,
                List.of(new AiGenerateRequest.AiCloDto(25L,"CLO1","Explain DNS")),5,null,3);
            provider.start(token,request);
            var payload=captured.get();
            assertEquals("POST",method.get());assertEquals("HTTP/1.1",protocol.get());
            assertEquals("test-only-internal-key-at-least-32-characters",auth.get());
            assertEquals(10,payload.path("questionCount").asInt());
            assertEquals(3,payload.path("inferenceBatchSize").asInt());
            assertEquals(5,payload.path("batchSize").asInt());
            assertEquals(25,payload.path("cloIds").get(0).asInt());
            assertEquals("Explain DNS",payload.path("selectedClos").get(0).path("description").asText());
            assertTrue(payload.has("instruction")&&payload.get("instruction").isNull());
            assertTrue(payload.has("units")&&payload.get("units").isNull());
        } finally {server.stop(0);}
    }
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

    AiCreditsWorker worker(AiCreditsService credits,AiCreditsProvider provider,Map<String,Object> row) {
        var coordination=mock(AiWorkerCoordinator.class);
        when(coordination.isClusterReady()).thenReturn(true);
        try {
            when(provider.registryId()).thenReturn("00000000-0000-0000-0000-000000000001");
            doAnswer(i->{provider.start(i.getArgument(0),i.getArgument(1));return null;}).when(provider).start(any(),any(),anyString());
            when(provider.status(any(),anyString())).thenAnswer(i->provider.status(i.getArgument(0)));
            doAnswer(i->{provider.cancel(i.getArgument(0));return null;}).when(provider).cancel(any(),anyString());
        } catch(Exception e){throw new RuntimeException(e);}
        when(coordination.run(anyLong(),any(),anyString(),any())).thenAnswer(i->{
            java.util.function.Consumer<Map<String,Object>> action=i.getArgument(3);action.accept(row);return true;
        });
        doAnswer(i->{credits.checkpoint(i.getArgument(0),i.getArgument(1),i.getArgument(2));return null;}).when(credits).checkpointOwned(anyLong(),any(),anyList());
        doAnswer(i->{credits.unknown(i.getArgument(0),i.getArgument(1),i.getArgument(2));return null;}).when(credits).unknownOwned(anyLong(),any(),anyString());
        doAnswer(i->{credits.finish(i.getArgument(0),i.getArgument(1),i.getArgument(2),i.getArgument(3),i.getArgument(4),i.getArgument(5));return null;}).when(credits).finishOwned(anyLong(),any(),anyList(),anyBoolean(),any(),any());
        return new AiCreditsWorker(credits,provider,mock(AiGenerationService.class),coordination);
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
        doThrow(new AiCreditsProvider.ProviderException(503,"AI_INTERNAL_KEY_MISSING")).when(provider).start(eq(token),any(),anyString(),eq(7L));
        when(provider.status(token)).thenThrow(new AiCreditsProvider.ProviderException(503,"AI_INTERNAL_KEY_MISSING"));
        doAnswer(i->{job.put("credit_state","unknown");return null;}).when(credits).unknown(eq(7L),eq(token),anyString());
        var worker=worker(credits,provider,job);
        try {
            tick(worker);tick(worker);
            verify(provider,times(1)).start(eq(token),any(),anyString(),eq(7L));verify(provider,never()).status(token);
            verify(credits,never()).finish(anyLong(),any(),anyList(),anyBoolean(),any(),any());
            verify(credits,never()).checkpoint(anyLong(),any(),anyList());
        } finally {ReflectionTestUtils.invokeMethod(worker,"close");}
    }
    @Test void lostRegistryAfterRestartDoesNotCreateReplacementJob() throws Exception {
        var credits=mock(AiCreditsService.class);var provider=mock(AiCreditsProvider.class);var job=row("unknown");
        UUID token=(UUID)job.get("execution_token");
        when(credits.enabled()).thenReturn(true);when(credits.active()).thenReturn(List.of(job));when(credits.payload(job)).thenReturn(request());
        when(provider.status(token)).thenThrow(new AiCreditsProvider.ProviderException(404,"UPSTREAM_JOB_NOT_FOUND"));
        var worker=worker(credits,provider,job);
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
        var worker=worker(credits,provider,job);
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
        var worker=worker(credits,provider,job);
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
        var worker=worker(credits,provider,job);
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
        var worker=worker(credits,provider,job);
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
        var worker=worker(credits,provider,job);
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
