package com.examflow.backend;

import com.examflow.backend.dto.*;
import com.examflow.backend.service.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;
import javax.sql.DataSource;
import java.time.*;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

/** Unit tests only: no Spring context, datasource connection or live model. */
class AiCreditRulesTest {
    private AiGenerateRequest automatic(int count,List<Long> ids) {
        return new AiGenerateRequest(1L,"qwen","","x".repeat(100),null,"proof",0.5,ids,count,null);
    }
    @Test void automaticRequestsRequireSelectedClosAndHardLimit45() {
        for(int count:List.of(1,10,45)) assertEquals(count,AiCreditRules.count(automatic(count,List.of(3L,4L)),100));
        for(int count:List.of(0,46)) assertThrows(IllegalArgumentException.class,()->AiCreditRules.count(automatic(count,List.of(3L)),100));
        assertThrows(IllegalArgumentException.class,()->AiCreditRules.count(automatic(10,List.of()),45));
        assertThrows(IllegalArgumentException.class,()->AiCreditRules.count(automatic(10,List.of(3L,3L)),45));
    }
    @Test void oldPayloadSerializationDoesNotGainNewNullFields() throws Exception {
        String json=new ObjectMapper().writeValueAsString(request(1));
        assertFalse(json.contains("cloIds"));assertFalse(json.contains("questionCount"));assertFalse(json.contains("selectedClos"));
        assertEquals(1,AiCreditRules.count(new ObjectMapper().readValue(json,AiGenerateRequest.class),45));
        String auto=new ObjectMapper().writeValueAsString(automatic(10,List.of(3L)));
        assertThrows(com.fasterxml.jackson.core.JsonProcessingException.class,()->new ObjectMapper().readValue(auto.replace("\"questionCount\":10","\"questionCount\":10.9"),AiGenerateRequest.class));
    }
    private AiGenerateRequest request(int count) {
        return new AiGenerateRequest(1L,"qwen","","x".repeat(100),
            List.of(new AiGenerateRequest.AiUnitDto("Unit",2L,3L,count,0,0)),"proof",0.5);
    }
    @Test void acceptsConfiguredRequestSizesAndRejects46() {
        for(int count:List.of(1,10,30,45))assertEquals(count,AiCreditRules.count(request(count),45));
        assertThrows(IllegalArgumentException.class,()->AiCreditRules.count(request(46),45));
        assertThrows(IllegalArgumentException.class,()->AiCreditRules.count(request(0),45));
        assertThrows(IllegalArgumentException.class,()->AiCreditRules.count(request(-1),45));
        assertThrows(IllegalArgumentException.class,()->AiCreditRules.count(request(Integer.MAX_VALUE),45));
    }
    @Test void monthlyCreditsAreReservedAndConsumedFirst() {
        assertEquals(new AiCreditRules.Split(8,12),AiCreditRules.reserve(20,8,100));
        assertEquals(new AiCreditRules.Split(8,12),AiCreditRules.reserve(20,8,Long.MAX_VALUE));
        assertEquals(new AiCreditRules.Split(8,7),AiCreditRules.settle(15,8,12));
        assertEquals(new AiCreditRules.Split(0,0),AiCreditRules.settle(0,8,12));
        assertEquals(new AiCreditRules.Split(5,0),AiCreditRules.settle(5,8,12));
        assertThrows(IllegalArgumentException.class,()->AiCreditRules.reserve(20,8,11));
        assertThrows(IllegalArgumentException.class,()->AiCreditRules.settle(21,8,12));
    }
    @Test void resetUsesVietnamMidnightIncludingDecember() {
        ZoneId zone=ZoneId.of("Asia/Ho_Chi_Minh");
        Clock before=Clock.fixed(Instant.parse("2026-10-31T16:59:59Z"),ZoneOffset.UTC);
        Clock after=Clock.fixed(Instant.parse("2026-10-31T17:00:00Z"),ZoneOffset.UTC);
        LocalDate oldPeriod=AiCreditRules.month(before,zone);
        assertEquals(LocalDate.of(2026,10,1),oldPeriod);
        assertEquals(LocalDate.of(2026,11,1),AiCreditRules.month(after,zone));
        assertEquals(Instant.parse("2026-10-31T17:00:00Z"),AiCreditRules.nextReset(oldPeriod,zone));
        assertEquals(Instant.parse("2026-12-31T17:00:00Z"),AiCreditRules.nextReset(LocalDate.of(2026,12,1),zone));
        // A job retains its oldPeriod even when the current period changes.
        assertEquals(LocalDate.of(2026,10,1),oldPeriod);
    }
    @Test void disabledFeatureNeverOpensDatabase() {
        DataSource datasource=mock(DataSource.class);
        var service=new AiCreditsService(datasource,new ObjectMapper(),mock(com.examflow.backend.service.AiWorkerCoordinator.class));
        assertThrows(org.springframework.web.server.ResponseStatusException.class,()->service.quota(1));
        assertThrows(org.springframework.web.server.ResponseStatusException.class,()->service.create(1,UUID.randomUUID(),request(1)));
        verifyNoInteractions(datasource);
    }
    @Test void acceptsOnlyValidQuestionsWithinCloBloomBudget() throws Exception {
        var mapper=new ObjectMapper();
        var service=new AiCreditsService(mock(DataSource.class),mapper,mock(com.examflow.backend.service.AiWorkerCoordinator.class));
        Map<String,Object> row=Map.of("credit_payload",mapper.writeValueAsString(request(1)));
        var valid=new AiQuestionDto("Question",List.of("a","b","c","d"),0,"","remember",2L,3L);
        var wrongClo=new AiQuestionDto("Other",List.of("a","b","c","d"),0,"","remember",2L,99L);
        var blank=new AiQuestionDto("",List.of("a","b","c","d"),0,"","remember",2L,3L);
        assertEquals(List.of(valid),service.validate(row,List.of(valid,valid,wrongClo,blank)));
    }
    @Test void documentProofIsBoundToUserAndContent() {
        var service=new AiCreditsService(mock(DataSource.class),new ObjectMapper(),mock(com.examflow.backend.service.AiWorkerCoordinator.class));
        ReflectionTestUtils.setField(service,"secret","test-only-key-with-at-least-32-characters");
        var body=request(1);
        String proof=service.documentProof(1,body.sourceText());
        var signed=new AiGenerateRequest(body.courseId(),body.provider(),body.instruction(),body.sourceText(),body.units(),proof,0.5);
        assertDoesNotThrow(()->{ReflectionTestUtils.invokeMethod(service,"verifyProof",1L,signed);});
        assertThrows(org.springframework.web.server.ResponseStatusException.class,()->
            ReflectionTestUtils.invokeMethod(service,"verifyProof",2L,signed));
        var tampered=new AiGenerateRequest(body.courseId(),body.provider(),body.instruction(),"Changed",body.units(),proof,0.5);
        assertThrows(org.springframework.web.server.ResponseStatusException.class,()->
            ReflectionTestUtils.invokeMethod(service,"verifyProof",1L,tampered));
    }
    @Test void teacherCannotUseAdminGrantEndpoint() {
        var credits=mock(AiCreditsService.class);
        var users=mock(CurrentUserService.class);
        var admins=mock(AdminIdentityService.class);
        var jwt=mock(org.springframework.security.oauth2.jwt.Jwt.class);
        when(admins.requireAdmin(jwt)).thenThrow(new org.springframework.web.server.ResponseStatusException(
            org.springframework.http.HttpStatus.FORBIDDEN,"Admin only"));
        var controller=new com.examflow.backend.controller.AiCreditsController(
            credits,mock(AiCreditsProvider.class),mock(AiCreditsWorker.class),users,admins,mock(com.examflow.backend.service.AiWorkerCoordinator.class));
        assertThrows(org.springframework.web.server.ResponseStatusException.class,()->
            controller.grant(jwt,1,new com.examflow.backend.controller.AiCreditsController.Grant(UUID.randomUUID(),10,"test")));
        verifyNoInteractions(credits);
    }
    @Test void studentCannotReadTeacherQuota() {
        var credits=mock(AiCreditsService.class);
        var users=mock(CurrentUserService.class);
        var jwt=mock(org.springframework.security.oauth2.jwt.Jwt.class);
        var student=new com.examflow.backend.entity.UserEntity();
        student.setId(1L);student.setRole("student");
        when(users.getCurrentUser(jwt)).thenReturn(student);
        var controller=new com.examflow.backend.controller.AiCreditsController(
            credits,mock(AiCreditsProvider.class),mock(AiCreditsWorker.class),users,mock(AdminIdentityService.class),mock(com.examflow.backend.service.AiWorkerCoordinator.class));
        assertThrows(org.springframework.web.server.ResponseStatusException.class,()->controller.quota(jwt));
        verifyNoInteractions(credits);
    }
    @Test void legacyGenerationRouteCannotBypassLocalRoleCheck() {
        var credits=mock(AiCreditsService.class);
        var users=mock(CurrentUserService.class);
        var jwt=mock(org.springframework.security.oauth2.jwt.Jwt.class);
        var student=new com.examflow.backend.entity.UserEntity();
        student.setId(1L);student.setRole("student");
        when(users.getCurrentUser(jwt)).thenReturn(student);
        var controller=new com.examflow.backend.controller.TeacherQuestionBankController(
            mock(TeacherQuestionBankService.class),credits,users);
        assertThrows(org.springframework.web.server.ResponseStatusException.class,()->
            controller.generateQuestions(jwt,UUID.randomUUID(),request(1)));
        verifyNoInteractions(credits);
    }
}
