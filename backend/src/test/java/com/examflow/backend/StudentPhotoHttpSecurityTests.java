package com.examflow.backend;

import com.examflow.backend.config.*;
import com.examflow.backend.controller.StudentProfileController;
import com.examflow.backend.entity.UserEntity;
import com.examflow.backend.service.*;
import com.examflow.backend.repository.UserRepository;
import java.util.Optional;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest(StudentProfileController.class)
@Import({SecurityConfig.class,DatabasePrincipalConverter.class,CurrentUserService.class})
class StudentPhotoHttpSecurityTests {
    @Autowired MockMvc mvc;
    @MockitoBean StudentProfileService photos;
    @MockitoBean UserRepository users;
    @MockitoBean JwtDecoder decoder;
    @MockitoBean com.examflow.backend.auth.DatabaseAuthService databaseAuth;
    UserEntity student;
    @BeforeEach void setup() {
        student=new UserEntity(); student.setId(26L);student.setRole("student");student.setStatus("active");student.setKeycloakUserId("student-sub");student.setEmail("student@example.com");
        when(users.findByKeycloakUserId("student-sub")).thenReturn(Optional.of(student));
        when(users.findByEmailIgnoreCase("student@example.com")).thenReturn(Optional.of(student));
        when(photos.getFacePhoto(26L)).thenReturn(new byte[]{1,2,3});
    }
    @Test void photoIsBoundToSignedIdentityAndNotQueryId() throws Exception {
        mvc.perform(get("/api/student/profile/photo?studentId=27").with(jwt().jwt(j->j.subject("student-sub")).authorities(new SimpleGrantedAuthority("ROLE_STUDENT"))))
                .andExpect(status().isOk()).andExpect(header().string("Cache-Control","no-store"));
        verify(photos).getFacePhoto(26L); verify(photos,never()).getFacePhoto(27L);
    }
    @Test void unknownIdentityCannotReadAnotherAccountsPhoto() throws Exception {
        mvc.perform(get("/api/student/profile/photo").with(jwt().jwt(j->j.subject("other-sub")).authorities(new SimpleGrantedAuthority("ROLE_STUDENT"))))
                .andExpect(status().isUnauthorized()); verifyNoInteractions(photos);
    }
    @Test void anonymousAndTeacherCannotReadStudentPhotoRoute() throws Exception {
        mvc.perform(get("/api/student/profile/photo")).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/student/profile/photo").with(jwt().authorities(new SimpleGrantedAuthority("ROLE_TEACHER")))).andExpect(status().isForbidden());
        verifyNoInteractions(photos);
    }
    @Test void multipartUploadAlsoUsesAuthenticatedStudentOnly() throws Exception {
        mvc.perform(multipart("/api/student/profile/photo").file("file",new byte[]{1,2,3}).param("studentId","27")
                .with(jwt().jwt(j->j.subject("student-sub")).authorities(new SimpleGrantedAuthority("ROLE_STUDENT"))))
                .andExpect(status().isOk());
        verify(photos).saveFacePhoto(eq(26L),any()); verify(photos,never()).saveFacePhoto(eq(27L),any());
    }
    @Test void unprovisionedSocialSubjectCannotUseMatchingEmailForPhoto() throws Exception {
        mvc.perform(get("/api/student/profile/photo").with(jwt().jwt(j->j.subject("social-sub").claim("email","student@example.com").claim("email_verified",true))
                .authorities(new SimpleGrantedAuthority("ROLE_STUDENT")))).andExpect(status().isUnauthorized());
        verifyNoInteractions(photos);verify(users,never()).findByEmailIgnoreCase(any());
    }
    @Test void mismatchedLegacySubjectRequiresExplicitAdminRepair() throws Exception {
        var identity=jwt().jwt(j->j.subject("legacy-sub").claim("email","student@example.com").claim("email_verified",false))
                .authorities(new SimpleGrantedAuthority("ROLE_STUDENT"));
        mvc.perform(get("/api/student/profile/photo?studentId=27").with(identity)).andExpect(status().isUnauthorized());
        mvc.perform(multipart("/api/student/profile/photo").file("file",new byte[]{1,2,3}).param("studentId","27").with(identity)).andExpect(status().isUnauthorized());
        verifyNoInteractions(photos);verify(users,never()).findByEmailIgnoreCase(any());
    }
    @Test void differentEmailWithNoAccountIsRejectedByResolver() throws Exception {
        mvc.perform(get("/api/student/profile/photo").with(jwt().jwt(j->j.subject("social-sub").claim("email","other@example.com").claim("email_verified",true))
                .authorities(new SimpleGrantedAuthority("ROLE_STUDENT")))).andExpect(status().isUnauthorized());
        verifyNoInteractions(photos);
    }
    @Test void lockedAccountOrDatabaseRoleMismatchCannotAccessPhoto() throws Exception {
        var identity=jwt().jwt(j->j.subject("student-sub")).authorities(new SimpleGrantedAuthority("ROLE_STUDENT"));
        student.setStatus("inactive");
        mvc.perform(get("/api/student/profile/photo").with(identity)).andExpect(status().isForbidden());
        student.setStatus("active");student.setRole("teacher");
        mvc.perform(get("/api/student/profile/photo").with(identity)).andExpect(status().isForbidden());
        verifyNoInteractions(photos);
    }
}
