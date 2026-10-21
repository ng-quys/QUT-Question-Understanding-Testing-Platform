package com.examflow.backend;
import com.examflow.backend.auth.*;
import com.examflow.backend.entity.UserEntity;
import com.examflow.backend.repository.UserRepository;
import com.examflow.backend.exception.ApiException;
import org.junit.jupiter.api.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import java.util.*;
import java.time.Instant;
import java.sql.Timestamp;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class DatabaseAuthTests {
 final JdbcTemplate db=mock(JdbcTemplate.class);
 final UserRepository users=mock(UserRepository.class);
 final PasswordEncoder passwords=mock(PasswordEncoder.class);
 final DatabaseAuthService auth=new DatabaseAuthService(db,users,passwords);
 final String token="synthetic-token-with-more-than-20-characters";
 UserEntity user;
 @BeforeEach void setup(){user=new UserEntity();user.setId(5L);user.setUsername("2001230001");user.setRole("student");user.setEmail("synthetic@example.invalid");user.setFullName("Synthetic");user.setStatus("active");user.setPasswordHash("hash");when(users.findById(5L)).thenReturn(Optional.of(user));when(users.findForLogin(user.getUsername())).thenReturn(Optional.of(user));}
 @Test void loginIssuesRandomCredentialsAndStoresOnlyHashes(){when(passwords.matches("synthetic-password","hash")).thenReturn(true);var result=auth.login(user.getUsername(),"synthetic-password");assertEquals(43,result.access_token().length());assertNotEquals(result.access_token(),result.refresh_token());verify(db).update(startsWith("INSERT INTO auth_sessions"),anyString(),eq(5L),eq(DatabaseAuthService.hash(result.access_token())),eq(DatabaseAuthService.hash(result.refresh_token())));}
 @Test void failedLoginCountsAttemptsAndTemporarilyLocks(){user.setAuthFailedAttempts(9);assertThrows(ApiException.class,()->auth.login(user.getUsername(),"wrong"));assertTrue(user.getAuthLockedUntil().isAfter(Instant.now()));verify(users).save(user);verify(db,never()).update(startsWith("INSERT"),any(),any(),any(),any());}
 @Test void throttleCannotBeBypassedWithCorrectPassword(){user.setAuthLockedUntil(Instant.now().plusSeconds(200));when(passwords.matches(any(),any())).thenReturn(true);assertThrows(ApiException.class,()->auth.login(user.getUsername(),"synthetic-password"));}
 @Test void authenticationUsesLiveDatabaseRole(){when(db.queryForList(startsWith("SELECT user_id"),eq(DatabaseAuthService.hash(token)))).thenReturn(List.of(Map.of("user_id",5L,"access_expires_at",Timestamp.from(Instant.now().plusSeconds(500)))));var principal=auth.authenticate(token);assertEquals(5L,((Number)principal.getClaim("local_user_id")).longValue());assertEquals("local:5",principal.getSubject());Map<String,Object> roles=principal.getClaim("realm_access");assertEquals(List.of("STUDENT"),roles.get("roles"));user.setStatus("locked");assertThrows(ApiException.class,()->auth.authenticate(token));}
 @Test void unknownOrExpiredTokenCannotAuthenticate(){assertThrows(ApiException.class,()->auth.authenticate(token));assertThrows(ApiException.class,()->auth.authenticate("invalid"));}
 @Test void refreshRotatesBothCredentials(){when(db.queryForList(startsWith("SELECT id,user_id"),eq(DatabaseAuthService.hash(token)))).thenReturn(List.of(Map.of("id","session-id","user_id",5L)));var result=auth.refresh(token);assertNotEquals(token,result.refresh_token());verify(db).update(startsWith("UPDATE auth_sessions SET access_hash"),eq(DatabaseAuthService.hash(result.access_token())),eq(DatabaseAuthService.hash(result.refresh_token())),eq("session-id"));}
 @Test void logoutDeletesOnlyMatchingSession(){auth.logout(token);verify(db).update("DELETE FROM auth_sessions WHERE refresh_hash=?",DatabaseAuthService.hash(token));}
 @Test void passwordChangeChecksCurrentPasswordAndRevokesSessions(){when(users.findForPhotoUpdate(5L)).thenReturn(Optional.of(user));assertThrows(ApiException.class,()->auth.changePassword(5L,"wrong","new-password"));when(passwords.matches("current","hash")).thenReturn(true);when(passwords.encode("new-password")).thenReturn("new-hash");auth.changePassword(5L,"current","new-password");assertEquals("new-hash",user.getPasswordHash());verify(db).update("DELETE FROM auth_sessions WHERE user_id=?",5L);}
 @Test void encodedPasswordsVerifyWithoutExternalIdentityProvider(){var encoder=new DatabasePasswordEncoder();String encoded=encoder.encode("Synthetic mật khẩu long hơn 72 bytes ".repeat(3));assertTrue(encoder.matches("Synthetic mật khẩu long hơn 72 bytes ".repeat(3),encoded));assertFalse(encoder.matches("wrong",encoded));String legacy=new org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder(4).encode("legacy-password");assertTrue(encoder.matches("legacy-password",legacy));assertTrue(encoder.upgradeEncoding(legacy));}
}
