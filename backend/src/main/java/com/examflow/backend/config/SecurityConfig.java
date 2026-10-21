package com.examflow.backend.config;


import java.util.List;
import java.net.InetAddress;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.core.annotation.Order;
import org.springframework.security.authorization.AuthorizationDecision;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

@Configuration
public class SecurityConfig {

    @Bean
    @Order(1)
    public SecurityFilterChain aiInternalKeySecurity(HttpSecurity http) throws Exception {
        // Exact path only: every other API keeps the existing JWT chain.
        return http.securityMatcher("/api/internal/ai-credits/verify-key")
            .csrf(csrf->csrf.disable()).cors(cors->cors.disable())
            .requestCache(cache->cache.disable())
            .sessionManagement(session->session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
            .authorizeHttpRequests(auth->auth.anyRequest().access((authentication,context)->
                new AuthorizationDecision(isDirectLoopbackGet(context.getRequest()))))
            .exceptionHandling(errors->errors
                .authenticationEntryPoint((request,response,error)->response.setStatus(403))
                .accessDeniedHandler((request,response,error)->response.setStatus(403)))
            .build();
    }

    private static boolean isDirectLoopbackGet(HttpServletRequest request) {
        if(!"GET".equals(request.getMethod()))return false;
        for(String header:List.of("Forwarded","X-Forwarded-For","X-Forwarded-Host","X-Forwarded-Proto","X-Real-IP"))
            if(request.getHeader(header)!=null)return false;
        String address=request.getRemoteAddr();
        if(address==null||(!address.contains(":")&&!address.matches("[0-9.]+")))return false;
        try{return InetAddress.getByName(address).isLoopbackAddress();}
        catch(Exception ignored){return false;}
    }

    @Bean
    public SecurityFilterChain securityFilterChain(
            HttpSecurity http,
            com.examflow.backend.auth.DatabaseAuthService databaseAuth
    ) throws Exception {

        http
                // Disable CSRF because backend uses JWT
                .csrf(csrf -> csrf.disable())

                // Enable CORS
                .cors(cors ->
                        cors.configurationSource(corsConfigurationSource())
                )

                // Stateless authentication
                .sessionManagement(session ->
                        session.sessionCreationPolicy(SessionCreationPolicy.STATELESS)
                )

                // Authorization rules
                .authorizeHttpRequests(auth -> auth

                        // Allow CORS preflight requests
                        .requestMatchers(HttpMethod.OPTIONS, "/**")
                        .permitAll()

                        .requestMatchers("/api/auth/register").denyAll()

                        // PUBLIC APIs
                        .requestMatchers(
                                "/api/health",
                                "/api/auth/login", "/api/auth/refresh", "/api/auth/logout",
                                "/api/test/public",
                                "/error"
                        )
                        .permitAll()

                        // ADMIN APIs
                        .requestMatchers("/api/admin/**")
                        .hasRole("ADMIN")

                        // TEACHER APIs
                        .requestMatchers("/api/teacher/organization/**")
                        .denyAll()
                        .requestMatchers("/api/teacher/**")
                        .hasAnyRole("TEACHER", "ADMIN")

                        // STUDENT APIs
                        .requestMatchers("/api/student/**")
                        .hasAnyRole("STUDENT", "ADMIN")

                        .requestMatchers(HttpMethod.POST, "/api/internal/anticheating/events")
                        .permitAll()

                        // Everything else requires authentication
                        .anyRequest()
                        .authenticated()
                )

                .exceptionHandling(errors->errors.authenticationEntryPoint((request,response,error)->response.setStatus(401)))
                .addFilterBefore(new com.examflow.backend.auth.DatabaseAuthenticationFilter(databaseAuth),org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter.class);

        return http.build();
    }

    /**
     * Password encoder.
     *
     * Keep this if the application still needs BCrypt
     * for locally stored passwords.
     */
    @Bean
    public org.springframework.security.crypto.password.PasswordEncoder passwordEncoder() {
        return new com.examflow.backend.auth.DatabasePasswordEncoder();
    }

    /**
     * CORS configuration for React frontend.
     */
    @Bean
    public CorsConfigurationSource corsConfigurationSource() {

        CorsConfiguration configuration = new CorsConfiguration();

        // React development servers
        configuration.setAllowedOriginPatterns(
                List.of(
                        "http://localhost:5173",
                        "http://127.0.0.1:5173",
                        "http://localhost:5174"
                )
        );

        configuration.setAllowedMethods(
                List.of(
                        "GET",
                        "POST",
                        "PUT",
                        "PATCH",
                        "DELETE",
                        "OPTIONS"
                )
        );

        configuration.setAllowedHeaders(
                List.of(
                        "Authorization",
                        "Content-Type",
                        "X-Account-Code-Reservation"
                )
        );

        configuration.setExposedHeaders(
                List.of("Authorization")
        );

        configuration.setAllowCredentials(true);

        UrlBasedCorsConfigurationSource source =
                new UrlBasedCorsConfigurationSource();

        source.registerCorsConfiguration(
                "/**",
                configuration
        );

        return source;
    }
}
