package com.examflow.backend.service;

import com.examflow.backend.dto.CourseOutline;
import com.examflow.backend.dto.CourseOutline.*;
import com.examflow.backend.entity.UserEntity;
import com.examflow.backend.exception.ApiException;
import org.junit.jupiter.api.*;
import org.springframework.jdbc.core.JdbcTemplate;
import java.text.Normalizer;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class CourseOutlineImportTest {
    final JdbcTemplate db=mock(JdbcTemplate.class);
    final CurrentUserService users=mock(CurrentUserService.class);
    final TeacherCourseService courses=mock(TeacherCourseService.class);
    final TeacherCourseContentService content=mock(TeacherCourseContentService.class);
    final CourseOutlineImportService service=new CourseOutlineImportService(db,users,courses,content);
    static CourseOutline draft() {
        return new CourseOutline(new Metadata("0101101973","Quản trị hệ thống mạng",3,""),
            List.of(new Chapter("Chương 1","Cơ bản",List.of(new Topic("1.1","DNS")))),
            List.of(new Clo("CLO1.1*","Giải thích hệ thống.")),List.of());
    }
    @BeforeEach void setup() {
        var user=new UserEntity();user.setId(35L);user.setRole("teacher");when(users.getCurrentUser(null)).thenReturn(user);
        when(db.queryForList(anyString(),any(Object[].class))).thenReturn(List.of());
    }
    @Test void previewDoesNotCreateAnything() {
        var plan=service.preview(null,draft());assertFalse(plan.existing());assertEquals(new Counts(1,1,1),plan.created());
        verifyNoInteractions(courses,content);verify(db,never()).update(anyString(),any(Object[].class));
    }
    @Test void courseOfAnotherTeacherCannotBeImported() {
        when(db.queryForList(startsWith("SELECT id,code,name,credits,created_by"),any(Object[].class)))
            .thenReturn(List.of(Map.of("id",11L,"created_by",99L,"name","Hidden","credits",3,"code","0101101973")));
        var plan=service.preview(null,draft());assertFalse(plan.conflicts().isEmpty());assertNull(plan.courseId());
        verifyNoInteractions(content,courses);
    }
    @Test void metadataIsComparedWithoutCaseOrUnicodeFormattingButCreditsMustMatch() {
        assertEquals(CourseOutlineImportService.key(draft().course().name()),CourseOutlineImportService.key(Normalizer.normalize(" QUẢN TRỊ   HỆ THỐNG MẠNG ",Normalizer.Form.NFD)));
        assertNotEquals(CourseOutlineImportService.codeKey("0101101973"),CourseOutlineImportService.codeKey("101101973"));
        assertNotEquals(CourseOutlineImportService.codeKey("CLO1.1*"),CourseOutlineImportService.codeKey("CLO1.1"));
        when(db.queryForList(startsWith("SELECT id,code,name,credits,created_by"),any(Object[].class)))
            .thenReturn(List.of(Map.of("id",11L,"created_by",35L,"name","Quản Trị Hệ Thống Mạng","credits",4,"code","0101101973")));
        assertTrue(service.preview(null,draft()).conflicts().get(0).contains("số tín chỉ"));
    }
    @Test void exactExistingItemsAreSkippedAndConflictingContentIsBlocked() {
        when(db.queryForList(startsWith("SELECT id,code,name,credits,created_by"),any(Object[].class)))
            .thenReturn(List.of(Map.of("id",11L,"created_by",35L,"name","Quản Trị Hệ Thống Mạng","credits",3,"code","0101101973")));
        when(db.queryForList(startsWith("SELECT id,code,name FROM chapters"),any(Object[].class))).thenReturn(List.of(Map.of("id",1L,"code","Chương 1","name","Cơ bản")));
        when(db.queryForList(startsWith("SELECT id,chapter_id,code,name FROM topics"),any(Object[].class))).thenReturn(List.of(Map.of("id",2L,"chapter_id",1L,"code","1.1","name","DNS")));
        when(db.queryForList(startsWith("SELECT id,code,description FROM clos"),any(Object[].class))).thenReturn(List.of(Map.of("id",3L,"code","CLO1.1*","description","Giải thích hệ thống.")));
        var plan=service.preview(null,draft());assertEquals(new Counts(0,0,0),plan.created());assertEquals(new Counts(1,1,1),plan.skipped());assertTrue(plan.conflicts().isEmpty());
        when(db.queryForList(startsWith("SELECT id,code,description FROM clos"),any(Object[].class))).thenReturn(List.of(Map.of("id",3L,"code","CLO1.1*","description","Khác nội dung.")));
        assertFalse(service.preview(null,draft()).conflicts().isEmpty());
    }
    @Test void duplicateCodesAndNamesInsideDraftAreRejected() {
        var d=draft();
        for(var bad:List.of(
            new CourseOutline(d.course(),List.of(d.chapters().get(0),d.chapters().get(0)),d.clos(),List.of()),
            new CourseOutline(d.course(),List.of(new Chapter("1","Cơ bản",List.of(new Topic("1.1","DNS"),new Topic("1. 1","DHCP")))),d.clos(),List.of()),
            new CourseOutline(d.course(),d.chapters(),List.of(d.clos().get(0),d.clos().get(0)),List.of()))) {
            assertThrows(ApiException.class,()->CourseOutlineImportService.validate(bad));
        }
    }
    @Test void studentCannotPreviewOrWrite() {
        var user=new UserEntity();user.setId(9L);user.setRole("student");when(users.getCurrentUser(null)).thenReturn(user);
        assertThrows(ApiException.class,()->service.preview(null,draft()));verifyNoInteractions(db,courses,content);
    }
    @Test void confirmationMethodRequiresTransactionRollback()throws Exception {
        var tx=CourseOutlineImportService.class.getMethod("confirm",org.springframework.security.oauth2.jwt.Jwt.class,Confirmation.class)
            .getAnnotation(org.springframework.transaction.annotation.Transactional.class);
        assertTrue(Arrays.asList(tx.rollbackFor()).contains(Exception.class));
    }
    static CourseOutline nestedDraft() {
        var codes=List.of("2.1","2.1.1","2.1.2","2.2","2.2.1","2.1.1.1");
        return new CourseOutline(draft().course(),List.of(new Chapter("Chương 2","Hệ thống",codes.stream().map(code->new Topic(code,"Tên "+code)).toList())),draft().clos(),List.of());
    }
    @Test void nestedTopicsAreFlatAndRerunSkipsAllSixWithoutCreatingDuplicates() {
        var nested=nestedDraft();
        when(courses.createCourse(isNull(),any())).thenReturn(new com.examflow.backend.dto.TeacherCourseDto(11L,"0101101973","Quản trị hệ thống mạng",(short)3,"",0,0,0));
        when(content.createChapter(eq(11L),any(),isNull())).thenReturn(new com.examflow.backend.dto.CourseChapterDto(22L,11L,1,"Chương 2","Hệ thống",List.of()));
        var first=service.confirm(null,new Confirmation(nested,false));assertEquals(new Counts(1,6,1),first.created());
        when(db.queryForList(startsWith("SELECT id,code,name,credits,created_by"),any(Object[].class)))
            .thenReturn(List.of(Map.of("id",11L,"created_by",35L,"name",nested.course().name(),"credits",3,"code",nested.course().code())));
        when(db.queryForList(startsWith("SELECT id,code,name FROM chapters"),any(Object[].class))).thenReturn(List.of(Map.of("id",22L,"code","Chương 2","name","Hệ thống")));
        var rows=nested.chapters().get(0).topics().stream().map(topic->Map.<String,Object>of("id",1L,"chapter_id",22L,"code",topic.code(),"name",topic.name())).toList();
        when(db.queryForList(startsWith("SELECT id,chapter_id,code,name FROM topics"),any(Object[].class))).thenReturn(rows);
        when(db.queryForList(startsWith("SELECT id,code,description FROM clos"),any(Object[].class))).thenReturn(List.of(Map.of("id",3L,"code","CLO1.1*","description","Giải thích hệ thống.")));
        var second=service.confirm(null,new Confirmation(nested,true));assertEquals(new Counts(0,0,0),second.created());assertEquals(new Counts(1,6,1),second.skipped());
        verify(content,times(6)).createTopic(eq(11L),eq(22L),any(),isNull());
        for(var topic:nested.chapters().get(0).topics())verify(content).createTopic(eq(11L),eq(22L),eq(new com.examflow.backend.dto.CreateTopicRequest(topic.code(),topic.name())),isNull());
        verify(courses,times(1)).createCourse(isNull(),any());
    }
    @Test void malformedMissingOrDuplicateParentCodesAreRejectedBeforeAnyWrites() {
        for(var codes:List.of(List.of("2.1","2.10.1"),List.of("2.1","2.1.1.1"),List.of("2..1"),List.of("2.1","2. 1"),List.of("3.1"))) {
            var d=new CourseOutline(draft().course(),List.of(new Chapter("Chương 2","Hệ thống",codes.stream().map(code->new Topic(code,"Tên "+code)).toList())),draft().clos(),List.of());
            assertThrows(ApiException.class,()->service.confirm(null,new Confirmation(d,false)));
        }
        verifyNoInteractions(content,courses,db);
    }
    @Test void equalTitlesInDifferentNumberedBranchesDoNotInventDuplicates() {
        var d=new CourseOutline(draft().course(),List.of(new Chapter("Chương 2","Hệ thống",List.of(new Topic("2.1","Tổng quan"),new Topic("2.1.1","Tổng quan")))),draft().clos(),List.of());
        assertDoesNotThrow(()->CourseOutlineImportService.validate(d));
        assertEquals(2,service.preview(null,d).created().topics());
    }
}
