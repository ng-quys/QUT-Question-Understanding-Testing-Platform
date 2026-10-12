package com.examflow.backend.controller;

import com.examflow.backend.dto.AntiCheatEventRequest;
import com.examflow.backend.dto.ApiMessage;
import com.examflow.backend.entity.UserEntity;
import com.examflow.backend.exception.ApiException;
import com.examflow.backend.service.AntiCheatService;
import com.examflow.backend.service.CurrentUserService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/student/attempts")
public class AntiCheatController {
    private final AntiCheatService antiCheatService;
    private final CurrentUserService currentUserService;

    public AntiCheatController(AntiCheatService antiCheatService,
            CurrentUserService currentUserService) {
        this.antiCheatService = antiCheatService;
        this.currentUserService = currentUserService;
    }

    @PostMapping("/{attemptId}/browser-events")
    public ApiMessage browserEvent(@AuthenticationPrincipal Jwt jwt,
            @PathVariable Long attemptId,
            @Valid @RequestBody AntiCheatEventRequest request) {
        antiCheatService.recordBrowserEvent(studentId(jwt), attemptId, request);
        return new ApiMessage("Đã ghi nhận sự kiện trình duyệt");
    }

    private Long studentId(Jwt jwt) {
        if (jwt == null) throw new ApiException(HttpStatus.UNAUTHORIZED, "Bạn cần đăng nhập");
        UserEntity user = currentUserService.getCurrentUser(jwt);
        if (user == null || !"student".equalsIgnoreCase(user.getRole())) {
            throw new ApiException(HttpStatus.FORBIDDEN, "Yêu cầu quyền sinh viên");
        }
        return user.getId();
    }
}
