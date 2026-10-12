package com.examflow.backend.auth;

import java.io.IOException;
import java.util.List;

import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

@Component
public class TokenAuthenticationFilter extends OncePerRequestFilter {

    private final TokenService tokenService;

    public TokenAuthenticationFilter(TokenService tokenService) {
        this.tokenService = tokenService;
    }

    @Override
    protected void doFilterInternal(
            HttpServletRequest request,
            HttpServletResponse response,
            FilterChain filterChain
    ) throws ServletException, IOException {

        /*
         * IMPORTANT:
         *
         * If Spring Security / Keycloak Resource Server has already
         * authenticated the request, DO NOT overwrite that authentication.
         *
         * Social login uses JwtAuthenticationToken and AuthController
         * needs that JWT for /api/auth/sync-user.
         */
        if (SecurityContextHolder.getContext().getAuthentication() != null) {
            filterChain.doFilter(request, response);
            return;
        }

        String auth = request.getHeader("Authorization");

        if (auth != null && auth.startsWith("Bearer ")) {
            try {
                AuthenticatedUser user =
                        tokenService.parse(auth.substring(7));

                var authentication =
                        new UsernamePasswordAuthenticationToken(
                                user,
                                null,
                                List.of(
                                        new SimpleGrantedAuthority(
                                                "ROLE_" +
                                                user.role().toUpperCase()
                                        )
                                )
                        );

                SecurityContextHolder
                        .getContext()
                        .setAuthentication(authentication);

            } catch (Exception ignored) {
                /*
                 * DO NOT clear SecurityContext here.
                 *
                 * Another authentication mechanism, such as Keycloak
                 * OAuth2 Resource Server, may be responsible for the token.
                 */
            }
        }

        filterChain.doFilter(request, response);
    }
}