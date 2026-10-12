package com.examflow.backend.controller;

import org.springframework.security.oauth2.jwt.Jwt;
import com.examflow.backend.service.CurrentUserService;
import com.examflow.backend.entity.UserEntity;
import com.examflow.backend.dto.ApiMessage;
import com.examflow.backend.dto.StudentProfileDto;
import com.examflow.backend.exception.ApiException;
import com.examflow.backend.service.StudentProfileService;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

@RestController
@RequestMapping("/api/student/profile")
public class StudentProfileController {
    private final StudentProfileService profileService;

    private final CurrentUserService currentUserService;
    public StudentProfileController(StudentProfileService profileService, CurrentUserService currentUserService) {
        this.profileService = profileService;
        this.currentUserService = currentUserService;
    }

    @GetMapping
    public StudentProfileDto profile(@AuthenticationPrincipal Jwt jwt) {
        return profileService.getProfile(studentId(jwt));
    }

    @PostMapping(value = "/photo", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ApiMessage uploadPhoto(
            @AuthenticationPrincipal Jwt jwt,
            @RequestParam("file") MultipartFile file) {
        profileService.saveFacePhoto(studentId(jwt), file);
        return new ApiMessage("Đã lưu ảnh khuôn mặt");
    }

    @GetMapping("/photo")
    public ResponseEntity<ByteArrayResource> photo(@AuthenticationPrincipal Jwt jwt) {
        byte[] bytes = profileService.getFacePhoto(studentId(jwt));
        return ResponseEntity.ok()
                .contentType(MediaType.IMAGE_JPEG)
                .header(HttpHeaders.CACHE_CONTROL, "no-store")
                .body(new ByteArrayResource(bytes));
    }

    private Long studentId(Jwt jwt) {
        if (jwt == null) {
            throw new ApiException(org.springframework.http.HttpStatus.UNAUTHORIZED, "Bạn cần đăng nhập");
        }
        UserEntity user = currentUserService.getCurrentUser(jwt);
        if (user == null || !"student".equalsIgnoreCase(user.getRole())) {
            throw new ApiException(org.springframework.http.HttpStatus.FORBIDDEN, "Yêu cầu quyền sinh viên");
        }
        return user.getId();
    }
}
