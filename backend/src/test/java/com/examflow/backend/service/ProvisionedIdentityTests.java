package com.examflow.backend.service;
import com.examflow.backend.auth.*;
import com.examflow.backend.dto.RegistrationRole;
import com.examflow.backend.entity.UserEntity;
import com.examflow.backend.exception.ApiException;
import com.examflow.backend.repository.UserRepository;
import org.junit.jupiter.api.*;
import java.util.Optional;
import static org.mockito.Mockito.*;
import static org.junit.jupiter.api.Assertions.*;
class ProvisionedIdentityTests {
 final UserRepository users=mock(UserRepository.class);final AdminService audit=mock(AdminService.class);
 final DatabaseAuthService auth=mock(DatabaseAuthService.class);final DatabasePasswordEncoder passwords=new DatabasePasswordEncoder();
 final AdminCodeGenerator codes=mock(AdminCodeGenerator.class);
 final AdminAccountService accounts=new AdminAccountService(users,passwords,audit,auth);
 final AdminAccountService.Create request=new AdminAccountService.Create("ignored","student@example.invalid","Synthetic-test-password","Synthetic student","CNTT",RegistrationRole.STUDENT);
 @BeforeEach void setup(){org.springframework.test.util.ReflectionTestUtils.setField(accounts,"codes",codes);when(codes.next(AdminCodeGenerator.Kind.STUDENT)).thenReturn("2001230001");when(codes.next(AdminCodeGenerator.Kind.TEACHER)).thenReturn("3001240001");when(users.saveAndFlush(any())).thenAnswer(call->{UserEntity u=call.getArgument(0);if(u.getId()==null)u.setId(25L);return u;});}
 @Test void creationStoresPasswordHashAndFixedGeneratedCode(){var result=accounts.create(1L,request);assertEquals("2001230001",result.username());var capture=org.mockito.ArgumentCaptor.forClass(UserEntity.class);verify(users).saveAndFlush(capture.capture());var u=capture.getValue();assertTrue(passwords.matches(request.password(),u.getPasswordHash()));assertNotEquals(request.password(),u.getPasswordHash());assertNull(u.getKeycloakUserId());}
 @Test void teacherUsesTeacherPrefix(){var result=accounts.create(1L,new AdminAccountService.Create("client-choice","teacher@example.invalid",request.password(),"Teacher","CNTT",RegistrationRole.TEACHER));assertEquals("3001240001",result.username());}
 @Test void duplicateEmailDoesNotWriteUser(){when(users.findByEmailIgnoreCaseOrUsernameIgnoreCase(any(),any())).thenReturn(Optional.of(new UserEntity()));assertThrows(ApiException.class,()->accounts.create(1L,request));verify(users,never()).saveAndFlush(any());}
 UserEntity student(){var u=new UserEntity();u.setId(25L);u.setUsername("2001230001");u.setFullName("Synthetic student");u.setRole("student");u.setStatus("active");when(users.findById(25L)).thenReturn(Optional.of(u));return u;}
 @Test void passwordResetHashesAndRevokesAllSessions(){var u=student();accounts.resetPassword(1L,25L,"New-synthetic-password");assertTrue(passwords.matches("New-synthetic-password",u.getPasswordHash()));verify(auth).revokeUser(25L);}
 @Test void lockRevokesAllSessions(){var u=student();accounts.edit(1L,25L,new AdminAccountService.Edit("Synthetic student","CNTT",RegistrationRole.STUDENT,"locked"));assertEquals("locked",u.getStatus());verify(auth).revokeUser(25L);}
 @Test void currentIdentityResolvesDatabaseIdWithoutEmailLinking(){var u=student();var jwt=org.springframework.security.oauth2.jwt.Jwt.withTokenValue("synthetic").header("alg","database-session").subject("local:25").claim("local_user_id",25L).build();assertEquals(u,new CurrentUserService(users).getCurrentUser(jwt));verify(users,never()).findByEmailIgnoreCase(any());}
 @Test void lockedIdentityCannotUseExistingSession(){var u=student();u.setStatus("locked");var jwt=org.springframework.security.oauth2.jwt.Jwt.withTokenValue("synthetic").header("alg","database-session").subject("local:25").claim("local_user_id",25L).build();assertThrows(ApiException.class,()->new CurrentUserService(users).getCurrentUser(jwt));}
}
