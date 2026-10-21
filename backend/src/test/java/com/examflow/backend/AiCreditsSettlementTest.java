package com.examflow.backend;

import com.examflow.backend.dto.*;
import com.examflow.backend.service.AiCreditsService;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.util.ReflectionTestUtils;
import javax.sql.DataSource;
import java.sql.Connection;
import java.time.LocalDate;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/** Real TransactionTemplate, entirely mocked JDBC: never opens a network connection. */
class AiCreditsSettlementTest {
    void useAutomaticRequest() throws Exception {
        var request=new AiGenerateRequest(1L,"qwen","","Evidence: synthetic document supports this question. ".repeat(5),null,"proof",0.5,
            List.of(3L,4L),10,List.of(new AiGenerateRequest.AiCloDto(3L,"CLO1","DB description"),new AiGenerateRequest.AiCloDto(4L,"CLO2","DB description 2")));
        row.put("credit_payload",new ObjectMapper().writeValueAsString(request));
    }
    List<AiQuestionDto> automaticQuestions(int count) {
        var out=new ArrayList<AiQuestionDto>();
        for(int i=0;i<count;i++)out.add(new AiQuestionDto("Question "+i,List.of("a","b","c","d"),0,"Explanation",i%2==0?"apply":"understand",null,i%2==0?3L:4L,"synthetic document supports this question."));
        return out;
    }
    @Test void automaticSevenValidOutOfTenUsesExistingSettlementAndReleasesThree() throws Exception {
        useAutomaticRequest();service.finish(7,token,automaticQuestions(7),false,null,null);
        verify(jdbc).update(startsWith("UPDATE public.ai_credit_accounts SET extra_balance"),eq(2),eq(5),eq(1L));
        verify(jdbc).update(startsWith("UPDATE public.ai_credit_months SET used"),eq(5),eq(5),eq(1L),eq(originalMonth));
        verify(connection).commit();
    }
    @Test void automaticCandidatesCannotUseUnselectedCloInvalidBloomOrUnsupportedEvidence() throws Exception {
        useAutomaticRequest();
        var candidates=new ArrayList<>(automaticQuestions(12));
        candidates.add(0,new AiQuestionDto("wrong clo",List.of("a","b","c","d"),0,"Explanation","apply",null,99L,"synthetic document supports this question."));
        candidates.add(0,new AiQuestionDto("wrong bloom",List.of("a","b","c","d"),0,"Explanation","analyze",null,3L,"synthetic document supports this question."));
        candidates.add(0,new AiQuestionDto("no evidence",List.of("a","b","c","d"),0,"Explanation","apply",null,3L,"This evidence does not exist in the actual source."));
        var accepted=service.validate(row,candidates);
        assertEquals(10,accepted.size());assertTrue(accepted.stream().allMatch(q->q.content().startsWith("Question ")));
    }
    @Test void automaticTotalFailureStillReleasesAllReservedCredits() throws Exception {
        useAutomaticRequest();service.finish(7,token,List.of(),false,null,"provider failed");
        verify(jdbc).update(contains("INSERT INTO public.ai_credit_transactions"),eq(1L),eq(originalMonth),eq(7L),isNull(),any(UUID.class),eq("release"),eq(0),eq(0),eq(-5),eq(0L),eq(-5L),eq("provider failed"));
    }
    @Test void foreignCloIsRejectedBeforeAnyReservation() throws Exception {
        enableForUnitTest();ReflectionTestUtils.setField(service,"secret","test-only-key-at-least-32-characters-long");
        String text="Document content that is authentic and long enough for validation.";
        var request=new AiGenerateRequest(1L,"qwen","",text,null,service.documentProof(1,text),0.5,List.of(99L),1,null);
        when(jdbc.queryForObject(contains("public.courses"),eq(Long.class),any(Object[].class))).thenReturn(1L);
        when(jdbc.queryForList(contains("FROM public.clos"),any(Object[].class))).thenReturn(List.of());
        var error=assertThrows(org.springframework.web.server.ResponseStatusException.class,()->service.create(1,UUID.randomUUID(),request));
        assertEquals(400,error.getStatusCode().value());
        verify(jdbc,never()).update(startsWith("UPDATE public.ai_credit_accounts"),any(Object[].class));
    }
    @Test void automaticRequestUsesDatabaseCloDescriptionInsteadOfClientDescription() throws Exception {
        enableForUnitTest();ReflectionTestUtils.setField(service,"secret","test-only-key-at-least-32-characters-long");
        row.put("monthly_limit",200);row.put("used",0);row.put("reserved",0);row.put("extra_balance",0L);row.put("extra_reserved",0L);
        String text="Document content that is authentic and long enough for validation.";
        var request=new AiGenerateRequest(1L,"qwen","",text,null,service.documentProof(1,text),0.5,List.of(3L),1,
            List.of(new AiGenerateRequest.AiCloDto(3L,"FORGED","client description must be ignored")));
        when(jdbc.queryForObject(anyString(),eq(Long.class),any(Object[].class))).thenReturn(0L);
        when(jdbc.queryForObject(contains("public.courses"),eq(Long.class),any(Object[].class))).thenReturn(1L);
        when(jdbc.queryForList(contains("FROM public.clos"),any(Object[].class)))
            .thenReturn(List.of(Map.of("id",3L,"code","CLO_DB","description","Trusted database description")));
        var stored=new java.util.concurrent.atomic.AtomicReference<String>();
        doAnswer(invocation->{Object[] arguments=(Object[])invocation.getRawArguments()[2];stored.set((String)arguments[7]);return 7L;})
            .when(jdbc).queryForObject(contains("INSERT INTO public.ai_generation_requests"),eq(Long.class),any(Object[].class));
        service.create(1,UUID.randomUUID(),request);
        var saved=new ObjectMapper().readValue(stored.get(),AiGenerateRequest.class);
        assertEquals("Trusted database description",saved.selectedClos().get(0).description());
        assertEquals("CLO_DB",saved.selectedClos().get(0).code());
    }
    @Test void automaticIdempotentRetryDoesNotReserveAgain() throws Exception {
        enableForUnitTest();useAutomaticRequest();
        var source=new AiGenerateRequest(1L,"qwen","",service.payload(row).sourceText(),null,"proof",0.5,List.of(3L,4L),10,null);
        String hash=HexFormat.of().formatHex(java.security.MessageDigest.getInstance("SHA-256").digest(new ObjectMapper().writeValueAsBytes(source)));
        when(jdbc.queryForList(contains("idempotency_key"),any(Object[].class)))
            .thenReturn(List.of(Map.of("id",7L,"payload_sha256",hash)));
        assertEquals(7L,service.create(1,UUID.randomUUID(),source).get("id"));
        verify(jdbc,never()).update(startsWith("UPDATE public.ai_credit_accounts"),any(Object[].class));
    }
    Connection connection;
    JdbcTemplate jdbc;
    AiCreditsService service;
    Map<String,Object> row;
    UUID token = UUID.randomUUID();
    LocalDate originalMonth = LocalDate.of(2026, 9, 1);

