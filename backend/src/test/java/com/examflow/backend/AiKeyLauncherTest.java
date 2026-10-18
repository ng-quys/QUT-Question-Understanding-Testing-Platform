package com.examflow.backend;

import com.sun.net.httpserver.HttpServer;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.time.Duration;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

/** Real PowerShell HTTP handshake against local stub; Uvicorn launch is mocked. */
class AiKeyLauncherTest {
    static final String KEY="fixture-only-launcher-key-at-least-32-characters";
    record Result(int exit,String output){}
    Result run(String key,String base,String... switches) throws Exception {
        var command=new ArrayList<>(List.of("powershell.exe","-NoProfile","-NonInteractive","-File",
            Path.of("../ai-service/test-start-ai-credits.ps1").toAbsolutePath().normalize().toString(),"-BackendBaseUri",base));
        command.addAll(List.of(switches));var builder=new ProcessBuilder(command).redirectErrorStream(true);
        if(key==null)builder.environment().remove("AI_INTERNAL_KEY");else builder.environment().put("AI_INTERNAL_KEY",key);
        var process=builder.start();boolean done=process.waitFor(20,TimeUnit.SECONDS);
        if(!done)process.destroyForcibly();assertTrue(done,"Launcher test exceeded deadline");
        String output=new String(process.getInputStream().readAllBytes(),StandardCharsets.UTF_8);
        assertFalse(output.contains(KEY),"Secret must never appear in launcher output");
        return new Result(process.exitValue(),output);
    }
    void checkStatus(int status,String message,boolean start) throws Exception {
        var count=new AtomicInteger();var server=HttpServer.create(new InetSocketAddress("127.0.0.1",0),0);
        server.createContext("/",exchange->{
            count.incrementAndGet();boolean correct="/api/internal/ai-credits/verify-key".equals(exchange.getRequestURI().toString())
                &&"GET".equals(exchange.getRequestMethod())&&KEY.equals(exchange.getRequestHeaders().getFirst("X-AI-Internal-Key"))
                &&exchange.getRequestHeaders().getFirst("Authorization")==null;
            exchange.getResponseHeaders().set("Location","http://127.0.0.1:"+server.getAddress().getPort()+"/redirect-target");
            exchange.sendResponseHeaders(correct?status:400,-1);exchange.close();
        });server.start();
        try {
            var result=run(KEY,"http://127.0.0.1:"+server.getAddress().getPort());
            assertEquals(start?0:1,result.exit(),result.output());assertEquals(start,result.output().contains("TEST_UVICORN_STARTED"));
            if(message!=null)assertTrue(result.output().contains(message),result.output());
            assertEquals(1,count.get(),"No redirects or retries");
        } finally {server.stop(0);}
    }
    @Test void valid204Starts(){assertDoesNotThrow(()->checkStatus(204,null,true));}
    @Test void wrong401Blocks(){assertDoesNotThrow(()->checkStatus(401,"does not match",false));}
    @Test void unconfigured503Blocks(){assertDoesNotThrow(()->checkStatus(503,"has not configured",false));}
    @Test void health200CannotReplaceHandshake(){assertDoesNotThrow(()->checkStatus(200,"HTTP 200",false));}
    @Test void redirectDoesNotTransmitKeyAgain(){assertDoesNotThrow(()->checkStatus(302,"HTTP 302",false));}
    @Test void absentShortOrWhitespaceKeyNeverStarts() throws Exception {
        for(String key:Arrays.asList(null,"short"," ".repeat(32))) {
            var result=run(key,"http://127.0.0.1:1");assertEquals(1,result.exit());
            assertFalse(result.output().contains("TEST_UVICORN_STARTED"));assertTrue(result.output().contains("at least 32"));
        }
    }
    @Test void unavailableBackendNeverStarts() throws Exception {
        var server=HttpServer.create(new InetSocketAddress("127.0.0.1",0),0);int port=server.getAddress().getPort();server.start();server.stop(0);
        var result=run(KEY,"http://127.0.0.1:"+port);assertEquals(1,result.exit());assertTrue(result.output().contains("Backend is not ready"),result.output());
    }
    @Test void occupiedPortOrMissingPythonNeverStarts() throws Exception {
        assertTrue(run(KEY,"http://127.0.0.1:1","-BusyPort").output().contains("already listening"));
        assertTrue(run(KEY,"http://127.0.0.1:1","-MissingPython").output().contains("environment is missing"));
    }
    @Test void nonLoopbackBaseIsRejected() throws Exception {
        var result=run(KEY,"http://203.0.113.1:8080");assertEquals(1,result.exit());assertTrue(result.output().contains("literal loopback"));
    }
    @Test void timeoutBlocksWithinFiveSecondHttpDeadline() throws Exception {
        var server=HttpServer.create(new InetSocketAddress("127.0.0.1",0),0);var executor=Executors.newSingleThreadExecutor();server.setExecutor(executor);
        server.createContext("/",exchange->{try{Thread.sleep(8000);}catch(InterruptedException ignored){Thread.currentThread().interrupt();}finally{exchange.close();}});server.start();
        try {
            var started=System.nanoTime();var result=run(KEY,"http://127.0.0.1:"+server.getAddress().getPort());
            assertEquals(1,result.exit());assertTrue(result.output().contains("maximum 5 seconds"),result.output());
            assertTrue(Duration.ofNanos(System.nanoTime()-started).toSeconds()<9,"HTTP timeout plus process startup must stay bounded");
        } finally {server.stop(0);executor.shutdownNow();}
    }
}
