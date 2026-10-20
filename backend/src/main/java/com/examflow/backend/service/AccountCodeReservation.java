package com.examflow.backend.service;

import com.examflow.backend.dto.RegistrationRole;
import com.examflow.backend.exception.ApiException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.time.Instant;
import java.util.Base64;

/** Binds a server-issued code to the administrator and role without trusting browser input. */
@Service
public class AccountCodeReservation {
    private final byte[] key = new byte[32];
    public AccountCodeReservation() { new SecureRandom().nextBytes(key); }

    public String issue(Long actor, RegistrationRole role, String code) {
        String payload = actor + ":" + role.name() + ":" + code + ":" + Instant.now().plusSeconds(1800).getEpochSecond();
        String body = Base64.getUrlEncoder().withoutPadding().encodeToString(payload.getBytes(StandardCharsets.UTF_8));
        return body + "." + Base64.getUrlEncoder().withoutPadding().encodeToString(sign(body));
    }

    public String verify(Long actor, RegistrationRole role, String token) {
        try {
            String[] parts = token.split("\\.", -1);
            if (parts.length != 2 || !MessageDigest.isEqual(sign(parts[0]), Base64.getUrlDecoder().decode(parts[1]))) throw new IllegalArgumentException();
            String[] fields = new String(Base64.getUrlDecoder().decode(parts[0]), StandardCharsets.UTF_8).split(":", -1);
            String prefix = role == RegistrationRole.STUDENT ? "200123" : "300124";
            if (fields.length != 4 || !fields[0].equals(actor.toString()) || !fields[1].equals(role.name())
                    || !fields[2].matches(prefix + "[0-9]{4}") || Long.parseLong(fields[3]) <= Instant.now().getEpochSecond()) throw new IllegalArgumentException();
            return fields[2];
        } catch (RuntimeException exception) {
            throw new ApiException(HttpStatus.CONFLICT, "Mã đăng nhập đã hết hiệu lực. Vui lòng cấp lại mã trước khi lưu.");
        }
    }

    private byte[] sign(String body) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(key, "HmacSHA256"));
            return mac.doFinal(body.getBytes(StandardCharsets.UTF_8));
        } catch (java.security.GeneralSecurityException exception) { throw new IllegalStateException(exception); }
    }
}
