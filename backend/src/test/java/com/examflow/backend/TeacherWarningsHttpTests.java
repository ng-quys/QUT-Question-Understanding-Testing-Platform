package com.examflow.backend;

import com.examflow.backend.config.*;
import com.examflow.backend.controller.TeacherMonitoringController;
import com.examflow.backend.entity.UserEntity;
import com.examflow.backend.exception.ApiException;
import com.examflow.backend.service.*;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import java.time.LocalDateTime;
import java.util.*;
import static org.mockito.Mockito.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest(TeacherMonitoringController.class)
@Import({SecurityConfig.class,DatabasePrincipalConverter.class})
class TeacherWarningsHttpTests {
    @Autowired MockMvc mvc;
    @MockitoBean ExamOrganizationService organization;
    @MockitoBean CurrentUserService users;
    @MockitoBean JwtDecoder decoder;
    @MockitoBean com.examflow.backend.auth.DatabaseAuthService databaseAuth;
    static final String ROOT="/api/teacher/monitoring/warning-sessions";
    UserEntity teacher(String status) { var user=new UserEntity();user.setId(42L);user.setRole("faculty");user.setStatus(status);when(users.getCurrentUser(any())).thenReturn(user);return user; }
    @Test void anonymousAndStudentCannotReadWarningListsOrDetails() throws Exception {
        for(String path:new String[]{ROOT,ROOT+"/9"}) {
            mvc.perform(get(path)).andExpect(status().isUnauthorized());
            mvc.perform(get(path).with(jwt().authorities(new SimpleGrantedAuthority("ROLE_STUDENT")))).andExpect(status().isForbidden());
        }
        verifyNoInteractions(organization);
    }
    @Test void passesAuthenticatedTeacherToScopedList() throws Exception {
        var user=teacher("active");
        when(organization.warningSessions(user,false,"PHP",0,20)).thenReturn(new ExamOrganizationService.Page(List.of(Map.of("id",9L,"name","Ca được phân công")),1,0,20,LocalDateTime.now()));
        mvc.perform(get(ROOT).param("q","PHP").with(jwt().authorities(new SimpleGrantedAuthority("ROLE_TEACHER"))))
            .andExpect(status().isOk()).andExpect(jsonPath("$.items[0].id").value(9)).andExpect(jsonPath("$.total").value(1));
        verify(organization).warningSessions(user,false,"PHP",0,20);
    }
    @Test void knowingAnotherSessionIdDoesNotBypassAssignment() throws Exception {
        var user=teacher("active");
        when(organization.monitoringDetail(user,99L)).thenThrow(new ApiException(HttpStatus.FORBIDDEN,"Bạn không được phân công phụ trách dữ liệu này"));
        mvc.perform(get(ROOT+"/99").with(jwt().authorities(new SimpleGrantedAuthority("ROLE_TEACHER"))))
            .andExpect(status().isForbidden());
    }
    @Test void inactiveTeacherCannotReachOrganizationService() throws Exception {
        teacher("inactive");
        mvc.perform(get(ROOT).with(jwt().authorities(new SimpleGrantedAuthority("ROLE_TEACHER")))).andExpect(status().isForbidden());
        verifyNoInteractions(organization);
    }
}
