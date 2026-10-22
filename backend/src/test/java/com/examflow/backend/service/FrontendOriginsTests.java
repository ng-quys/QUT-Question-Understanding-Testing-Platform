package com.examflow.backend.service;

import com.examflow.backend.config.SecurityConfig;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.test.util.ReflectionTestUtils;
import static org.junit.jupiter.api.Assertions.*;

class FrontendOriginsTests {
    @Test void bothLocalFrontendsAreAllowedWithoutAllowingUnknownOrigins() {
        var source=new SecurityConfig().corsConfigurationSource();
        var config=source.getCorsConfiguration(new MockHttpServletRequest("OPTIONS","/api/admin/me"));
        assertNotNull(config);
        for(String origin:new String[]{"http://localhost:5173","http://127.0.0.1:5173","http://localhost:5174","http://127.0.0.1:5174"}) assertEquals(origin,config.checkOrigin(origin));
        assertNull(config.checkOrigin("https://unrelated.example"));
        assertTrue(config.getAllowedHeaders().contains("Authorization"));
        assertTrue(config.getAllowedHeaders().contains("X-Account-Code-Reservation"));
    }
    @Test void deploymentCanUseTwoExplicitHttpsOrigins() {
        var security=new SecurityConfig();
        ReflectionTestUtils.setField(security,"frontendOrigins","https://app.example.com, https://admin.example.com");
        var config=security.corsConfigurationSource().getCorsConfiguration(new MockHttpServletRequest("OPTIONS","/api/student/profile"));
        assertEquals("https://admin.example.com",config.checkOrigin("https://admin.example.com"));
        assertEquals("https://app.example.com",config.checkOrigin("https://app.example.com"));
        assertNull(config.checkOrigin("http://localhost:5174"));
    }
}
