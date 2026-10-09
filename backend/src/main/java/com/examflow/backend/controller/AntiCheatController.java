package com.examflow.backend.controller;

import com.examflow.backend.auth.AuthenticatedUser;
import com.examflow.backend.dto.AntiCheatEventRequest;
import com.examflow.backend.dto.ApiMessage;
import com.examflow.backend.exception.ApiException;
import com.examflow.backend.service.AntiCheatService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/student/attempts")
public class AntiCheatController {

    private final AntiCheatService antiCheatService;

    public AntiCheatController(AntiCheatService antiCheatService) {
        this.antiCheatService = antiCheatService;
    }

    @PostMapping("/{attemptId}/browser-events")
    public ApiMessage browserEvent(
            @AuthenticationPrincipal AuthenticatedUser user,
            @PathVariable Long attemptId,
            @Valid @RequestBody AntiCheatEventRequest request
    ) {
        Long studentId = studentId(user);

        antiCheatService.recordBrowserEvent(
                studentId,
                attemptId,
                request
        );

        return new ApiMessage("Đã ghi nhận browser event");
    }

    private Long studentId(AuthenticatedUser user) {
        if (user == null || !"student".equalsIgnoreCase(user.role())) {
            throw new ApiException(
                    HttpStatus.FORBIDDEN,
                    "Yêu cầu quyền sinh viên"
            );
        }

        return user.userId();
    }
}
