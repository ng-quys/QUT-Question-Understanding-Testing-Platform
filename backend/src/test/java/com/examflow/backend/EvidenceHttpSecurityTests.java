package com.examflow.backend;

import com.examflow.backend.config.DatabasePrincipalConverter;
import com.examflow.backend.config.SecurityConfig;
import com.examflow.backend.controller.EvidenceController;
import com.examflow.backend.exception.ApiException;
import com.examflow.backend.service.EvidenceReadService;
import com.examflow.backend.service.SupabaseEvidenceStorage;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import java.time.Instant;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest(EvidenceController.class)
@Import({SecurityConfig.class,DatabasePrincipalConverter.class})
class EvidenceHttpSecurityTests {
    @Autowired MockMvc mvc;
    @MockitoBean EvidenceReadService evidence;
    @MockitoBean JwtDecoder decoder;
    @MockitoBean com.examflow.backend.auth.DatabaseAuthService databaseAuth;
    private String path(String role) { return "/api/"+role+"/evidence/attempts/125/events/456/link"; }
    @Test void adminAndTeacherReachAuthorizedApiWithNoStore() throws Exception {
        when(evidence.link(any(),eq(125L),eq(456L))).thenReturn(new SupabaseEvidenceStorage.SignedLink("https://example.invalid/synthetic",Instant.now().plusSeconds(180),"supabase"));
        for(String role:new String[]{"admin","teacher"}) mvc.perform(get(path(role)).with(jwt().authorities(new SimpleGrantedAuthority("ROLE_"+role.toUpperCase())))).andExpect(status().isOk()).andExpect(header().string("Cache-Control","no-store")).andExpect(jsonPath("$.expiresAt").exists());
    }
    @Test void studentCannotReadEitherApi() throws Exception {
        for(String role:new String[]{"admin","teacher"}) mvc.perform(get(path(role)).with(jwt().authorities(new SimpleGrantedAuthority("ROLE_STUDENT")))).andExpect(status().isForbidden());
        verifyNoInteractions(evidence);
    }
    @Test void teacherCannotUseAdminRoute() throws Exception {
        mvc.perform(get(path("admin")).with(jwt().authorities(new SimpleGrantedAuthority("ROLE_TEACHER")))).andExpect(status().isForbidden()); verifyNoInteractions(evidence);
    }
    @Test void unsignedRequestIsRejected() throws Exception {
        mvc.perform(get(path("teacher"))).andExpect(status().isUnauthorized()); verifyNoInteractions(evidence);
    }
    @Test void teacherOutsideCourseGetsClearForbidden() throws Exception {
        when(evidence.link(any(),eq(125L),eq(456L))).thenThrow(new ApiException(HttpStatus.FORBIDDEN,"Bạn không phụ trách học phần của lượt thi này"));
        mvc.perform(get(path("teacher")).with(jwt().authorities(new SimpleGrantedAuthority("ROLE_TEACHER")))).andExpect(status().isForbidden()).andExpect(jsonPath("$.message").value("Bạn không phụ trách học phần của lượt thi này"));
    }
    @Test void groupedPhotosKeepTheSameRoleAndAssignmentChecks() throws Exception {
        for(String role:new String[]{"admin","teacher"}){
            String grouped="/api/"+role+"/evidence/attempts/125/event-groups";
            mvc.perform(get(grouped)).andExpect(status().isUnauthorized());
            mvc.perform(get(grouped).with(jwt().authorities(new SimpleGrantedAuthority("ROLE_STUDENT")))).andExpect(status().isForbidden());
        }
        when(evidence.groupedEvents(any(),eq(125L),eq(0),eq(20))).thenReturn(new EvidenceReadService.EventPage(java.util.List.of(),0,0,20,"in_progress",0L));
        mvc.perform(get("/api/teacher/evidence/attempts/125/event-groups").with(jwt().authorities(new SimpleGrantedAuthority("ROLE_TEACHER")))).andExpect(status().isOk()).andExpect(header().string("Cache-Control","no-store")).andExpect(jsonPath("$.groupTotal").value(0));
    }
}
