package com.examflow.backend;

import com.examflow.backend.config.*;
import com.examflow.backend.controller.AiInternalKeyController;
import org.junit.jupiter.api.*;
import org.springframework.context.annotation.*;
import org.springframework.core.env.MapPropertySource;
import org.springframework.mock.web.MockServletContext;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.test.web.servlet.*;
import org.springframework.web.context.support.AnnotationConfigWebApplicationContext;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.servlet.config.annotation.EnableWebMvc;
import java.util.Map;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
import static org.springframework.security.test.web.servlet.setup.SecurityMockMvcConfigurers.springSecurity;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;

/** Real security chains, MVC and property binding; no Boot, DB, Keycloak or AI. */
class AiInternalKeySecurityTest {
    private static final String KEY="fixture-only-internal-key-over-32-characters";
    private static final String PATH="/api/internal/ai-credits/verify-key";
    AnnotationConfigWebApplicationContext context;
    MockMvc mvc;
    @Configuration @EnableWebSecurity @EnableWebMvc
    static class TestConfig {
        @Bean com.examflow.backend.auth.DatabaseAuthService databaseAuth(){return mock(com.examflow.backend.auth.DatabaseAuthService.class);}
        @Bean JwtDecoder decoder(){return mock(JwtDecoder.class);}
        @Bean DatabasePrincipalConverter converter(){return new DatabasePrincipalConverter();}
        @Bean ProtectedController protectedController(){return new ProtectedController();}
    }
    @RestController static class ProtectedController {
        @GetMapping("/api/admin/key-test") String admin(){return "admin";}
        @GetMapping("/api/teacher/key-test") String teacher(){return "teacher";}
        @GetMapping("/api/student/key-test") String student(){return "student";}
        @GetMapping("/api/internal/ai-credits/other") String other(){return "other";}
    }
    void start(String key){
        context=new AnnotationConfigWebApplicationContext();context.setServletContext(new MockServletContext());
        context.getEnvironment().getPropertySources().addFirst(new MapPropertySource("fixture",Map.of("ai.internal.key",key)));
        context.register(TestConfig.class,SecurityConfig.class,AiInternalKeyController.class);context.refresh();
        mvc=org.springframework.test.web.servlet.setup.MockMvcBuilders.webAppContextSetup(context).apply(springSecurity()).build();
    }
    @AfterEach void close(){if(context!=null)context.close();}
    @Test void validKeyWithoutJwtReturnsEmpty204EvenWithInvalidBearer() throws Exception {
        start(KEY);
        mvc.perform(get(PATH).header("X-AI-Internal-Key",KEY)).andExpect(status().isNoContent()).andExpect(content().string(""));
        mvc.perform(get(PATH).header("X-AI-Internal-Key",KEY).header("Authorization","Bearer invalid"))
            .andExpect(status().isNoContent()).andExpect(content().string(""));
        verifyNoInteractions(context.getBean(JwtDecoder.class));
    }
    @Test void missingWrongAndShortKeysAreEmpty401() throws Exception {
        start(KEY);
        mvc.perform(get(PATH)).andExpect(status().isUnauthorized()).andExpect(content().string(""));
        mvc.perform(get(PATH).header("X-AI-Internal-Key","wrong")).andExpect(status().isUnauthorized()).andExpect(content().string(""));
        mvc.perform(get(PATH).header("X-AI-Internal-Key","x".repeat(31))).andExpect(status().isUnauthorized());
    }
    @Test void unconfiguredBackendReturnsEmpty503() throws Exception {
        start("");mvc.perform(get(PATH).header("X-AI-Internal-Key",KEY)).andExpect(status().isServiceUnavailable()).andExpect(content().string(""));
    }
    @Test void shortBackendKeyReturnsEmpty503() throws Exception {
        start("short");mvc.perform(get(PATH)).andExpect(status().isServiceUnavailable()).andExpect(content().string(""));
    }
    @Test void remoteAndForwardedRequestsAreDeniedRegardlessOfValidKey() throws Exception {
        start(KEY);
        mvc.perform(get(PATH).header("X-AI-Internal-Key",KEY).with(r->{r.setRemoteAddr("203.0.113.7");return r;})).andExpect(status().isForbidden());
        for(String header:new String[]{"Forwarded","X-Forwarded-For","X-Forwarded-Host","X-Forwarded-Proto","X-Real-IP"})
            mvc.perform(get(PATH).header("X-AI-Internal-Key",KEY).header(header,"127.0.0.1")).andExpect(status().isForbidden());
        mvc.perform(get(PATH).header("X-AI-Internal-Key",KEY).with(r->{r.setRemoteAddr("::1");return r;})).andExpect(status().isNoContent());
        mvc.perform(post(PATH).header("X-AI-Internal-Key",KEY)).andExpect(status().isForbidden());
    }
    @Test void otherRoutesKeepAuthenticationAndRoleChecks() throws Exception {
        start(KEY);
        for(String path:new String[]{"/api/admin/key-test","/api/teacher/key-test","/api/student/key-test","/api/internal/ai-credits/other"})
            mvc.perform(get(path).header("X-AI-Internal-Key",KEY)).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/admin/key-test").with(user("teacher").roles("TEACHER"))).andExpect(status().isForbidden());
        mvc.perform(get("/api/admin/key-test").with(user("admin").roles("ADMIN"))).andExpect(status().isOk());
        mvc.perform(get("/api/teacher/key-test").with(user("teacher").roles("TEACHER"))).andExpect(status().isOk());
        mvc.perform(get("/api/student/key-test").with(user("student").roles("STUDENT"))).andExpect(status().isOk());
    }
}
