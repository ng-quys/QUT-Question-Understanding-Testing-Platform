package com.examflow.backend.controller;

import com.examflow.backend.dto.ApiMessage;
import com.examflow.backend.exception.ApiException;
import com.examflow.backend.service.AntiCheatService;
import tools.jackson.databind.JsonNode;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/internal/anticheating")
public class AntiCheatInternalController {
    private final AntiCheatService service;
    private final String secret;

    public AntiCheatInternalController(AntiCheatService service, @Value("${app.anticheat.secret:change-me}") String secret) {
        this.service = service;
        this.secret = secret;
    }

    @PostMapping("/events")
    public ApiMessage event(@RequestHeader(value = "X-AntiCheat-Secret", required = false) String provided,
                            @RequestBody JsonNode data) {
        if (provided == null || !provided.equals(secret)) {
            throw new ApiException(HttpStatus.UNAUTHORIZED, "Invalid Anti-Cheating secret");
        }
        service.receiveAiEvent(data);
        return new ApiMessage("Đã lưu Anti-Cheating event");
    }
}
