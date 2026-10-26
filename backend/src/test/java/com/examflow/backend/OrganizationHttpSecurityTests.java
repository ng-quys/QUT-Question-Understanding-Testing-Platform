package com.examflow.backend;
import com.examflow.backend.config.*;
import com.examflow.backend.controller.*;
import com.examflow.backend.service.*;
import com.examflow.backend.entity.UserEntity;
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
@WebMvcTest({ExamOrganizationController.class,AuthController.class,StudentJoinController.class})
@Import({SecurityConfig.class,DatabasePrincipalConverter.class})
class OrganizationHttpSecurityTests {
 @Autowired MockMvc mvc;
 @MockitoBean ExamOrganizationService organization;
 @MockitoBean CurrentUserService users;
 @MockitoBean JwtDecoder decoder;
 @MockitoBean com.examflow.backend.auth.DatabaseAuthService databaseAuth;
 @Test void publicRegistrationIsDeniedEvenWithValidToken() throws Exception {
  mvc.perform(post("/api/auth/register").contentType("application/json").content("{}")).andExpect(status().isUnauthorized());
  mvc.perform(post("/api/auth/register").with(jwt().authorities(new SimpleGrantedAuthority("ROLE_STUDENT"))).contentType("application/json").content("{}")).andExpect(status().isForbidden());verifyNoInteractions(databaseAuth);
 }
 @Test void codeSearchAndJoinCannotCreateMembership() throws Exception {
  for(String action:new String[]{"join","search"})mvc.perform(post("/api/student/exams/"+action).with(jwt().authorities(new SimpleGrantedAuthority("ROLE_STUDENT"))).contentType("application/json").content("{\"code\":\"SECRET\"}")).andExpect(status().isGone());verifyNoInteractions(organization);
 }
 @Test void studentsAndAnonymousCannotOrganizeExams() throws Exception {
  mvc.perform(get("/api/admin/organization/bootstrap")).andExpect(status().isUnauthorized());
  mvc.perform(get("/api/admin/organization/bootstrap").with(jwt().authorities(new SimpleGrantedAuthority("ROLE_STUDENT")))).andExpect(status().isForbidden());
  mvc.perform(get("/api/teacher/organization/bootstrap").with(jwt().authorities(new SimpleGrantedAuthority("ROLE_STUDENT")))).andExpect(status().isForbidden());verifyNoInteractions(organization);
 }
 @Test void provisionedIdentityIsReadWithoutSelfProvisioning() throws Exception {
  UserEntity u=new UserEntity();u.setId(20L);u.setUsername("SV020");u.setFullName("Synthetic");u.setEmail("sv020@example.invalid");u.setRole("student");when(users.getCurrentUser(any())).thenReturn(u);
  mvc.perform(get("/api/auth/me").with(jwt())).andExpect(status().isOk()).andExpect(jsonPath("$.username").value("SV020"));verifyNoInteractions(databaseAuth);
 }
 @Test void teacherOrganizationRedesignIsNoLongerExposed() throws Exception {
  mvc.perform(get("/api/teacher/organization/bootstrap").with(jwt().authorities(new SimpleGrantedAuthority("ROLE_TEACHER")))).andExpect(status().isForbidden());verifyNoInteractions(organization);
 }
 @Test void adminCreatesRoomsAndClassesWithoutSupplyingCodes() throws Exception {
  UserEntity admin=new UserEntity();admin.setId(1L);admin.setRole("admin");when(users.getCurrentUser(any())).thenReturn(admin);
  var auth=jwt().authorities(new SimpleGrantedAuthority("ROLE_ADMIN"));
  mvc.perform(post("/api/admin/organization/classes").with(auth).contentType("application/json").content("{\"name\":\"Lớp mới\",\"department\":\"CNTT\",\"status\":\"active\"}")).andExpect(status().isOk());
  verify(organization).saveClass(eq(admin),isNull(),argThat(r->r.code()==null));
  mvc.perform(post("/api/admin/organization/rooms").with(auth).contentType("application/json").content("{\"name\":\"Phòng mới\",\"code\":\"MANUAL\",\"status\":\"active\",\"capacity\":40}")).andExpect(status().isOk());
  verify(organization).saveRoom(eq(admin),isNull(),argThat(r->r.code()==null&&r.capacity()==40));
 }
}
