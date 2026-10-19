package com.examflow.backend.controller;

import com.examflow.backend.dto.AiGenerateRequest;
import com.examflow.backend.service.*;
import jakarta.validation.Valid;
import org.springframework.http.*;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;
import java.util.*;

@RestController
public class AiCreditsController {
    private final AiCreditsService credits;
    private final AiCreditsProvider provider;
    private final AiCreditsWorker worker;
    private final CurrentUserService users;
    private final AdminIdentityService admins;
    public AiCreditsController(AiCreditsService credits,AiCreditsProvider provider,AiCreditsWorker worker,CurrentUserService users,AdminIdentityService admins){
        this.credits=credits;this.provider=provider;this.worker=worker;this.users=users;this.admins=admins;
    }
    private long teacher(Jwt jwt){
        var user=users.getCurrentUser(jwt);
        if(!List.of("teacher","faculty","admin").contains(user.getRole().toLowerCase(Locale.ROOT)))
            throw new ResponseStatusException(HttpStatus.FORBIDDEN,"Chỉ giảng viên được sử dụng AI Credits.");
        return user.getId();
    }
    @GetMapping("/api/teacher/ai-credits")
    public AiCreditsService.Quota quota(@AuthenticationPrincipal Jwt jwt){return credits.quota(teacher(jwt));}
    @PostMapping("/api/teacher/ai-credits/jobs")
    @ResponseStatus(HttpStatus.ACCEPTED)
    public Map<String,Object> create(@AuthenticationPrincipal Jwt jwt,@RequestParam UUID idempotencyKey,@Valid @RequestBody AiGenerateRequest request){
        return credits.create(teacher(jwt),idempotencyKey,request);
    }
    @GetMapping("/api/teacher/ai-credits/jobs/{id}")
    public Map<String,Object> job(@AuthenticationPrincipal Jwt jwt,@PathVariable long id){return credits.job(teacher(jwt),id);}
    @PostMapping("/api/teacher/ai-credits/jobs/{id}/cancel")
    public Map<String,Object> cancel(@AuthenticationPrincipal Jwt jwt,@PathVariable long id){return credits.cancel(teacher(jwt),id);}
    @PostMapping(value="/api/teacher/ai-credits/extract",consumes=MediaType.MULTIPART_FORM_DATA_VALUE)
    @SuppressWarnings("unchecked")
    public Map<String,Object> extract(@AuthenticationPrincipal Jwt jwt,@RequestParam MultipartFile[] files)throws Exception{
        long user=teacher(jwt);
        var response=provider.extract(files);
        var documents=(List<Map<String,Object>>)response.get("documents");
        String text=String.join("\n\n",documents.stream().map(d->Objects.toString(d.get("extractedText"),"")).toList());
        response.put("sourceProof",credits.documentProof(user,text));
        return response;
    }
    @GetMapping("/api/admin/ai-credits")
    public Map<String,Object> teachers(@AuthenticationPrincipal Jwt jwt,@RequestParam(defaultValue="")String q,
                                      @RequestParam(defaultValue="0")int page,@RequestParam(defaultValue="20")int size){
        admins.requireAdmin(jwt);return credits.teachers(q,page,size);
    }
    public record Grant(UUID operationKey,long amount,String reason){}
    @PostMapping("/api/admin/ai-credits/{user}/grants")
    public Map<String,Object> grant(@AuthenticationPrincipal Jwt jwt,@PathVariable long user,@RequestBody Grant body){
        long admin=admins.requireAdmin(jwt).getId();
        if(body.operationKey()==null)throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"Cần operationKey.");
        return credits.grant(admin,user,body.operationKey(),body.amount(),body.reason());
    }
    @GetMapping("/api/admin/ai-credits/{user}/history")
    public List<Map<String,Object>> history(@AuthenticationPrincipal Jwt jwt,@PathVariable long user,@RequestParam(required=false)Long before,@RequestParam(defaultValue="30")int size){
        admins.requireAdmin(jwt);return credits.history(user,before,size);
    }
    public record Reconcile(boolean confirmedStopped,String reason){}
    @PostMapping("/api/admin/ai-credits/jobs/{id}/reconcile")
    public Map<String,Object> reconcile(@AuthenticationPrincipal Jwt jwt,@PathVariable long id,@RequestBody Reconcile body){
        return worker.reconcile(admins.requireAdmin(jwt).getId(),id,body.confirmedStopped(),body.reason());
    }
}
