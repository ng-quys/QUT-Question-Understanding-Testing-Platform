package com.examflow.backend.controller;

import com.examflow.backend.auth.AuthenticatedUser;
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

    public StudentProfileController(StudentProfileService profileService) {
        this.profileService = profileService;
    }

    @GetMapping
    public StudentProfileDto profile(@AuthenticationPrincipal AuthenticatedUser user) {
        return profileService.getProfile(studentId(user));
    }

    @PostMapping(value = "/photo", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ApiMessage uploadPhoto(
            @AuthenticationPrincipal AuthenticatedUser user,
            @RequestParam("file") MultipartFile file) {
        profileService.saveFacePhoto(studentId(user), file);
        return new ApiMessage("Đã lưu ảnh khuôn mặt");
    }

    @GetMapping("/photo")
    public ResponseEntity<ByteArrayResource> photo(@AuthenticationPrincipal AuthenticatedUser user) {
        byte[] bytes = profileService.getFacePhoto(studentId(user));
        return ResponseEntity.ok()
                .contentType(MediaType.IMAGE_JPEG)
                .header(HttpHeaders.CACHE_CONTROL, "no-store")
                .body(new ByteArrayResource(bytes));
    }

    private Long studentId(AuthenticatedUser user) {
        if (user == null || !"student".equalsIgnoreCase(user.role())) {
            throw new ApiException(org.springframework.http.HttpStatus.FORBIDDEN, "Yêu cầu quyền sinh viên");
        }
        return user.userId();
    }
}
