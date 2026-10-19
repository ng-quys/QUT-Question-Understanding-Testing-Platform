package com.examflow.backend;

import com.examflow.backend.config.*;
import com.examflow.backend.controller.AdminCatalogController;
import com.examflow.backend.controller.AdminWorkspaceController;
import com.examflow.backend.entity.UserEntity;
import com.examflow.backend.service.*;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import java.util.Map;
import static org.mockito.Mockito.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest({AdminCatalogController.class,AdminWorkspaceController.class})
@Import({SecurityConfig.class,KeycloakJwtAuthenticationConverter.class})
class AdminCatalogHttpSecurityTests {
    @Autowired MockMvc mvc;
    @MockitoBean AdminCatalogService catalog;
    @MockitoBean AdminExamContentService content;
    @MockitoBean AdminIdentityService identity;
    @MockitoBean AdminWorkspaceService workspace;
    @MockitoBean AdminEvidenceService evidence;
    @MockitoBean JwtDecoder decoder;
    @MockitoBean com.examflow.backend.auth.TokenService tokens;
    final String body="{\"code\":\"WEB\",\"name\":\"Web\",\"credits\":3,\"teacherId\":6,\"status\":\"active\"}";
    @BeforeEach void setup(){UserEntity admin=new UserEntity();admin.setId(1L);when(identity.requireAdmin(any())).thenReturn(admin);when(catalog.course(any(),any(),any())).thenReturn(Map.of("id",10));}
    @Test void studentAndTeacherCannotReadCreateEditOrDelete() throws Exception {
        for(String role:new String[]{"STUDENT","TEACHER"}){
            var auth=jwt().authorities(new SimpleGrantedAuthority("ROLE_"+role));
            mvc.perform(get("/api/admin/catalog/options").with(auth)).andExpect(status().isForbidden());
            mvc.perform(get("/api/admin/catalog/exams/20/review").with(auth)).andExpect(status().isForbidden());
            mvc.perform(post("/api/admin/catalog/exams/20/close").with(auth)).andExpect(status().isForbidden());
            mvc.perform(put("/api/admin/catalog/exams/20/content").with(auth).contentType(MediaType.APPLICATION_JSON).content("{}")).andExpect(status().isForbidden());
            mvc.perform(post("/api/admin/catalog/exams/20/revision").with(auth).contentType(MediaType.APPLICATION_JSON).content("{}")).andExpect(status().isForbidden());
            mvc.perform(post("/api/admin/catalog/courses").with(auth).contentType(MediaType.APPLICATION_JSON).content(body)).andExpect(status().isForbidden());
            mvc.perform(put("/api/admin/catalog/courses/10").with(auth).contentType(MediaType.APPLICATION_JSON).content(body)).andExpect(status().isForbidden());
            mvc.perform(delete("/api/admin/catalog/courses/10").with(auth)).andExpect(status().isForbidden());
            mvc.perform(patch("/api/admin/workspace/sessions/30/status?status=cancelled").with(auth)).andExpect(status().isForbidden());
            mvc.perform(get("/api/admin/workspace/list/attempts?sessionCode=TEST-CODE").with(auth)).andExpect(status().isForbidden());
        } verifyNoInteractions(catalog,identity,workspace);
    }
    @Test void anonymousCannotAccessAdminCatalog() throws Exception {mvc.perform(get("/api/admin/catalog/options")).andExpect(status().isUnauthorized());verifyNoInteractions(catalog);}
    @Test void adminMutationUsesServerActorAndValidatedInput() throws Exception {
        var auth=jwt().authorities(new SimpleGrantedAuthority("ROLE_ADMIN"));
        mvc.perform(post("/api/admin/catalog/courses").with(auth).contentType(MediaType.APPLICATION_JSON).content(body)).andExpect(status().isOk());
        verify(catalog).course(eq(1L),isNull(),any());
        mvc.perform(delete("/api/admin/catalog/sessions/30").with(auth)).andExpect(status().isNoContent());verify(catalog).delete(1L,"sessions",30L);
    }
    @Test void invalidCourseIsRejectedBeforeMutation() throws Exception {
        mvc.perform(post("/api/admin/catalog/courses").with(jwt().authorities(new SimpleGrantedAuthority("ROLE_ADMIN")))
                .contentType(MediaType.APPLICATION_JSON).content("{\"code\":\"\",\"credits\":0}" )).andExpect(status().isBadRequest());verifyNoInteractions(catalog);
    }
    @Test void adminCodesAreOptionalAndClientCodesCannotOverrideAllocation() throws Exception {
        var auth=jwt().authorities(new SimpleGrantedAuthority("ROLE_ADMIN"));
        mvc.perform(post("/api/admin/catalog/courses").with(auth).contentType(MediaType.APPLICATION_JSON)
                .content(body.replace("\"code\":\"WEB\",",""))).andExpect(status().isOk());
        verify(catalog).course(eq(1L),isNull(),argThat(r->r.code()==null&&r.name().equals("Web")));
        mvc.perform(put("/api/admin/catalog/courses/10").with(auth).contentType(MediaType.APPLICATION_JSON).content(body)).andExpect(status().isOk());
        verify(catalog).course(eq(1L),eq(10L),argThat(r->r.code()==null));
        mvc.perform(post("/api/admin/catalog/exams").with(auth).contentType(MediaType.APPLICATION_JSON)
                .content("{\"courseId\":10,\"title\":\"Đề thi\",\"totalQuestions\":10,\"mediumPercent\":50,\"goodPercent\":30,\"excellentPercent\":20,\"maxOverlapPercent\":100,\"cloIds\":[],\"shuffleQuestions\":true,\"shuffleAnswers\":true,\"antiCheatMode\":true,\"code\":\"FORGED\"}")).andExpect(status().isOk());
        verify(catalog).createExam(eq(1L),argThat(r->r.code()==null&&r.courseId()==10));
    }
    @Test void adminPublicCodeFilterReachesListAndReport() throws Exception {
        var auth=jwt().authorities(new SimpleGrantedAuthority("ROLE_ADMIN"));
        when(workspace.list(anyString(),any(),anyInt(),anyInt())).thenReturn(new AdminWorkspaceService.Page(java.util.List.of(),0,0,20));
        when(workspace.report(any())).thenReturn(Map.of("completed",0));
        mvc.perform(get("/api/admin/workspace/list/attempts?sessionCode=TEST-CODE").with(auth)).andExpect(status().isOk());
        verify(workspace).list(eq("attempts"),argThat(f->f.sessionCode().equals("TEST-CODE")),eq(0),eq(20));
        mvc.perform(get("/api/admin/workspace/report?sessionCode=TEST-CODE").with(auth)).andExpect(status().isOk());
        verify(workspace).report(argThat(f->f.sessionCode().equals("TEST-CODE")));
    }
}

