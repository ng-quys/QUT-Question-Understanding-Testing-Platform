package com.examflow.backend.auth;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Base64;

@Service
public class TokenService {
    private final byte[] secret;
    private final long ttlSeconds;

    public TokenService(
            @Value("${app.auth.token-secret:examflow-dev-secret-change-me}") String secret,
            @Value("${app.auth.token-ttl-seconds:28800}") long ttlSeconds) {
        this.secret = secret.getBytes(StandardCharsets.UTF_8);
        this.ttlSeconds = ttlSeconds;
    }

    public String createToken(Long userId, String role, String email) {
        long expiresAt = Instant.now().getEpochSecond() + ttlSeconds;
        String payload = userId + "|" + role + "|" + email + "|" + expiresAt;
        String encoded = Base64.getUrlEncoder().withoutPadding()
                .encodeToString(payload.getBytes(StandardCharsets.UTF_8));
        return encoded + "." + sign(encoded);
    }

    public AuthenticatedUser parse(String token) {
        if (token == null || !token.contains(".")) {
            throw new IllegalArgumentException("Invalid token");
        }
        String[] parts = token.split("\\.", 2);
        if (!constantTimeEquals(sign(parts[0]), parts[1])) {
            throw new IllegalArgumentException("Invalid token signature");
        }
        String payload = new String(Base64.getUrlDecoder().decode(parts[0]), StandardCharsets.UTF_8);
        String[] fields = payload.split("\\|", 4);
        if (fields.length != 4) {
            throw new IllegalArgumentException("Invalid token payload");
        }
        long expiresAt = Long.parseLong(fields[3]);
        if (Instant.now().getEpochSecond() >= expiresAt) {
            throw new IllegalArgumentException("Token expired");
        }
        return new AuthenticatedUser(Long.parseLong(fields[0]), fields[1], fields[2]);
    }

    private String sign(String value) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(secret, "HmacSHA256"));
            return Base64.getUrlEncoder().withoutPadding()
                    .encodeToString(mac.doFinal(value.getBytes(StandardCharsets.UTF_8)));
        } catch (Exception e) {
            throw new IllegalStateException("Unable to sign token", e);
        }
    }

    private boolean constantTimeEquals(String a, String b) {
        byte[] aa = a.getBytes(StandardCharsets.UTF_8);
        byte[] bb = b.getBytes(StandardCharsets.UTF_8);
        if (aa.length != bb.length) return false;
        int result = 0;
        for (int i = 0; i < aa.length; i++) result |= aa[i] ^ bb[i];
        return result == 0;
    }
}
