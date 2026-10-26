package com.examflow.backend.controller;

import com.examflow.backend.service.*;
import java.util.Map;
import org.springframework.web.bind.annotation.*;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;

@RestController
@RequestMapping("/api/admin/ai-credits/jobs/{id}/checkpoint-recovery")
public class AiCheckpointRecoveryController {
    private final AiCheckpointRecovery recovery;
    private final AdminIdentityService admins;
    public AiCheckpointRecoveryController(AiCheckpointRecovery recovery,AdminIdentityService admins){this.recovery=recovery;this.admins=admins;}
    @GetMapping public Map<String,Object> preview(@AuthenticationPrincipal Jwt jwt,@PathVariable long id){
        admins.requireAdmin(jwt);return recovery.preview(id);
    }
    public record Recovery(boolean confirmedStopped,String fingerprint,String currentRegistry,String reason){}
    @PostMapping public Map<String,Object> recover(@AuthenticationPrincipal Jwt jwt,@PathVariable long id,@RequestBody Recovery body){
        return recovery.recover(admins.requireAdmin(jwt).getId(),id,body.confirmedStopped(),body.fingerprint(),body.currentRegistry(),body.reason());
    }
}
