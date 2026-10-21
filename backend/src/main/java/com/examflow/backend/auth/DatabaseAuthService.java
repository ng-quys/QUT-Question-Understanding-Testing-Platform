package com.examflow.backend.auth;

import com.examflow.backend.entity.UserEntity;
import com.examflow.backend.exception.ApiException;
import com.examflow.backend.repository.UserRepository;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.time.Instant;
import java.sql.Timestamp;
import java.util.*;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Random bearer credentials are stored only as hashes in the shared database.
 * Jwt is an internal principal adapter for existing controllers; incoming JWTs
 * from external identity providers are never accepted by this service.
 */
@Service
public class DatabaseAuthService {
    private static final SecureRandom RANDOM = new SecureRandom();
    private final JdbcTemplate db;
    private final UserRepository users;
    private final PasswordEncoder passwords;
    private final String dummyHash;
    public DatabaseAuthService(JdbcTemplate db, UserRepository users, PasswordEncoder passwords) {
        this.db=db; this.users=users; this.passwords=passwords;
        this.dummyHash=passwords.encode(UUID.randomUUID().toString());
    }
    public record Tokens(String access_token,String refresh_token,String token_type,long expires_in,long refresh_expires_in) {}

    @Transactional(noRollbackFor=ApiException.class)
    public Tokens login(String username,String password) {
        UserEntity user=users.findForLogin(username.trim()).orElse(null);
        Instant now=Instant.now();
        boolean locked=user!=null&&user.getAuthLockedUntil()!=null&&user.getAuthLockedUntil().isAfter(now);
        boolean matches=passwords.matches(password,user==null||user.getPasswordHash()==null?dummyHash:user.getPasswordHash());
        if(user==null||locked||!matches||!"active".equals(user.getStatus())) {
            if(user!=null&&!locked) {
                int failures=user.getAuthFailedAttempts()+1;
                user.setAuthFailedAttempts(failures);
                if(failures>=10){user.setAuthLockedUntil(now.plusSeconds(300));user.setAuthFailedAttempts(0);}
                users.save(user);
            }
            throw new ApiException(HttpStatus.UNAUTHORIZED,"Mã đăng nhập hoặc mật khẩu không đúng, hoặc tài khoản đang bị khóa. Nếu thử sai nhiều lần, vui lòng chờ 5 phút.");
        }
        user.setAuthFailedAttempts(0); user.setAuthLockedUntil(null);
        // Rehash imported Argon2 credentials on successful login using the local policy.
        if(passwords.upgradeEncoding(user.getPasswordHash()))user.setPasswordHash(passwords.encode(password));
        users.save(user);
        db.update("DELETE FROM auth_sessions WHERE refresh_expires_at < now()");
        return issue(user.getId(),null);
    }

    @Transactional
    public Tokens refresh(String token) {
        String hash=hash(token);
        var rows=db.queryForList("SELECT id,user_id FROM auth_sessions WHERE refresh_hash=? AND refresh_expires_at>now() FOR UPDATE",hash);
        if(rows.size()!=1)throw unauthorized();
        var row=rows.get(0);
        UserEntity user=active(((Number)row.get("user_id")).longValue());
        return issue(user.getId(),(String)row.get("id"));
    }

    private Tokens issue(Long userId,String sessionId) {
        String access=randomToken(),refresh=randomToken();
        if(sessionId==null)db.update("INSERT INTO auth_sessions(id,user_id,access_hash,refresh_hash,access_expires_at,refresh_expires_at) VALUES (?,?,?,?,now()+interval '15 minutes',now()+interval '24 hours')",
                UUID.randomUUID().toString(),userId,hash(access),hash(refresh));
        else db.update("UPDATE auth_sessions SET access_hash=?,refresh_hash=?,access_expires_at=now()+interval '15 minutes' WHERE id=?",hash(access),hash(refresh),sessionId);
        return new Tokens(access,refresh,"Bearer",900,86400);
    }

    @Transactional(readOnly=true)
    public Jwt authenticate(String token) {
        var rows=db.queryForList("SELECT user_id,access_expires_at FROM auth_sessions WHERE access_hash=? AND access_expires_at>now() AND refresh_expires_at>now()",hash(token));
        if(rows.size()!=1)throw unauthorized();
        var row=rows.get(0);
        UserEntity user=active(((Number)row.get("user_id")).longValue());
        String role="faculty".equals(user.getRole())?"teacher":user.getRole();
        return Jwt.withTokenValue(token).header("alg","database-session")
                .subject(user.getKeycloakUserId()==null?"local:"+user.getId():user.getKeycloakUserId())
                .claim("local_user_id",user.getId()).claim("preferred_username",user.getUsername())
                .claim("email",user.getEmail()).claim("name",user.getFullName())
                .claim("realm_access",Map.of("roles",List.of(role.toUpperCase(Locale.ROOT))))
                .expiresAt(((Timestamp)row.get("access_expires_at")).toInstant()).build();
    }

    @Transactional
    public void logout(String refreshToken) {
        if(refreshToken!=null&&!refreshToken.isBlank())db.update("DELETE FROM auth_sessions WHERE refresh_hash=?",hash(refreshToken));
    }
    public void revokeUser(Long id){db.update("DELETE FROM auth_sessions WHERE user_id=?",id);}
    @Transactional
    public void changePassword(Long userId,String currentPassword,String newPassword){
        UserEntity user=users.findForPhotoUpdate(userId).orElseThrow(DatabaseAuthService::unauthorized);
        if(!passwords.matches(currentPassword,user.getPasswordHash()))throw new ApiException(HttpStatus.BAD_REQUEST,"Mật khẩu hiện tại không đúng.");
        user.setPasswordHash(passwords.encode(newPassword));user.setAuthFailedAttempts(0);user.setAuthLockedUntil(null);
        users.save(user);revokeUser(userId);
    }
    private UserEntity active(Long id) {
        UserEntity user=users.findById(id).orElseThrow(DatabaseAuthService::unauthorized);
        if(!"active".equals(user.getStatus())||!Set.of("student","teacher","faculty","admin").contains(user.getRole()))throw unauthorized();
        return user;
    }
    private static ApiException unauthorized(){return new ApiException(HttpStatus.UNAUTHORIZED,"Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.");}
    private static String randomToken(){byte[] bytes=new byte[32];RANDOM.nextBytes(bytes);return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);}
    public static String hash(String token) {
        if(token==null||token.length()<20||token.length()>256)throw unauthorized();
        try{return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(token.getBytes(StandardCharsets.UTF_8)));}
        catch(java.security.NoSuchAlgorithmException failure){throw new IllegalStateException(failure);}
    }
}
