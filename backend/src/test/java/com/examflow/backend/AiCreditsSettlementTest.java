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
        service=new AiCreditsService(source,mapper);
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
    @Test void checkpointCannotDecreaseAcceptedResults() {
        row.put("accepted_count",7);
        service.checkpoint(7,token,questions(5));
        verify(jdbc,never()).update(startsWith("UPDATE public.ai_generation_requests SET credit_result"),any(Object[].class));
    }
    void enableForUnitTest() {
        ReflectionTestUtils.setField(service,"enabled",true);
        ReflectionTestUtils.setField(service,"monthlyLimit",200);
        ReflectionTestUtils.setField(service,"maximum",45);
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
