package com.examflow.backend;

import com.examflow.backend.config.*;
import com.examflow.backend.controller.StudentController;
import com.examflow.backend.entity.UserEntity;
import com.examflow.backend.exception.ApiException;
import com.examflow.backend.service.*;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import java.util.Map;
import static org.mockito.Mockito.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest(StudentController.class)
@Import({SecurityConfig.class,DatabasePrincipalConverter.class})
class StudentCameraHttpTests {
    @Autowired MockMvc mvc;
    @MockitoBean StudentService students;
    @MockitoBean CurrentUserService users;
    @MockitoBean AntiCheatService antiCheat;
    @MockitoBean JwtDecoder decoder;
    @MockitoBean com.examflow.backend.auth.DatabaseAuthService databaseAuth;
    void student(){var user=new UserEntity();user.setId(42L);user.setRole("student");user.setStatus("active");when(users.getCurrentUser(any())).thenReturn(user);}
    @Test void anonymousAndTeacherCannotCheckOrRestoreCamera() throws Exception {
        for(String path:new String[]{"/api/student/sessions/7/camera-check","/api/student/attempts/9/camera-health","/api/student/attempts/9/camera-restore"}){
            mvc.perform(post(path).contentType(MediaType.APPLICATION_JSON).content("{}")) .andExpect(status().isUnauthorized());
            mvc.perform(post(path).contentType(MediaType.APPLICATION_JSON).content("{}").with(jwt().authorities(new SimpleGrantedAuthority("ROLE_TEACHER")))).andExpect(status().isForbidden());
        }
        verifyNoInteractions(students);
    }
    @Test void requirementUsesAuthenticatedStudent() throws Exception {
        student();when(students.cameraRequirements(42L,7L)).thenReturn(Map.of("required",true));
        mvc.perform(get("/api/student/sessions/7/camera-check").with(jwt().authorities(new SimpleGrantedAuthority("ROLE_STUDENT")))).andExpect(status().isOk()).andExpect(jsonPath("$.required").value(true));
        verify(students).cameraRequirements(42L,7L);
    }
    @Test void proofCannotChooseAnotherStudentThroughRequestBody() throws Exception {
        student();when(students.checkCamera(42L,7L,"jpeg")).thenReturn(new CameraVerificationService.Result(true,false,"no_face","Chưa thấy khuôn mặt",null,0));
        mvc.perform(post("/api/student/sessions/7/camera-check").contentType(MediaType.APPLICATION_JSON).content("{\"jpeg\":\"jpeg\",\"studentId\":99}").with(jwt().authorities(new SimpleGrantedAuthority("ROLE_STUDENT")))).andExpect(status().isOk()).andExpect(jsonPath("$.verified").value(false));
        verify(students).checkCamera(42L,7L,"jpeg");
    }
    @Test void anotherAttemptRemainsForbiddenOnRestore() throws Exception {
        student();when(students.restoreCamera(42L,99L,"proof")).thenThrow(new ApiException(HttpStatus.FORBIDDEN,"Không phải lượt thi của bạn"));
        mvc.perform(post("/api/student/attempts/99/camera-restore").contentType(MediaType.APPLICATION_JSON).content("{\"verificationToken\":\"proof\"}").with(jwt().authorities(new SimpleGrantedAuthority("ROLE_STUDENT")))).andExpect(status().isForbidden());
    }
    @Test void cameraCauseIsReportedOnlyForAuthenticatedStudentsOwnAttempt() throws Exception {
        student();when(students.cameraHealth(42L,9L,false,"permission_denied")).thenReturn(new CameraVerificationService.CameraHealth(false,"permission_denied","Quyền camera bị chặn"));
        mvc.perform(post("/api/student/attempts/9/camera-health").contentType(MediaType.APPLICATION_JSON)
            .content("{\"available\":false,\"reason\":\"permission_denied\",\"studentId\":99,\"riskScore\":100}")
            .with(jwt().authorities(new SimpleGrantedAuthority("ROLE_STUDENT"))))
            .andExpect(status().isOk()).andExpect(jsonPath("$.cameraReason").value("permission_denied"));
        verify(students).cameraHealth(42L,9L,false,"permission_denied");
    }
    @Test void deferredGrantAndSubmissionCannotBeUsedAnonymouslyOrByTeacher() throws Exception {
        for(String suffix:new String[]{"offline-grant","offline-submit","offline-evidence","offline-evidence/finish"}){
            mvc.perform(post("/api/student/attempts/9/"+suffix).contentType(MediaType.APPLICATION_JSON).content("{}")) .andExpect(status().isUnauthorized());
            mvc.perform(post("/api/student/attempts/9/"+suffix).contentType(MediaType.APPLICATION_JSON).content("{}").with(jwt().authorities(new SimpleGrantedAuthority("ROLE_TEACHER")))).andExpect(status().isForbidden());
        }
        verifyNoInteractions(students);
    }
    @Test void offlinePhotoUsesAuthenticatedOwnerEvenWhenBodyClaimsAnotherStudent()throws Exception{
        student();String capture=java.util.UUID.randomUUID().toString();
        when(students.uploadOfflineEvidence(eq(42L),eq(9L),any())).thenReturn(new OfflineEvidenceService.Receipt(capture,true));
        mvc.perform(post("/api/student/attempts/9/offline-evidence").contentType(MediaType.APPLICATION_JSON)
            .content("{\"token\":\"token\",\"captureId\":\""+capture+"\",\"capturedAt\":\"2026-10-25T00:00:00Z\",\"sequence\":1,\"jpeg\":\"jpeg\",\"studentId\":99}")
            .with(jwt().authorities(new SimpleGrantedAuthority("ROLE_STUDENT"))))
            .andExpect(status().isOk()).andExpect(jsonPath("$.received").value(true));
        verify(students).uploadOfflineEvidence(eq(42L),eq(9L),argThat(frame->frame.captureId().equals(capture)));
    }
    @Test void deferredGrantUsesAuthenticatedOwnerAndMalformedSnapshotIsRejected() throws Exception {
        student();when(students.offlineGrant(42L,9L)).thenReturn(new OfflineSubmissionService.Grant("token",java.time.Instant.now(),java.time.Instant.now(),true));
        mvc.perform(post("/api/student/attempts/9/offline-grant").with(jwt().authorities(new SimpleGrantedAuthority("ROLE_STUDENT")))).andExpect(status().isOk()).andExpect(jsonPath("$.cameraRequired").value(true));
        verify(students).offlineGrant(42L,9L);
        mvc.perform(post("/api/student/attempts/9/offline-submit").contentType(MediaType.APPLICATION_JSON).content("{\"answers\":[]}")
            .with(jwt().authorities(new SimpleGrantedAuthority("ROLE_STUDENT")))).andExpect(status().isBadRequest());
        verify(students,never()).submitOffline(anyLong(),anyLong(),any());
    }
}
