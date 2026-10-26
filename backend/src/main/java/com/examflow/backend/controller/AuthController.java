package com.examflow.backend.controller;
import com.examflow.backend.auth.DatabaseAuthService;
import com.examflow.backend.service.CurrentUserService;
import com.examflow.backend.exception.ApiException;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;
import java.util.Map;
@RestController @RequestMapping("/api/auth")
public class AuthController {
 private final DatabaseAuthService auth; private final CurrentUserService currentUsers;
 public AuthController(DatabaseAuthService auth,CurrentUserService currentUsers){this.auth=auth;this.currentUsers=currentUsers;}
 public record Login(@NotBlank @Size(max=80) String username,@NotBlank @Size(max=128) String password){}
 public record Refresh(@NotBlank @Size(min=20,max=256) String refreshToken){}
 public record ChangePassword(@NotBlank @Size(max=128) String currentPassword,@NotBlank @Size(min=8,max=128) String newPassword){}
 @PostMapping("/password") @ResponseStatus(HttpStatus.NO_CONTENT) public void changePassword(@AuthenticationPrincipal Jwt principal,@Valid @RequestBody ChangePassword body){auth.changePassword(currentUsers.getCurrentUser(principal).getId(),body.currentPassword(),body.newPassword());}
 @PostMapping("/login") public DatabaseAuthService.Tokens login(@Valid @RequestBody Login body){return auth.login(body.username(),body.password());}
 @PostMapping("/refresh") public DatabaseAuthService.Tokens refresh(@Valid @RequestBody Refresh body){return auth.refresh(body.refreshToken());}
 @PostMapping("/logout") @ResponseStatus(HttpStatus.NO_CONTENT) public void logout(@Valid @RequestBody Refresh body){auth.logout(body.refreshToken());}
 @GetMapping("/me") public Map<String,Object> me(@AuthenticationPrincipal Jwt principal){var u=currentUsers.getCurrentUser(principal);return Map.of("id",u.getId(),"username",u.getUsername(),"fullName",u.getFullName(),"email",u.getEmail(),"role",u.getRole());}
 @PostMapping("/register") public void register(){throw new ApiException(HttpStatus.FORBIDDEN,"Tài khoản do quản trị viên cấp. Không hỗ trợ tự đăng ký.");}
}
