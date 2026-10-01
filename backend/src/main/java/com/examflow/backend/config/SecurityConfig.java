package com.examflow.backend.config;


import java.util.List;

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
    public SecurityFilterChain securityFilterChain(
            HttpSecurity http,
            KeycloakJwtAuthenticationConverter converter
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

                        // PUBLIC APIs
                        .requestMatchers(
                                "/api/health",
                                "/api/auth/login",
                                "/api/auth/register",
                                "/api/test/public",
                                "/error"
                        )
                        .permitAll()

                        // ADMIN APIs
                        .requestMatchers("/api/admin/**")
                        .hasRole("ADMIN")

                        // TEACHER APIs
                        .requestMatchers("/api/teacher/**")
                        .hasAnyRole("TEACHER", "ADMIN")

                        // STUDENT APIs
                        .requestMatchers("/api/student/**")
                        .hasAnyRole("STUDENT", "ADMIN")

                        // Everything else requires authentication
                        .anyRequest()
                        .authenticated()
                )

                // Keycloak JWT authentication
                .oauth2ResourceServer(oauth2 ->
                        oauth2.jwt(jwt ->
                                jwt.jwtAuthenticationConverter(converter)
                        )
                );

        return http.build();
    }

    /**
     * Password encoder.
     *
     * Keep this if the application still needs BCrypt
     * for locally stored passwords.
     */
    @Bean
    public BCryptPasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();
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
                        "Content-Type"
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