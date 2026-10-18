package com.examflow.backend.controller;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

/** Local startup handshake, using the same property as AiCreditsProvider. */
@RestController
public class AiInternalKeyController {
    private final String key;
    public AiInternalKeyController(@Value("${ai.internal.key:}") String key){this.key=key;}

    @GetMapping("/api/internal/ai-credits/verify-key")
    public ResponseEntity<Void> verify(@RequestHeader(value="X-AI-Internal-Key",required=false) String provided){
        if(key.isBlank()||key.length()<32)return ResponseEntity.status(503).build();
        boolean equal=MessageDigest.isEqual(digest(key),digest(provided==null?"":provided));
        if(!equal||provided==null)return ResponseEntity.status(401).build();
        return ResponseEntity.noContent().build();
    }
    private static byte[] digest(String value){
        try{return MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8));}
        catch(NoSuchAlgorithmException error){throw new IllegalStateException("SHA-256 unavailable");}
    }
}
