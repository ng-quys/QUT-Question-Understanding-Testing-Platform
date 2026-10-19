package com.examflow.backend.service;

import com.examflow.backend.entity.*;
import com.examflow.backend.exception.ApiException;
import com.examflow.backend.repository.*;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.security.oauth2.jwt.Jwt;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class EvidenceAccessTests {
    final UserRepository users=mock(UserRepository.class);
    final ExamAttemptRepository attempts=mock(ExamAttemptRepository.class);
    final AdminIdentityService admins=mock(AdminIdentityService.class);
    final EvidenceAccessService service=new EvidenceAccessService(users,attempts,admins);
    final ExamAttempt attempt=new ExamAttempt();
    final UserEntity teacher=new UserEntity();
    static Jwt jwt(String role) { return Jwt.withTokenValue("test").header("alg","none").subject("subject-test").claim("realm_access",Map.of("roles",List.of(role))).build(); }
    @BeforeEach void prepare() {
        Course course=new Course(); course.setCreatedBy(42L);
        Exam exam=new Exam(); exam.setCourse(course); attempt.setExam(exam);
        when(attempts.findById(125L)).thenReturn(Optional.of(attempt));
        teacher.setId(42L); teacher.setRole("teacher"); teacher.setStatus("active");
        when(users.findByKeycloakUserId("subject-test")).thenReturn(Optional.of(teacher));
    }
    @Test void owningTeacherCanRead() { assertSame(attempt,service.require(jwt("TEACHER"),125L)); }
    @Test void adminCanReadOutsideCourseScope() {
        UserEntity admin=new UserEntity(); admin.setId(99L); admin.setRole("admin");
        when(admins.requireAdmin(any())).thenReturn(admin);
        assertSame(attempt,service.require(jwt("ADMIN"),125L));
    }
    @Test void otherTeacherCannotReadEvenKnowingAttemptId() {
        teacher.setId(43L);
        assertEquals(HttpStatus.FORBIDDEN,assertThrows(ApiException.class,()->service.require(jwt("TEACHER"),125L)).getStatus());
    }
    @Test void studentCannotReadEvenIfDatabaseCourseOwner() {
        assertEquals(HttpStatus.FORBIDDEN,assertThrows(ApiException.class,()->service.require(jwt("STUDENT"),125L)).getStatus());
        verifyNoInteractions(attempts);
    }
    @Test void courseOwnerRetainsOriginalEvidenceAccessWithoutRoomAssignment() {
        ExamSession session=new ExamSession();session.setRoomId(7L);attempt.setExamSession(session);
        attempt.getExam().setCreatedBy(99L);
        assertSame(attempt,service.require(jwt("TEACHER"),125L));
    }
    @Test void disabledTeacherCannotRead() {
        teacher.setStatus("inactive");
        assertThrows(ApiException.class,()->service.require(jwt("TEACHER"),125L));
    }
    @Test void unlinkedIdentityCannotUseEmailFallback() {
        when(users.findByKeycloakUserId(any())).thenReturn(Optional.empty());
        assertThrows(ApiException.class,()->service.require(jwt("TEACHER"),125L));
        verify(users,never()).findByEmailIgnoreCase(any());
    }
}
