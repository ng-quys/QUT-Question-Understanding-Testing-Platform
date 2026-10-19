package com.examflow.backend.service;
import com.examflow.backend.dto.RegistrationRole;
import com.examflow.backend.entity.UserEntity;
import com.examflow.backend.exception.ApiException;
import com.examflow.backend.repository.UserRepository;
import org.junit.jupiter.api.*;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import java.util.Optional;
import static org.mockito.Mockito.*;
import static org.junit.jupiter.api.Assertions.*;
class ProvisionedIdentityTests {
 final UserRepository users=mock(UserRepository.class);final KeycloakAdminService keycloak=mock(KeycloakAdminService.class);final AdminService audit=mock(AdminService.class);
 final AdminCodeGenerator codes=mock(AdminCodeGenerator.class);
 final AdminAccountService accounts=new AdminAccountService(users,keycloak,audit);
 final AdminAccountService.Create request=new AdminAccountService.Create("2251120123","student@example.invalid","Synthetic-test-password","Synthetic student","CNTT",RegistrationRole.STUDENT);
 @BeforeEach void start(){org.springframework.test.util.ReflectionTestUtils.setField(accounts,"codes",codes);when(codes.next(AdminCodeGenerator.Kind.STUDENT)).thenReturn("2000000001");when(codes.next(AdminCodeGenerator.Kind.TEACHER)).thenReturn("3000000001");TransactionSynchronizationManager.initSynchronization();when(users.findByEmailIgnoreCaseOrUsernameIgnoreCase(any(),any())).thenReturn(Optional.empty());}
 @AfterEach void cleanup(){TransactionSynchronizationManager.clearSynchronization();}
 void finish(int status){for(var callback:TransactionSynchronizationManager.getSynchronizations())callback.afterCompletion(status);}
 @Test void duplicateIdentityDoesNotCreateKeycloakAccount(){when(users.findByEmailIgnoreCaseOrUsernameIgnoreCase(any(),any())).thenReturn(Optional.of(new UserEntity()));assertThrows(ApiException.class,()->accounts.create(1L,request));verifyNoInteractions(keycloak);}
 @Test void databaseRollbackCompensatesCreatedIdentity(){when(keycloak.createUser(any())).thenReturn("external-test");when(users.saveAndFlush(any())).thenThrow(new org.springframework.dao.DataIntegrityViolationException("synthetic failure"));assertThrows(RuntimeException.class,()->accounts.create(1L,request));finish(TransactionSynchronization.STATUS_ROLLED_BACK);verify(keycloak).deleteCreatedAccount("external-test");}
 @Test void keycloakFailureDoesNotWriteApplicationUser(){when(keycloak.createUser(any())).thenThrow(new IllegalStateException("synthetic network failure"));assertThrows(RuntimeException.class,()->accounts.create(1L,request));verify(users,never()).saveAndFlush(any());assertTrue(TransactionSynchronizationManager.getSynchronizations().isEmpty());}
 @Test void successLinksStudentCodeWithoutLocalPassword(){when(keycloak.createUser(any())).thenReturn("external-test");when(users.saveAndFlush(any())).thenAnswer(call->{UserEntity u=call.getArgument(0);u.setId(25L);return u;});var result=accounts.create(1L,request);assertEquals("2000000001",result.username());var capture=org.mockito.ArgumentCaptor.forClass(UserEntity.class);verify(users).saveAndFlush(capture.capture());assertEquals("external-test",capture.getValue().getKeycloakUserId());assertNull(capture.getValue().getPasswordHash());finish(TransactionSynchronization.STATUS_COMMITTED);verify(keycloak,never()).deleteCreatedAccount(any());}
 @Test void unknownSubjectCannotLinkByEmail(){var current=new CurrentUserService(users);when(users.findByKeycloakUserId("unknown-subject")).thenReturn(Optional.empty());Jwt jwt=Jwt.withTokenValue("synthetic").header("alg","none").subject("unknown-subject").claim("email","student@example.invalid").build();assertThrows(ApiException.class,()->current.getCurrentUser(jwt));verify(users,never()).findByEmailIgnoreCase(any());}
 @Test void disabledProvisionedIdentityIsRejected(){var u=new UserEntity();u.setStatus("locked");when(users.findByKeycloakUserId("known-subject")).thenReturn(Optional.of(u));var current=new CurrentUserService(users);Jwt jwt=Jwt.withTokenValue("synthetic").header("alg","none").subject("known-subject").build();assertThrows(ApiException.class,()->current.getCurrentUser(jwt));}
 @Test void explicitAdminRepairKeepsApplicationIdAndPhoto(){UserEntity u=new UserEntity();u.setId(25L);u.setRole("student");u.setUsername(request.username());u.setEmail(request.email());u.setPhotoKey("students/25/synthetic.jpg");when(users.findById(25L)).thenReturn(Optional.of(u));when(keycloak.findProvisionedAccount(request.username(),request.email(),"STUDENT")).thenReturn("verified-subject");when(users.findByKeycloakUserId("verified-subject")).thenReturn(Optional.empty());var result=accounts.repairIdentity(1L,25L);assertEquals(25L,result.id());assertEquals("verified-subject",u.getKeycloakUserId());assertEquals("students/25/synthetic.jpg",u.getPhotoKey());verify(keycloak,never()).createUser(any());}
 @Test void repairCannotMergeTwoExistingApplicationAccounts(){UserEntity u=new UserEntity();u.setId(25L);u.setRole("student");u.setUsername(request.username());u.setEmail(request.email());UserEntity other=new UserEntity();other.setId(26L);when(users.findById(25L)).thenReturn(Optional.of(u));when(keycloak.findProvisionedAccount(any(),any(),any())).thenReturn("occupied-subject");when(users.findByKeycloakUserId("occupied-subject")).thenReturn(Optional.of(other));assertThrows(ApiException.class,()->accounts.repairIdentity(1L,25L));verify(users,never()).saveAndFlush(any());}


