package com.examflow.backend.service;

import com.examflow.backend.dto.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.test.util.ReflectionTestUtils;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.time.*;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.*;
import static org.junit.jupiter.api.Assertions.*;

/** Real PostgreSQL plus separate worker JVMs, exclusively on a disposable local fixture DB. */
@EnabledIfEnvironmentVariable(named="AI_COORDINATION_FIXTURE",matches="true")
class AiWorkerPostgresTest {
    static final String URL="jdbc:postgresql://127.0.0.1:55439/examflow_worker_test";
    final DriverManagerDataSource source=new DriverManagerDataSource(URL,"examflow_test_owner","");
    final JdbcTemplate db=new JdbcTemplate(source);
    final ObjectMapper json=new ObjectMapper();
    final List<Process> children=new ArrayList<>();
    final UUID token=UUID.randomUUID();
    final String evidence="DNS maps a domain name to its corresponding IP address.";
    HttpServer server;ExecutorService serverThreads;
    final String registry=UUID.randomUUID().toString();
    final AtomicInteger starts=new AtomicInteger(),statuses=new AtomicInteger();
    final AtomicBoolean finished=new AtomicBoolean();
    final AtomicReference<String> presentedRegistry=new AtomicReference<>();
    AiWorkerCoordinator coordination;AiCreditsService credits;