    @BeforeEach void setup() throws Exception {
        DataSource source=mock(DataSource.class);
        connection=mock(Connection.class);
        when(source.getConnection()).thenReturn(connection);
        when(connection.getAutoCommit()).thenReturn(true);
        jdbc=mock(JdbcTemplate.class);
        var mapper=new ObjectMapper();
        service=new AiCreditsService(source,mapper,mock(com.examflow.backend.service.AiWorkerCoordinator.class));
        ReflectionTestUtils.setField(service,"db",jdbc);
        var request=new AiGenerateRequest(1L,"qwen","","synthetic document ".repeat(5),
            List.of(new AiGenerateRequest.AiUnitDto("unit",2L,3L,10,0,0)),"proof",0.5);
        row=new HashMap<>();
        row.put("id",7L);row.put("requested_by",1L);
        row.put("credit_month",java.sql.Date.valueOf(originalMonth));
        row.put("credit_state","running");row.put("execution_token",token);
        row.put("credit_payload",mapper.writeValueAsString(request));
        row.put("credit_result","[]");row.put("accepted_count",0);
        row.put("reserved_monthly",5);row.put("reserved_extra",5);
        row.put("requested_question_count",10);
        when(jdbc.queryForMap(anyString(),any(Object[].class))).thenReturn(row);
    }
    List<AiQuestionDto> questions(int count) {
        var out=new ArrayList<AiQuestionDto>();
        for(int i=0;i<count;i++)out.add(new AiQuestionDto("Question "+i,List.of("a","b","c","d"),0,"","remember",2L,3L));
        return out;
    }
    @Test void partialSettlementChargesSevenAndReleasesEntireReservationInOriginalMonth() throws Exception {
        service.finish(7,token,questions(7),false,null,null);
        verify(jdbc).update(startsWith("UPDATE public.ai_credit_accounts SET extra_balance"),eq(2),eq(5),eq(1L));
        verify(jdbc).update(startsWith("UPDATE public.ai_credit_months SET used"),eq(5),eq(5),eq(1L),eq(originalMonth));
        verify(jdbc).update(contains("INSERT INTO public.ai_credit_transactions"),eq(1L),eq(originalMonth),eq(7L),isNull(),any(UUID.class),eq("settle"),eq(0),eq(5),eq(-5),eq(-2L),eq(-5L),isNull());
        verify(connection).commit();verify(connection,never()).rollback();
    }
    @Test void totalFailureReleasesWithoutCharge() throws Exception {
        service.finish(7,token,List.of(),false,null,"provider failed");
        verify(jdbc).update(contains("INSERT INTO public.ai_credit_transactions"),eq(1L),eq(originalMonth),eq(7L),isNull(),any(UUID.class),eq("release"),eq(0),eq(0),eq(-5),eq(0L),eq(-5L),eq("provider failed"));
        verify(connection).commit();
    }
    @Test void ledgerFailureRollsBackAllBalanceAndJobWrites() throws Exception {
        doThrow(new IllegalStateException("ledger unavailable")).when(jdbc).update(contains("INSERT INTO public.ai_credit_transactions"),any(Object[].class));
        assertThrows(IllegalStateException.class,()->service.finish(7,token,questions(7),false,null,null));
        verify(connection).rollback();verify(connection,never()).commit();
    }
    @Test void terminalJobAndStaleTokenCannotChargeAgain() {
        row.put("credit_state","partial");
        service.finish(7,token,questions(7),false,null,null);
        row.put("credit_state","running");
        service.finish(7,UUID.randomUUID(),questions(7),false,null,null);
        verify(jdbc,never()).update(startsWith("UPDATE public.ai_credit_accounts SET extra_balance"),any(Object[].class));
        verify(jdbc,never()).update(contains("INSERT INTO public.ai_credit_transactions"),any(Object[].class));
    }
    @Test void repeatedFinishAfterTerminalUpdateWritesOnlyOneSettlement() {
        doAnswer(i->{row.put("credit_state","partial");return 1;})
            .when(jdbc).update(contains("SET credit_state=?,status=?,credit_result="),any(Object[].class));
        service.finish(7,token,questions(7),false,null,null);
        service.finish(7,token,questions(7),false,null,null);
        verify(jdbc,times(1)).update(startsWith("UPDATE public.ai_credit_months SET used"),any(Object[].class));
        verify(jdbc,times(1)).update(contains("INSERT INTO public.ai_credit_transactions"),any(Object[].class));
        verify(jdbc,times(2)).queryForMap("SELECT * FROM public.ai_generation_requests WHERE id=? FOR UPDATE",7L);
    }
    @Test void claimLocksJobAndRejectsAlreadyClaimedRow() {
        row.put("credit_state","reserved");
        doAnswer(i->{row.put("credit_state","running");return 1;})
            .when(jdbc).update(startsWith("UPDATE public.ai_generation_requests SET credit_state='running'"),any(Object[].class));
        assertTrue(service.claim(7));assertFalse(service.claim(7));
        verify(jdbc,times(2)).queryForMap("SELECT * FROM public.ai_generation_requests WHERE id=? FOR UPDATE",7L);
        verify(jdbc,times(1)).update(startsWith("UPDATE public.ai_generation_requests SET credit_state='running'"),any(Object[].class));
    }
    @Test void checkpointCannotDecreaseAcceptedResults() {
        row.put("accepted_count",7);
        service.checkpoint(7,token,questions(5));
        verify(jdbc,never()).update(startsWith("UPDATE public.ai_generation_requests SET credit_result"),any(Object[].class));
    }
    void enableForUnitTest() {
        ReflectionTestUtils.setField(service,"enabled",true);
        ReflectionTestUtils.setField(service,"monthlyLimit",200);
        ReflectionTestUtils.setField(service,"maximum",45);
        ReflectionTestUtils.setField(service,"zone","Asia/Ho_Chi_Minh");
        row.put("charged_monthly",0);row.put("charged_extra",0);
    }
    @Test void sameRequestKeyReplaysJobWithoutReservingAgain() throws Exception {
        enableForUnitTest();
        var request=service.payload(row);
        String hash=HexFormat.of().formatHex(java.security.MessageDigest.getInstance("SHA-256")
            .digest(new ObjectMapper().writeValueAsBytes(request)));
        when(jdbc.queryForList(contains("idempotency_key"),any(Object[].class)))
            .thenReturn(List.of(Map.of("id",7L,"payload_sha256",hash)));
        assertEquals(7L,service.create(1,UUID.randomUUID(),request).get("id"));
        verify(jdbc,never()).update(startsWith("UPDATE public.ai_credit_accounts"),any(Object[].class));
        verify(jdbc,never()).update(contains("INSERT INTO public.ai_credit_transactions"),any(Object[].class));
    }
    @Test void reusedRequestKeyWithDifferentPayloadIsRejectedAndRolledBack() throws Exception {
        enableForUnitTest();
        when(jdbc.queryForList(contains("idempotency_key"),any(Object[].class)))
            .thenReturn(List.of(Map.of("id",7L,"payload_sha256","different")));
        var error=assertThrows(org.springframework.web.server.ResponseStatusException.class,
            ()->service.create(1,UUID.randomUUID(),service.payload(row)));
        assertEquals(409,error.getStatusCode().value());verify(connection).rollback();
    }
    @Test void adminGrantRetryDoesNotIncreaseBalanceAgain() {
        enableForUnitTest();UUID key=UUID.randomUUID();
        when(jdbc.queryForObject(anyString(),eq(Long.class),any(Object[].class))).thenReturn(1L);
        when(jdbc.queryForList(contains("operation_key"),any(Object[].class)))
            .thenReturn(List.of(Map.of("event_type","admin_grant","user_id",1L,"actor_id",2L,
                "extra_balance_delta",10L,"reason","support")));
        assertEquals(true,service.grant(2,1,key,10,"support").get("replayed"));
        verify(jdbc,never()).update(startsWith("UPDATE public.ai_credit_accounts"),any(Object[].class));
    }
    @Test void jobOwnershipIsChecked() {
        enableForUnitTest();
        var error=assertThrows(org.springframework.web.server.ResponseStatusException.class,()->service.job(99,7));
        assertEquals(403,error.getStatusCode().value());
    }
    @Test void onlyReservedJobCanBeClaimed() {
        row.put("credit_state","reserved");
        when(jdbc.update(startsWith("UPDATE public.ai_generation_requests SET credit_state='running'"),any(Object[].class)))
            .thenAnswer(invocation->{row.put("credit_state","running");return 1;});
        assertTrue(service.claim(7));assertFalse(service.claim(7));
        verify(jdbc,times(1)).update(startsWith("UPDATE public.ai_generation_requests SET credit_state='running'"),any(Object[].class));
    }
}
