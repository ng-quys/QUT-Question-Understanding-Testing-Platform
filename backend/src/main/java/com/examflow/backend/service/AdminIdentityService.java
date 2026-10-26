package com.examflow.backend.service;
import com.examflow.backend.entity.UserEntity;
import com.examflow.backend.exception.ApiException;
import com.examflow.backend.repository.UserRepository;
import org.springframework.http.HttpStatus;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.stereotype.Service;
@Service public class AdminIdentityService {
 private final CurrentUserService current;
 public AdminIdentityService(UserRepository users){this.current=new CurrentUserService(users);}
 public UserEntity requireAdmin(Jwt principal){var user=current.getCurrentUser(principal);if(!"admin".equalsIgnoreCase(user.getRole()))throw new ApiException(HttpStatus.FORBIDDEN,"Tài khoản không có quyền quản trị");return user;}
}
