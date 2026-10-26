package com.examflow.backend.service;

import com.examflow.backend.controller.TeacherExamSessionController;
import com.examflow.backend.dto.*;
import com.examflow.backend.entity.UserEntity;
import com.examflow.backend.exception.ApiException;
import org.junit.jupiter.api.*;
import org.springframework.http.HttpStatus;
import org.springframework.security.oauth2.jwt.Jwt;
import java.time.LocalDateTime;
import java.util.List;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class TeacherSessionCompatibilityTests {
    final ExamOrganizationService organization=mock(ExamOrganizationService.class);
    final CurrentUserService users=mock(CurrentUserService.class);
    final TeacherExamSessionService service=mock(TeacherExamSessionService.class);
    final AdminWorkspaceService workspace=mock(AdminWorkspaceService.class);
    final TeacherExamSessionController controller=new TeacherExamSessionController(organization,users,service,workspace);
    final Jwt jwt=Jwt.withTokenValue("test").header("alg","none").subject("teacher-test").build();
    final LocalDateTime start=LocalDateTime.of(2030,1,1,9,0);
    TeacherExamSessionDto row(long id,long exam){return new TeacherExamSessionDto(id,exam,"E","Exam","C","Course","Session","CODE","CODE",start,start.plusHours(1),"scheduled",0,0,0);}
    @BeforeEach void setup(){var teacher=new UserEntity();teacher.setId(10L);teacher.setRole("teacher");when(users.getCurrentUser(jwt)).thenReturn(teacher);}
    @Test void listReturnsOriginalArrayShapeWithCodesAndCounts(){var row=row(1,20);when(service.list()).thenReturn(List.of(row));var result=controller.list(jwt);assertEquals(List.of(row),result);assertEquals("CODE",result.get(0).roomCode());verify(organization).requireExamCourse(any(),eq(20L));verify(organization,never()).sessions(any(),anyBoolean(),anyString(),anyInt(),anyInt());}
    @Test void createUsesOriginalRequestWithoutRoomAssignmentOrPublish(){var input=new CreateExamSessionRequest(20L,"Session","CODE","CODE",start,start.plusHours(1),List.of());var row=row(1,20);when(service.create(input)).thenReturn(row);assertSame(row,controller.create(jwt,input));verify(organization).requireExamCourse(any(),eq(20L));verify(organization,never()).requireRoom(any(),anyLong());verify(organization,never()).publish(any(),anyLong());}
    @Test void unauthorizedCourseIsRejectedBeforeCreating(){doThrow(new ApiException(HttpStatus.FORBIDDEN,"test")).when(organization).requireExamCourse(any(),eq(99L));assertThrows(ApiException.class,()->controller.create(jwt,new CreateExamSessionRequest(99L,"S",null,null,start,start.plusHours(1),List.of())));verifyNoInteractions(service);}
    @Test void statusKeepsOriginalResponseWhilePreservingHistoryGuards(){var row=row(1,20);when(service.list()).thenReturn(List.of(row));assertSame(row,controller.status(jwt,1,"cancelled"));verify(workspace).updateSessionStatus(10L,1L,"cancelled");verify(service,never()).setStatus(anyLong(),anyString());}
}
