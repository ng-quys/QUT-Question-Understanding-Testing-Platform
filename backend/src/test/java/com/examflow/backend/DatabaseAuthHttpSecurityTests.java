package com.examflow.backend;
import com.examflow.backend.auth.DatabaseAuthService;
import com.examflow.backend.config.SecurityConfig;
import com.examflow.backend.controller.AuthController;
import com.examflow.backend.entity.UserEntity;
import com.examflow.backend.service.CurrentUserService;
import com.examflow.backend.exception.ApiException;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.http.HttpStatus;
import java.util.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest(AuthController.class) @Import(SecurityConfig.class)
class DatabaseAuthHttpSecurityTests {
 @Autowired MockMvc mvc;
 @MockitoBean DatabaseAuthService auth;
 @MockitoBean CurrentUserService users;
 @Test void loginAndRefreshDoNotRequireExistingLogin() throws Exception {
  when(auth.login("2001230001","synthetic-password")).thenReturn(new DatabaseAuthService.Tokens("synthetic-access-token-more-than-20","synthetic-refresh-token-more-than-20","Bearer",900,86400));
  mvc.perform(post("/api/auth/login").contentType("application/json").content("{\"username\":\"2001230001\",\"password\":\"synthetic-password\"}")).andExpect(status().isOk()).andExpect(jsonPath("$.access_token").exists());
  mvc.perform(post("/api/auth/refresh").contentType("application/json").content("{\"refreshToken\":\"synthetic-refresh-token-more-than-20\"}")).andExpect(status().isOk());
 }
 @Test void anonymousRequestsCannotReadProfilesOrSelfRegister() throws Exception {
  mvc.perform(get("/api/auth/me")).andExpect(status().isUnauthorized());
  mvc.perform(post("/api/auth/register").contentType("application/json").content("{}")).andExpect(status().isUnauthorized());
 }
 @Test void externalJwtIsRejectedAndCannotSupplyItsOwnRoles() throws Exception {
  when(auth.authenticate(anyString())).thenThrow(new ApiException(HttpStatus.UNAUTHORIZED,"invalid"));
  mvc.perform(get("/api/admin/me").header("Authorization","Bearer external.jwt.token")).andExpect(status().isUnauthorized());
 }
 @Test void databasePrincipalIsAvailableToExistingControllers() throws Exception {
  var principal=Jwt.withTokenValue("synthetic-access-token-more-than-20").header("alg","database-session").subject("local:7").claim("local_user_id",7L).claim("preferred_username","2001230001").claim("realm_access",Map.of("roles",List.of("STUDENT"))).build();
  when(auth.authenticate(principal.getTokenValue())).thenReturn(principal);
  var u=new UserEntity();u.setId(7L);u.setUsername("2001230001");u.setEmail("student@example.invalid");u.setFullName("Synthetic");u.setRole("student");when(users.getCurrentUser(any())).thenReturn(u);
  mvc.perform(get("/api/auth/me").header("Authorization","Bearer "+principal.getTokenValue())).andExpect(status().isOk()).andExpect(jsonPath("$.id").value(7));
  mvc.perform(get("/api/admin/me").header("Authorization","Bearer "+principal.getTokenValue())).andExpect(status().isForbidden());
 }
}