    @BeforeEach void setup()throws Exception {
        AiWorkerFixtureProcess.validateUrl(URL);
        var properties=new Properties();properties.setProperty("ApplicationName","ExamFlow-Main/ai-worker-v1-fixture");source.setConnectionProperties(properties);
        // Only these fixture tables; never a production migration.
        db.execute("DROP TABLE IF EXISTS ai_credit_transactions,ai_generation_requests,ai_credit_months,ai_credit_accounts CASCADE");
        db.execute("CREATE TABLE ai_credit_accounts(user_id bigint primary key,extra_balance bigint default 0,extra_reserved bigint default 0,updated_at timestamptz default now())");
        db.execute("CREATE TABLE ai_credit_months(user_id bigint,month_start date,monthly_limit int,used int,reserved int,primary key(user_id,month_start))");
        db.execute("""
            CREATE TABLE ai_generation_requests(id bigint primary key,requested_by bigint,credit_month date,
            credit_state text,status text,execution_token uuid,credit_payload jsonb,credit_result jsonb,
            accepted_count int,requested_question_count int,reserved_monthly int,reserved_extra int,
            charged_monthly int,charged_extra int,dispatched_at timestamptz,heartbeat_at timestamptz,
            lease_expires_at timestamptz,cancel_requested_at timestamptz,credit_completed_at timestamptz,
            completed_at timestamptz,credit_error_code text)
            """);
        db.execute("""
            CREATE TABLE ai_credit_transactions(id bigint generated always as identity,user_id bigint,
            month_start date,job_id bigint,actor_id bigint,operation_key uuid unique,event_type text,
            monthly_limit_delta int,monthly_used_delta int,monthly_reserved_delta int,
            extra_balance_delta bigint,extra_reserved_delta bigint,reason text)
            """);
        db.update("INSERT INTO ai_credit_accounts(user_id) VALUES(1)");
        db.update("INSERT INTO ai_credit_months VALUES(1,?,200,0,1)",java.sql.Date.valueOf(LocalDate.now().withDayOfMonth(1)));
        var request=new AiGenerateRequest(1L,"qwen","",evidence.repeat(5),null,"fixture-proof",0.5,
            List.of(3L),1,List.of(new AiGenerateRequest.AiCloDto(3L,"CLO1","Explain DNS")));
        db.update("""
            INSERT INTO ai_generation_requests(id,requested_by,credit_month,credit_state,status,execution_token,
            credit_payload,credit_result,accepted_count,requested_question_count,reserved_monthly,reserved_extra,
            charged_monthly,charged_extra) VALUES(101,1,?,'reserved','pending',?,?::jsonb,'[]',0,1,1,0,0,0)
            """,java.sql.Date.valueOf(LocalDate.now().withDayOfMonth(1)),token,json.writeValueAsString(request));
        coordination=new AiWorkerCoordinator(source,json);credits=new AiCreditsService(source,json,coordination);
        ReflectionTestUtils.setField(coordination,"clusterReady",true);
        presentedRegistry.set(registry);
        server=HttpServer.create(new InetSocketAddress("127.0.0.1",0),0);
        serverThreads=Executors.newCachedThreadPool();server.setExecutor(serverThreads);
        server.createContext("/",exchange->{
            String path=exchange.getRequestURI().getPath(),body;int code=200;
            if(path.equals("/health"))body="{\"registryId\":\""+presentedRegistry.get()+"\"}";
            else if(!registry.equals(exchange.getRequestHeaders().getFirst("X-AI-Registry-Id"))) {
                code=409;body="{\"detail\":\"AI execution registry mismatch\"}";
            } else if(exchange.getRequestMethod().equals("POST")) {
                starts.incrementAndGet();exchange.getRequestBody().readAllBytes();
                code=202;body="{\"status\":\"running\",\"questions\":[]}";
            }else {
                statuses.incrementAndGet();
                if(finished.get())body=json.writeValueAsString(Map.of("status","succeeded","questions",List.of(question())));
                else body="{\"status\":\"running\",\"questions\":[]}";
            }
            byte[] bytes=body.getBytes(StandardCharsets.UTF_8);exchange.sendResponseHeaders(code,bytes.length);
            exchange.getResponseBody().write(bytes);exchange.close();
        });server.start();
    }
    AiQuestionDto question(){return new AiQuestionDto("What does DNS resolve?",List.of("Domain names","Voltage","Screen size","Battery level"),0,"DNS resolves domain names.","understand",null,3L,evidence);}
    Process worker(int ticks)throws Exception {
        var java=Path.of(System.getProperty("java.home"),"bin","java.exe").toString();
        var logs=Path.of("target","worker-fixture-"+UUID.randomUUID()+".log");
        Process process=new ProcessBuilder(java,"-cp",System.getProperty("java.class.path"),AiWorkerFixtureProcess.class.getName(),URL,
            "http://127.0.0.1:"+server.getAddress().getPort(),Integer.toString(ticks)).redirectErrorStream(true).redirectOutput(logs.toFile()).start();
        children.add(process);return process;
    }
    void await(java.util.function.BooleanSupplier condition)throws Exception {
        long until=System.nanoTime()+TimeUnit.SECONDS.toNanos(20);
        while(!condition.getAsBoolean()&&System.nanoTime()<until)Thread.sleep(100);
        assertTrue(condition.getAsBoolean(),"Fixture condition timed out");
    }
    String state(){return db.queryForObject("SELECT credit_state FROM ai_generation_requests WHERE id=101",String.class);}
    void assertSettledOnce() {
        assertEquals("succeeded",state());assertEquals(1,starts.get());
        assertEquals(1,db.queryForObject("SELECT accepted_count FROM ai_generation_requests WHERE id=101",Integer.class));
        assertEquals(1,db.queryForObject("SELECT charged_monthly FROM ai_generation_requests WHERE id=101",Integer.class));
        assertEquals(1,db.queryForObject("SELECT count(*) FROM ai_credit_transactions WHERE event_type='settle'",Integer.class));
        assertEquals(1,db.queryForObject("SELECT used FROM ai_credit_months",Integer.class));
        assertEquals(0,db.queryForObject("SELECT reserved FROM ai_credit_months",Integer.class));
        assertEquals(1,db.queryForObject("SELECT jsonb_array_length(credit_result) FROM ai_generation_requests",Integer.class));
    }
    @Test void twoBackendJvmsStartOnceAndSettleOnceWithRetainedResult()throws Exception {
        worker(100);worker(100);await(()->starts.get()==1);finished.set(true);
        await(()->state().equals("succeeded"));
        for(var p:children){assertTrue(p.waitFor(20,TimeUnit.SECONDS));assertEquals(0,p.exitValue());}
        assertSettledOnce();
    }
    @Test void backendKilledAfterDispatchIsReplacedWithoutReplayingStart()throws Exception {
        Process first=worker(200);await(()->starts.get()==1&&state().equals("running"));
        first.destroyForcibly();assertTrue(first.waitFor(10,TimeUnit.SECONDS));
        finished.set(true);worker(100);await(()->state().equals("succeeded"));assertSettledOnce();
    }
    @Test void wrongRegistryCannotCheckpointUnknownOrSettleThenCorrectRegistryResumes()throws Exception {
        Process first=worker(100);await(()->starts.get()==1&&state().equals("running"));
        first.destroyForcibly();first.waitFor(10,TimeUnit.SECONDS);
        int statusesBefore=statuses.get();
        presentedRegistry.set(UUID.randomUUID().toString());
        Process wrong=worker(3);assertTrue(wrong.waitFor(15,TimeUnit.SECONDS));assertEquals(0,wrong.exitValue());
        assertEquals("running",state());assertEquals(statusesBefore,statuses.get());
        assertEquals(0,db.queryForObject("SELECT count(*) FROM ai_credit_transactions",Integer.class));
        presentedRegistry.set(registry);finished.set(true);worker(100);
        await(()->state().equals("succeeded"));assertSettledOnce();
    }
    @Test void nonOwnerAndLostDatabaseSessionCannotMutateCredits()throws Exception {
        assertThrows(IllegalStateException.class,()->credits.checkpointOwned(101,token,List.of(question())));
        assertThrows(IllegalStateException.class,()->credits.unknownOwned(101,token,"fixture"));
        assertThrows(IllegalStateException.class,()->credits.finishOwned(101,token,List.of(question()),false,null,null));
        assertThrows(IllegalStateException.class,()->coordination.run(101,token,registry,row->{
            assertTrue(credits.claim(101));
            int pid=db.queryForObject("SELECT pg_backend_pid()",Integer.class);
            // Terminate only this test's known session, using a second fixture connection.
            new JdbcTemplate(new DriverManagerDataSource(URL,"examflow_test_owner","")).queryForObject("SELECT pg_terminate_backend(?)",Boolean.class,pid);
            credits.unknownOwned(101,token,"must not write after lost authority");
        }));
        assertEquals("running",state());
        assertEquals(0,db.queryForObject("SELECT count(*) FROM ai_credit_transactions",Integer.class));
        assertTrue(coordination.run(101,token,registry,row->credits.finishOwned(101,token,List.of(question()),false,null,null)));
        assertEquals("succeeded",state());
    }
    @Test void observableLegacyPollerBlocksNewGenerationReadiness()throws Exception {
        var legacy=new DriverManagerDataSource(URL,"examflow_test_owner","");
        try(var connection=legacy.getConnection();var query=connection.createStatement()) {
            query.execute("SELECT * FROM public.ai_generation_requests WHERE credit_state IN ('reserved','running','cancel_requested') ORDER BY id LIMIT 100");
            assertEquals(503,assertThrows(org.springframework.web.server.ResponseStatusException.class,coordination::requireReady).getStatusCode().value());
        }
        assertDoesNotThrow(coordination::requireReady);
        assertEquals("reserved",state());
    }
    @Test void hikariReusesLockSessionAcrossCommittedClaimAndReturnsItUnlocked()throws Exception {
        try(var pool=new com.zaxxer.hikari.HikariDataSource()) {
            pool.setJdbcUrl(URL);pool.setUsername("examflow_test_owner");pool.setPassword("");
            pool.setMaximumPoolSize(1);pool.setMinimumIdle(0);
            pool.addDataSourceProperty("ApplicationName","ExamFlow-Main/ai-worker-v1-fixture");
            var owner=new AiWorkerCoordinator(pool,json);
            var service=new AiCreditsService(pool,json,owner);
            assertThrows(IllegalArgumentException.class,()->owner.run(101,token,registry,row->{
                assertTrue(service.claim(101));throw new IllegalArgumentException("fixture dispatch interruption");
            }));
            // Claim survives the callback failure. A replacement must GET, never resend start.
            assertEquals("running",state());
            assertEquals(0,new JdbcTemplate(pool).queryForObject("SELECT count(*) FROM pg_locks WHERE pid=pg_backend_pid() AND locktype='advisory'",Integer.class));
            assertTrue(owner.run(101,token,registry,row->service.finishOwned(101,token,List.of(question()),false,null,null)));
            assertEquals("succeeded",state());
            assertEquals(0,new JdbcTemplate(pool).queryForObject("SELECT count(*) FROM pg_locks WHERE pid=pg_backend_pid() AND locktype='advisory'",Integer.class));
        }
    }
    @AfterEach void cleanup()throws Exception {
        for(var p:children)if(p.isAlive()){p.destroyForcibly();p.waitFor(10,TimeUnit.SECONDS);}
        if(server!=null)server.stop(0);if(serverThreads!=null)serverThreads.shutdownNow();
    }
}
