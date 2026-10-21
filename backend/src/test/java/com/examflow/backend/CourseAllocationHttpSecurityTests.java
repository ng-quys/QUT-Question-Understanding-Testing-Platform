package com.examflow.backend;

import com.examflow.backend.config.*;
import com.examflow.backend.controller.CourseAllocationController;
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

@WebMvcTest(CourseAllocationController.class)
@Import({SecurityConfig.class,DatabasePrincipalConverter.class})
class CourseAllocationHttpSecurityTests {
    @Autowired MockMvc mvc;
    @MockitoBean CourseAllocationService allocation;
    @MockitoBean CurrentUserService users;
    @MockitoBean JwtDecoder decoder;
    @MockitoBean com.examflow.backend.auth.DatabaseAuthService databaseAuth;
    @Test void studentAndTeacherCannotReadOrChangeCourseAssignments() throws Exception {
        mvc.perform(get("/api/admin/organization/allocation/options")).andExpect(status().isUnauthorized());
        for(String role:new String[]{"STUDENT","TEACHER"}){
            var auth=jwt().authorities(new SimpleGrantedAuthority("ROLE_"+role));
            mvc.perform(get("/api/admin/organization/allocation/options").with(auth)).andExpect(status().isForbidden());
            mvc.perform(post("/api/admin/organization/allocation/batches").with(auth).contentType("application/json").content("{}")).andExpect(status().isForbidden());
            mvc.perform(post("/api/admin/organization/allocation/courses/1/students").with(auth).contentType("application/json").content("{\"studentIds\":[1]}")).andExpect(status().isForbidden());
        }verifyNoInteractions(allocation);
    }
    @Test void retiredEnrollmentAndSequentialBatchApisReturnGoneWithoutDatabaseWork() throws Exception {
        var auth=jwt().authorities(new SimpleGrantedAuthority("ROLE_ADMIN"));
        mvc.perform(get("/api/admin/organization/allocation/options").with(auth)).andExpect(status().isGone());
        mvc.perform(post("/api/admin/organization/allocation/batches").with(auth).contentType("application/json").content("{}")).andExpect(status().isGone());
        mvc.perform(post("/api/admin/organization/allocation/courses/1/students").with(auth).contentType("application/json").content("{\"studentIds\":[1]}")).andExpect(status().isGone());
        verifyNoInteractions(allocation);
    }
    @Test void periodNameIsSufficientAndResponseContainsAllocatedCode() throws Exception {
        UserEntity admin=new UserEntity();admin.setId(1L);admin.setRole("admin");when(users.getCurrentUser(any())).thenReturn(admin);
        when(allocation.period(eq(admin),any())).thenReturn(Map.of("id",12,"code","DT01","name","Cuối kỳ"));
        mvc.perform(post("/api/admin/organization/allocation/periods").with(jwt().authorities(new SimpleGrantedAuthority("ROLE_ADMIN")))
                .contentType("application/json").content("{\"name\":\"Cuối kỳ\",\"code\":\"MANUAL\"}")).andExpect(status().isOk()).andExpect(jsonPath("$.code").value("DT01"));
        verify(allocation).period(eq(admin),argThat(r->r.code()==null));
    }
}
