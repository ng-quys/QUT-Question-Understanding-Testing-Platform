package com.examflow.backend;

import com.examflow.backend.config.*;
import com.examflow.backend.controller.DepartmentExamController;
import com.examflow.backend.entity.UserEntity;
import com.examflow.backend.service.*;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import java.util.Map;
import static org.mockito.Mockito.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest(DepartmentExamController.class)
@Import({SecurityConfig.class,KeycloakJwtAuthenticationConverter.class})
class DepartmentExamHttpSecurityTests {
    @Autowired MockMvc mvc;
    @MockitoBean DepartmentExamService allocation;
    @MockitoBean CurrentUserService users;
    @MockitoBean JwtDecoder decoder;
    @MockitoBean com.examflow.backend.auth.TokenService tokens;
    @Test void studentAndTeacherCannotReadOrChangeCourseAssignments() throws Exception {
        mvc.perform(get("/api/admin/organization/department-exams/options")).andExpect(status().isUnauthorized());
        for(String role:new String[]{"STUDENT","TEACHER"}){
            var auth=jwt().authorities(new SimpleGrantedAuthority("ROLE_"+role));
            mvc.perform(get("/api/admin/organization/department-exams/options").with(auth)).andExpect(status().isForbidden());
            mvc.perform(patch("/api/admin/organization/department-exams/groups/1/ai-policy?enabled=false").with(auth)).andExpect(status().isForbidden());
            mvc.perform(post("/api/admin/organization/department-exams/1/publish").with(auth)).andExpect(status().isForbidden());
            mvc.perform(put("/api/admin/organization/department-exams/1/schedule").with(auth).contentType("application/json").content("{}")).andExpect(status().isForbidden());
            mvc.perform(post("/api/admin/organization/department-exams").with(auth).contentType("application/json").content("{}")).andExpect(status().isForbidden());
            mvc.perform(post("/api/admin/organization/department-exams/groups/1/publish").with(auth).contentType("application/json").content("{\"studentIds\":[1]}")).andExpect(status().isForbidden());
        }verifyNoInteractions(allocation);
    }
    @Test void adminCanLoadOptionsAndInvalidBatchIsRejected() throws Exception {
        var user=new UserEntity();user.setId(1L);user.setRole("admin");when(users.getCurrentUser(any())).thenReturn(user);when(allocation.options(user)).thenReturn(Map.of("courses",java.util.List.of(),"periods",java.util.List.of()));
        var auth=jwt().authorities(new SimpleGrantedAuthority("ROLE_ADMIN"));
        mvc.perform(get("/api/admin/organization/department-exams/options").with(auth)).andExpect(status().isOk()).andExpect(jsonPath("$.courses").isArray());
        mvc.perform(post("/api/admin/organization/department-exams").with(auth).contentType("application/json").content("{}")).andExpect(status().isBadRequest());verify(allocation,never()).create(any(),any());
        mvc.perform(put("/api/admin/organization/department-exams/1/schedule").with(auth).contentType("application/json").content("{}")).andExpect(status().isBadRequest());verify(allocation,never()).schedule(any(),anyLong(),any());
    }
}
