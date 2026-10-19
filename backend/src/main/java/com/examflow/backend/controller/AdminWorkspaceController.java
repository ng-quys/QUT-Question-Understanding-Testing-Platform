package com.examflow.backend.controller;

import com.examflow.backend.service.*;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.http.*;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;
import java.nio.file.Files;
import java.time.LocalDate;
import java.util.Map;

@RestController
@RequestMapping("/api/admin/workspace")
public class AdminWorkspaceController {
    private final AdminWorkspaceService workspace;
    private final AdminIdentityService identity;
    private final AdminEvidenceService evidence;
    public AdminWorkspaceController(AdminWorkspaceService workspace, AdminIdentityService identity, AdminEvidenceService evidence) {
        this.workspace = workspace; this.identity = identity; this.evidence = evidence;
    }
    @GetMapping("/list/{resource}")
    public AdminWorkspaceService.Page list(@AuthenticationPrincipal Jwt jwt, @PathVariable String resource,
            @RequestParam(defaultValue="") String q, @RequestParam(defaultValue="") String status,
            @RequestParam(defaultValue="") String role, @RequestParam(defaultValue="") String course,
            @RequestParam(required=false) Long sessionId, @RequestParam(required=false) LocalDate from,
            @RequestParam(required=false) LocalDate to, @RequestParam(defaultValue="0") int page,
            @RequestParam(defaultValue="20") int size, @RequestParam(defaultValue="") String sessionCode) {
        identity.requireAdmin(jwt);
        return workspace.list(resource, new AdminWorkspaceService.Filters(q,status,role,course,sessionId,from,to,sessionCode), page,size);
    }
    @GetMapping("/report")
    public Map<String,Object> report(@AuthenticationPrincipal Jwt jwt, @RequestParam(defaultValue="") String q,
            @RequestParam(defaultValue="") String course, @RequestParam(required=false) Long sessionId,
            @RequestParam(required=false) LocalDate from, @RequestParam(required=false) LocalDate to,
            @RequestParam(defaultValue="") String sessionCode) {
        identity.requireAdmin(jwt);
        return workspace.report(new AdminWorkspaceService.Filters(q,"","",course,sessionId,from,to,sessionCode));
    }
    @GetMapping("/attempts/{id}/review")
    public Map<String,Object> review(@AuthenticationPrincipal Jwt jwt, @PathVariable Long id) { identity.requireAdmin(jwt); return workspace.review(id); }
    public record Review(@NotBlank String outcome, @Size(max=4000) String note, long revision) {}
    @PutMapping("/attempts/{id}/review")
    public Map<String,Object> review(@AuthenticationPrincipal Jwt jwt, @PathVariable Long id, @Valid @RequestBody Review request) {
        return workspace.review(identity.requireAdmin(jwt).getId(),id,request.outcome(),request.note(),request.revision());
    }
    @GetMapping("/attempts/{id}/events/{eventId}/evidence")
    public ResponseEntity<Resource> evidence(@AuthenticationPrincipal Jwt jwt, @PathVariable Long id, @PathVariable Long eventId) throws java.io.IOException {
        identity.requireAdmin(jwt);
        var file = evidence.resolve(id, workspace.evidence(id,eventId));
        String mime = Files.probeContentType(file);
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).header("X-Content-Type-Options","nosniff")
                .header(HttpHeaders.CONTENT_DISPOSITION, ContentDisposition.inline().filename(file.getFileName().toString()).build().toString())
                .contentType(MediaType.parseMediaType(mime == null ? "application/octet-stream" : mime)).body(new FileSystemResource(file));
    }
    @GetMapping("/sessions/{id}/detail")
    public Map<String, Object> sessionDetail(@AuthenticationPrincipal Jwt jwt, @PathVariable Long id) {
        identity.requireAdmin(jwt);
        return workspace.sessionDetail(id);
    }
    @PatchMapping("/sessions/{id}/status")
    public Map<String, Object> updateSessionStatus(@AuthenticationPrincipal Jwt jwt, @PathVariable Long id, @RequestParam String status) {
        return workspace.updateSessionStatus(identity.requireAdmin(jwt).getId(), id, status);
    }
}
