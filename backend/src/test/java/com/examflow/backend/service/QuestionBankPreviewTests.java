package com.examflow.backend.service;

import com.examflow.backend.exception.ApiException;
import org.junit.jupiter.api.*;
import org.springframework.jdbc.core.*;
import org.springframework.test.util.ReflectionTestUtils;
import javax.sql.DataSource;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class QuestionBankPreviewTests {
    final JdbcTemplate main=mock(JdbcTemplate.class),bank=mock(JdbcTemplate.class);
    final TeacherQuestionBankService service=new TeacherQuestionBankService(main,mock(DataSource.class),mock(CurrentUserService.class));
    final TeacherQuestionBankService.PreviewFilter empty=new TeacherQuestionBankService.PreviewFilter("","","","","","");
    @BeforeEach void setup(){
        ReflectionTestUtils.setField(service,"bank",bank);
        when(bank.queryForObject(anyString(),eq(Long.class),any(Object[].class))).thenReturn(42L);
        when(bank.query(anyString(),any(RowMapper.class),any(Object[].class))).thenReturn(List.of());
        when(main.query(anyString(),any(RowMapper.class),any(Object[].class))).thenReturn(List.of());
    }
    @Test void combinesAllFiltersAndPaginatesWithoutLoadingWholeBank(){
        var filter=new TeacherQuestionBankService.PreviewFilter("#123","1","2","3","4","pending");
        var result=service.preview(9,filter,2,20);
        assertEquals(42,result.total());assertEquals(42,result.bankTotal());assertEquals(2,result.page());
        verify(bank).query(eq("select * from questions where course_id=? and (cast(id as text)=? or lower(content) like ? escape '!') and difficulty_level_id=? and chapter_id=? and topic_id=? and clo_id=? and status=? order by id desc limit ? offset ?"),any(RowMapper.class),
            eq(9L),eq("123"),eq("%#123%"),eq(1L),eq(2L),eq(3L),eq(4L),eq("pending"),eq(20),eq(40L));
    }
    @Test void searchTreatsSqlWildcardCharactersLiterallyAndNeverInterpolatesInput(){
        service.preview(9,new TeacherQuestionBankService.PreviewFilter("50%_! ' OR 1=1","","","","",""),0,20);
        verify(bank).query(contains("course_id=?"),any(RowMapper.class),eq(9L),eq("50%_! ' OR 1=1"),eq("%50!%!_!! ' or 1=1%"),eq(20),eq(0L));
    }
    @Test void unclassifiedGroupsUseNullAndClearingFiltersKeepsCourseScope(){
        service.preview(9,new TeacherQuestionBankService.PreviewFilter("","","none","none","none",""),0,20);
        verify(bank).query(eq("select * from questions where course_id=? and chapter_id is null and topic_id is null and clo_id is null order by id desc limit ? offset ?"),any(RowMapper.class),eq(9L),eq(20),eq(0L));
        service.preview(10,empty,0,20);
        verify(bank).query(eq("select * from questions where course_id=? order by id desc limit ? offset ?"),any(RowMapper.class),eq(10L),eq(20),eq(0L));
    }
    @Test void rejectsInvalidFiltersAndPageSizes(){
        for(int[] values:List.of(new int[]{-1,20},new int[]{0,0},new int[]{0,51}))assertThrows(ApiException.class,()->service.preview(9,empty,values[0],values[1]));
        assertThrows(ApiException.class,()->service.preview(9,new TeacherQuestionBankService.PreviewFilter("","1 OR 1=1","","","",""),0,20));
        assertThrows(ApiException.class,()->service.preview(9,new TeacherQuestionBankService.PreviewFilter("","","","","","deleted"),0,20));
        verifyNoInteractions(bank);
    }
    @Test void previewControllerRequiresCourseAccessBeforeReadingBank(){
        var users=mock(CurrentUserService.class);var automatic=mock(AutomaticExamService.class);
        var controller=new com.examflow.backend.controller.TeacherQuestionBankController(service,mock(AiCreditsService.class),users);
        ReflectionTestUtils.setField(controller,"automatic",automatic);
        var teacher=new com.examflow.backend.entity.UserEntity();teacher.setId(7L);teacher.setRole("teacher");
        when(users.getCurrentUser(null)).thenReturn(teacher);
        doThrow(new ApiException(org.springframework.http.HttpStatus.FORBIDDEN,"Chưa được phân công")).when(automatic).requireCourse(teacher,99);
        assertThrows(ApiException.class,()->controller.preview(99,"","","","","","",0,20,null));
        verifyNoInteractions(bank);
        controller.preview(9,"","","","","","",0,20,null);
        verify(automatic).requireCourse(teacher,9);
        verify(bank,atLeastOnce()).queryForObject("select count(*) from questions where course_id=?",Long.class,9L);
    }
    @Test void studentCannotUsePreviewEvenWithCourseId(){
        var users=mock(CurrentUserService.class);var automatic=mock(AutomaticExamService.class);
        var controller=new com.examflow.backend.controller.TeacherQuestionBankController(service,mock(AiCreditsService.class),users);
        ReflectionTestUtils.setField(controller,"automatic",automatic);
        var student=new com.examflow.backend.entity.UserEntity();student.setRole("student");when(users.getCurrentUser(null)).thenReturn(student);
        assertThrows(org.springframework.web.server.ResponseStatusException.class,()->controller.preview(9,"","","","","","",0,20,null));
        verifyNoInteractions(bank,automatic);
    }
}
