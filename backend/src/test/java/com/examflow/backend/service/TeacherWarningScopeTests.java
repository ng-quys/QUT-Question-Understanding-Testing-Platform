package com.examflow.backend.service;

import com.examflow.backend.entity.*;
import com.examflow.backend.exception.ApiException;
import jakarta.persistence.*;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.test.util.ReflectionTestUtils;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class TeacherWarningScopeTests {
    final EntityManager em=mock(EntityManager.class);
    final AdminWorkspaceService workspace=mock(AdminWorkspaceService.class);
    final ExamOrganizationService organization=new ExamOrganizationService(mock(AdminService.class),workspace);
    final Query query=mock(Query.class,RETURNS_SELF);
    TeacherWarningScopeTests(){ReflectionTestUtils.setField(organization,"em",em);when(em.createNativeQuery(anyString())).thenReturn(query);when(query.getResultList()).thenReturn(List.of());}
    UserEntity teacher(){var user=new UserEntity();user.setId(42L);user.setRole("teacher");user.setStatus("active");return user;}
    @Test void countAndRowsApplySameAssignmentPublicationAndActiveWarningScope(){
        when(query.getSingleResult()).thenReturn(0L);
        var result=organization.warningSessions(teacher(),false,"",0,20);
        assertEquals(0,result.total());
        var sql=org.mockito.ArgumentCaptor.forClass(String.class);
        verify(em,times(2)).createNativeQuery(sql.capture());
        for(String statement:sql.getAllValues()){
            assertTrue(statement.contains("assigned.teacher_id=:actor"));
            assertTrue(statement.contains("NOT EXISTS(SELECT 1 FROM exam_sitting_groups assigned"));
            assertTrue(statement.contains("s.published_at IS NOT NULL"));
            assertTrue(statement.contains("wv.active=TRUE"));
            assertFalse(statement.contains("e.created_by=:actor"));
        }
        verify(query,times(2)).setParameter("actor",42L);
    }
    @Test void unassignedTeacherIsRejectedBeforeReadingRosterEvenIfCourseOwner(){
        when(query.getSingleResult()).thenReturn(0L);
        var failure=assertThrows(ApiException.class,()->organization.monitoringDetail(teacher(),99L));
        assertEquals(HttpStatus.FORBIDDEN,failure.getStatus());
        verifyNoInteractions(workspace);
    }
    @Test void studentsAndDisabledTeachersCannotQueryWarningData(){
        var user=teacher();user.setRole("student");
        assertThrows(ApiException.class,()->organization.warningSessions(user,false,"",0,20));
        user.setRole("teacher");user.setStatus("inactive");
        assertThrows(ApiException.class,()->organization.warningSessions(user,false,"",0,20));
        verifyNoInteractions(em);
    }
    @Test void invalidPaginationIsRejectedBeforeDatabaseAccess(){
        assertThrows(ApiException.class,()->organization.warningSessions(teacher(),false,"",-1,20));
        assertThrows(ApiException.class,()->organization.warningSessions(teacher(),false,"",Integer.MAX_VALUE,100));
        verifyNoInteractions(em);
    }
    @Test void evidenceAccessUsesSessionAssignmentAndRejectsAnUnassignedCourseOwner(){
        var users=mock(com.examflow.backend.repository.UserRepository.class);
        var attempts=mock(com.examflow.backend.repository.ExamAttemptRepository.class);
        var access=new EvidenceAccessService(users,attempts,mock(AdminIdentityService.class));
        ReflectionTestUtils.setField(access,"em",em);
        var user=teacher();when(users.findById(42L)).thenReturn(Optional.of(user));
        var session=new ExamSession();session.setId(9L);
        var course=new Course();course.setCreatedBy(42L);
        var exam=new Exam();exam.setCreatedBy(42L);exam.setCourse(course);
        var attempt=new ExamAttempt();attempt.setExamSession(session);attempt.setExam(exam);
        when(attempts.findById(125L)).thenReturn(Optional.of(attempt));
        var jwt=org.springframework.security.oauth2.jwt.Jwt.withTokenValue("synthetic").header("alg","none").subject("test").claim("local_user_id",42L).claim("realm_access",Map.of("roles",List.of("TEACHER"))).build();
        when(query.getSingleResult()).thenReturn(0L);
        assertEquals(HttpStatus.FORBIDDEN,assertThrows(ApiException.class,()->access.require(jwt,125L)).getStatus());
        when(query.getSingleResult()).thenReturn(1L);
        assertSame(attempt,access.require(jwt,125L));
        verify(query,times(2)).setParameter("actor",42L);
    }
}
