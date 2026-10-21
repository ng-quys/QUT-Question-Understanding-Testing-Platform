package com.examflow.backend.auth;

import jakarta.servlet.*;
import jakarta.servlet.http.*;
import java.io.IOException;

import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.web.filter.OncePerRequestFilter;
import com.examflow.backend.exception.ApiException;

public class DatabaseAuthenticationFilter extends OncePerRequestFilter {
    private final DatabaseAuthService auth;
    public DatabaseAuthenticationFilter(DatabaseAuthService auth){this.auth=auth;}
    @Override protected void doFilterInternal(HttpServletRequest request,HttpServletResponse response,FilterChain chain) throws ServletException,IOException {
        String header=request.getHeader("Authorization");
        if(header!=null&&header.startsWith("Bearer ")&&SecurityContextHolder.getContext().getAuthentication()==null) {
            try {
                var principal=auth.authenticate(header.substring(7));
                SecurityContextHolder.getContext().setAuthentication(new com.examflow.backend.config.DatabasePrincipalConverter().convert(principal));
            }catch(ApiException invalid){
                response.setStatus(401);response.setContentType("application/json;charset=UTF-8");
                response.getWriter().write("{\"message\":\"Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.\"}");return;
            }
        }
        chain.doFilter(request,response);
    }
}
