package com.examflow.backend.controller;

import com.examflow.backend.service.*;
import org.springframework.http.*;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;
import java.util.*;

@RestController
@RequestMapping("/api/teacher/courses/{courseId}/ai-documents")
public class AiDocumentController {
    private final AiDocumentService documents;private final CurrentUserService users;
    public AiDocumentController(AiDocumentService documents,CurrentUserService users){this.documents=documents;this.users=users;}
    private long user(Jwt jwt){return users.getCurrentUser(jwt).getId();}
    @GetMapping public List<Map<String,Object>> list(@AuthenticationPrincipal Jwt jwt,@PathVariable long courseId){return documents.list(user(jwt),courseId);}
    @PostMapping(consumes=MediaType.MULTIPART_FORM_DATA_VALUE)
    public List<Map<String,Object>> upload(@AuthenticationPrincipal Jwt jwt,@PathVariable long courseId,@RequestParam("files") MultipartFile[] files)throws Exception{return documents.upload(user(jwt),courseId,files);}
    @GetMapping("/{id}") public Map<String,Object> detail(@AuthenticationPrincipal Jwt jwt,@PathVariable long courseId,@PathVariable UUID id){return documents.detail(user(jwt),courseId,id);}
    @PostMapping("/{id}/reindex") public Map<String,Object> reindex(@AuthenticationPrincipal Jwt jwt,@PathVariable long courseId,@PathVariable UUID id)throws Exception{return documents.reindex(user(jwt),courseId,id);}
    @DeleteMapping("/{id}") @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@AuthenticationPrincipal Jwt jwt,@PathVariable long courseId,@PathVariable UUID id){documents.softDelete(user(jwt),courseId,id);}
}
