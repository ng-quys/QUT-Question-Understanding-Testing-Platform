package com.examflow.backend.controller;

import com.examflow.backend.service.EvidenceReadService;
import com.examflow.backend.service.SupabaseEvidenceStorage;
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.http.*;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;
import java.nio.file.Files;
import java.util.Map;

@RestController
@RequestMapping({"/api/admin/evidence","/api/teacher/evidence"})
public class EvidenceController {
    private final EvidenceReadService evidence;
    public EvidenceController(EvidenceReadService evidence) { this.evidence=evidence; }
    @GetMapping("/attempts/{id}/events")
    public ResponseEntity<EvidenceReadService.EventPage> events(@AuthenticationPrincipal Jwt jwt,@PathVariable Long id,@RequestParam(defaultValue="0") int page,@RequestParam(defaultValue="20") int size) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(evidence.events(jwt,id,page,size));
    }
    @GetMapping("/attempts/{id}/events/{eventId}/link")
    public ResponseEntity<SupabaseEvidenceStorage.SignedLink> link(@AuthenticationPrincipal Jwt jwt,@PathVariable Long id,@PathVariable Long eventId) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(evidence.link(jwt,id,eventId));
    }
    @GetMapping("/attempts/{id}/events/{eventId}/local")
    public ResponseEntity<Resource> local(@AuthenticationPrincipal Jwt jwt,@PathVariable Long id,@PathVariable Long eventId) throws java.io.IOException {
        var file=evidence.local(jwt,id,eventId); String type=Files.probeContentType(file);
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).header("X-Content-Type-Options","nosniff")
                .contentType(MediaType.parseMediaType(type==null?"application/octet-stream":type)).body(new FileSystemResource(file));
    }
    @GetMapping("/history")
    public ResponseEntity<Map<String,Object>> history(@AuthenticationPrincipal Jwt jwt,@RequestParam(required=false) Long sessionId,@RequestParam(defaultValue="") String q,@RequestParam(defaultValue="0") int page,@RequestParam(defaultValue="20") int size) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(evidence.teacherHistory(jwt,sessionId,q,page,size));
    }
}