 @Test void clientCannotChooseStudentCode(){
  when(keycloak.createUser(any())).thenReturn("student-test");when(users.saveAndFlush(any())).thenAnswer(call->{UserEntity u=call.getArgument(0);u.setId(25L);return u;});
  var result=accounts.create(1L,new AdminAccountService.Create("9999999999",request.email(),request.password(),request.fullName(),request.department(),RegistrationRole.STUDENT));
  assertEquals("2000000001",result.username());
  verify(keycloak).createUser(argThat(r->r.username().equals(result.username())));
  verify(users).saveAndFlush(argThat(u->u.getUsername().equals(result.username())));
 }
 @Test void teacherCodeIsGeneratedWith300PrefixWhenUsernameOmitted(){
  when(keycloak.createUser(any())).thenReturn("teacher-test");when(users.saveAndFlush(any())).thenAnswer(call->{UserEntity u=call.getArgument(0);u.setId(26L);return u;});
  var input=new AdminAccountService.Create(null,"teacher@example.invalid",request.password(),"Teacher",request.department(),RegistrationRole.TEACHER);
  assertEquals("3000000001",accounts.create(1L,input).username());
  verify(keycloak).createUser(argThat(r->r.username().equals("3000000001")&&r.role()==RegistrationRole.TEACHER));
 }
 @Test void keycloakOnlyUsernamesAreSkipped(){
  when(codes.next(AdminCodeGenerator.Kind.STUDENT)).thenReturn("2000000001","2000000002");
  when(keycloak.usernameExists("2000000001")).thenReturn(true);
  when(keycloak.createUser(any())).thenReturn("student-test");when(users.saveAndFlush(any())).thenAnswer(call->{UserEntity u=call.getArgument(0);u.setId(25L);return u;});
  assertEquals("2000000002",accounts.create(1L,request).username());
  verify(keycloak).createUser(argThat(r->r.username().equals("2000000002")));
 }
 @Test void repeatedIdentityCollisionsNeverCreateOrWriteUser(){
  when(keycloak.usernameExists(any())).thenReturn(true);
  assertThrows(ApiException.class,()->accounts.create(1L,request));
  verify(keycloak,never()).createUser(any());verify(users,never()).saveAndFlush(any());
 }
}
