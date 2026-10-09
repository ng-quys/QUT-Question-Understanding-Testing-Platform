package com.examflow.backend.controller;
import com.examflow.backend.dto.*;
import com.examflow.backend.service.TeacherProfileService;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;
@RestController
@RequestMapping("/api/teacher/profile")
public class TeacherProfileController {
 private final TeacherProfileService service;
 public TeacherProfileController(TeacherProfileService service){this.service=service;}
 @GetMapping public TeacherProfileResponse get(@AuthenticationPrincipal Jwt jwt){return service.get(jwt);}
 @PatchMapping public TeacherProfileResponse update(@AuthenticationPrincipal Jwt jwt,@RequestBody UpdateTeacherProfileRequest request){return service.update(jwt,request);}
}
