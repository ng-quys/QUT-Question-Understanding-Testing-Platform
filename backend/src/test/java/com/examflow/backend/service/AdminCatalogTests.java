package com.examflow.backend.service;

import com.examflow.backend.dto.*;
import com.examflow.backend.entity.*;
import com.examflow.backend.exception.ApiException;
import jakarta.persistence.*;
import org.junit.jupiter.api.*;
import org.springframework.http.HttpStatus;
import org.springframework.test.util.ReflectionTestUtils;
import java.math.BigDecimal;
import java.time.*;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class AdminCatalogTests {
    final EntityManager em=mock(EntityManager.class);
    final AdminService audit=mock(AdminService.class);
    final TeacherExamService builder=mock(TeacherExamService.class);
    final AdminCatalogService service=new AdminCatalogService(audit,builder);
    final Map<String,Long> counts=new LinkedHashMap<>();
    final List<String> statements=new ArrayList<>();
    final Course course=new Course(); final Exam exam=new Exam(); final ExamSession session=new ExamSession();
    final UserEntity teacher=new UserEntity();
    List<Object[]> references=List.of();
    @BeforeEach void setup() {
        ReflectionTestUtils.setField(service,"em",em);
        course.setId(10L);course.setCode("WEB");course.setName("Web");course.setStatus("active");course.setCreatedBy(6L);
        exam.setId(20L);exam.setCourse(course);exam.setCode("WEB-DRAFT");exam.setTitle("Web draft");exam.setStatus("draft");
        session.setId(30L);session.setExam(exam);session.setName("Ca thử");session.setRoomCode("WEB-2030");session.setStatus("scheduled");session.setStartTime(now().plusDays(1));session.setEndTime(now().plusDays(1).plusHours(2));
        teacher.setId(6L);teacher.setRole("teacher");teacher.setStatus("active");
        when(em.find(Course.class,10L)).thenReturn(course);when(em.find(Course.class,10L,LockModeType.PESSIMISTIC_WRITE)).thenReturn(course);
        when(em.find(Exam.class,20L)).thenReturn(exam);when(em.find(Exam.class,20L,LockModeType.PESSIMISTIC_WRITE)).thenReturn(exam);
        when(em.find(ExamSession.class,30L)).thenReturn(session);when(em.find(ExamSession.class,30L,LockModeType.PESSIMISTIC_WRITE)).thenReturn(session);
        when(em.find(UserEntity.class,6L)).thenReturn(teacher);
        @SuppressWarnings("unchecked") TypedQuery<ExamSession> schedule=mock(TypedQuery.class);
        when(em.createQuery(anyString(),eq(ExamSession.class))).thenReturn(schedule);
        when(schedule.setParameter(anyString(),any())).thenReturn(schedule);
        when(schedule.getResultList()).thenReturn(List.of(session));
        when(em.createNativeQuery(anyString())).thenAnswer(call->{
            String sql=call.getArgument(0);statements.add(sql);Query query=mock(Query.class);
            when(query.setParameter(anyString(),any())).thenReturn(query);
            when(query.getSingleResult()).thenAnswer(v->counts.entrySet().stream().filter(e->sql.contains(e.getKey())).map(Map.Entry::getValue).findFirst().orElse(0L));
            when(query.getResultList()).thenAnswer(v->sql.contains("pg_constraint")?references:List.of());
            return query;
        });
        doAnswer(call->{Object row=call.getArgument(0);if(row instanceof Course c){c.setId(10L);when(em.find(Course.class,10L)).thenReturn(c);}if(row instanceof ExamSession s){s.setId(30L);when(em.find(ExamSession.class,30L)).thenReturn(s);}return null;}).when(em).persist(any());
    }
    static LocalDateTime now(){return LocalDateTime.now(ZoneId.of("Asia/Ho_Chi_Minh"));}
    @Test void courseWithExternalBankQuestionsCannotBeDeletedEvenWhenMainHasNoQuestions(){
        var bank=mock(QuestionBankStatsService.class);ReflectionTestUtils.setField(service,"bankStats",bank);
        when(bank.countByCourse(10L)).thenReturn(3L);
        assertThrows(ApiException.class,()->service.delete(1L,"courses",10L));
        verify(em,never()).remove(any());
    }
    AdminCatalogService.CourseInput courseInput(){return new AdminCatalogService.CourseInput("web","Web",3,"CNTT","Description",6L,"active");}
    AdminCatalogService.SessionInput sessionInput(){return new AdminCatalogService.SessionInput(20L,"Ca mới","web-new",null,now().plusDays(2),now().plusDays(2).plusHours(2));}
    @Test void createCourseAssignsRealTeacherAndAudits() {
        var result=service.course(1L,null,courseInput());assertEquals("WEB",result.get("code"));assertEquals(6L,result.get("teacherId"));
        verify(em).persist(any(Course.class));verify(audit).audit(eq(1L),eq("CREATE_COURSE"),eq("COURSE"),eq(10L),anyString());
    }
    @Test void inactiveOrNonTeacherCannotOwnCourse() {
        teacher.setStatus("locked");assertThrows(ApiException.class,()->service.course(1L,null,courseInput()));
        teacher.setStatus("active");teacher.setRole("student");assertThrows(ApiException.class,()->service.course(1L,null,courseInput()));verify(em,never()).persist(any());
    }
    @Test void duplicateCodeAndCourseActivityBlockMutation() {
        counts.put("LOWER(code)",1L);assertEquals(HttpStatus.CONFLICT,assertThrows(ApiException.class,()->service.course(1L,null,courseInput())).getStatus());
        counts.clear();counts.put("JOIN exams e",1L);assertThrows(ApiException.class,()->service.course(1L,10L,courseInput()));verify(em,never()).flush();
    }
    @Test void usedCourseIsNeverCascadeDeleted() {
        counts.put("FROM questions WHERE",1L);assertThrows(ApiException.class,()->service.delete(1L,"courses",10L));verify(em,never()).remove(any());
    }
    @Test void unexpectedChildReferencesAlsoPreventCascadeDelete() {
        references=Collections.singletonList(new Object[]{"public","course_enrolments","course_id"});counts.put("course_enrolments",1L);
        assertThrows(ApiException.class,()->service.delete(1L,"courses",10L));verify(em,never()).remove(any());
    }
    @Test void unusedCourseCanBeDeletedWithAudit() {
        service.delete(1L,"courses",10L);verify(em).remove(course);verify(audit).audit(eq(1L),eq("DELETE_COURSE"),eq("COURSE"),eq(10L),anyString());
    }
    @Test void examWithSessionOrAttemptCannotBeEditedOrDeleted() {
        counts.put("FROM exam_sessions WHERE",1L);
        assertThrows(ApiException.class,()->service.exam(1L,20L,new AdminCatalogService.ExamInput("NEW","New",true,true)));
        assertThrows(ApiException.class,()->service.delete(1L,"exams",20L));verify(em,never()).remove(any());
    }
    @Test void draftExamEditPreservesQuestionsAndPoints() {
        exam.setTotalQuestions(20);exam.setTotalPoints(BigDecimal.TEN);
        service.exam(1L,20L,new AdminCatalogService.ExamInput("new","New title",false,true));
        assertEquals("NEW",exam.getCode());assertEquals(20,exam.getTotalQuestions());assertEquals(BigDecimal.TEN,exam.getTotalPoints());
        assertTrue(statements.stream().noneMatch(s->s.startsWith("DELETE")));verify(em).find(Exam.class,20L,LockModeType.PESSIMISTIC_WRITE);
    }
    @Test void deletingUnusedDraftRemovesOnlyExamLinksNotBankQuestions() {
        service.delete(1L,"exams",20L);verify(em).remove(exam);
        assertTrue(statements.contains("DELETE FROM exam_questions WHERE exam_id=:id"));
        assertTrue(statements.stream().noneMatch(s->s.startsWith("DELETE FROM questions")));
    }
    @Test void createSessionUsesOneCodeInBothLegacyColumns() {
        counts.put("FROM exam_questions WHERE",1L);
        var result=service.session(1L,null,sessionInput());assertEquals("WEB-NEW",result.get("code"));
        var capture=org.mockito.ArgumentCaptor.forClass(ExamSession.class);verify(em).persist(capture.capture());
        assertEquals(capture.getValue().getRoomCode(),capture.getValue().getAccessCode());assertEquals("scheduled",capture.getValue().getStatus());
    }
    @Test void invalidTimeOrMissingQuestionsCannotCreateSession() {
        assertThrows(ApiException.class,()->service.session(1L,null,sessionInput()));
        counts.put("FROM exam_questions WHERE",1L);
        assertThrows(ApiException.class,()->service.session(1L,null,new AdminCatalogService.SessionInput(20L,"Ca","ABC",null,now().plusDays(1),now())));
        verify(em,never()).persist(any());
    }
    @Test void sessionWithAttemptCannotBeEditedOrDeleted() {
        counts.put("FROM exam_questions WHERE",1L);counts.put("FROM exam_attempts WHERE",1L);
        assertThrows(ApiException.class,()->service.session(1L,30L,sessionInput()));assertThrows(ApiException.class,()->service.delete(1L,"sessions",30L));
        verify(em,never()).remove(any());verify(em,never()).flush();
    }
    @Test void sessionWithRegistrationsCannotBeDeleted() {
        counts.put("FROM exam_session_students WHERE",1L);assertThrows(ApiException.class,()->service.delete(1L,"sessions",30L));verify(em,never()).remove(any());
    }
    @Test void emptyFutureSessionCanBeEditedAndDeleted() {
        counts.put("FROM exam_questions WHERE",1L);service.session(1L,30L,sessionInput());assertEquals("WEB-NEW",session.getRoomCode());
        service.delete(1L,"sessions",30L);verify(em).remove(session);
    }
    @Test void startedSessionCannotBeEditedOrDeletedEvenWithNoAttempts() {
        counts.put("FROM exam_questions WHERE",1L);session.setStartTime(now().minusMinutes(1));
        assertThrows(ApiException.class,()->service.session(1L,30L,sessionInput()));assertThrows(ApiException.class,()->service.delete(1L,"sessions",30L));
    }
    @Test void arbitraryResourceCannotBeDeleted() {assertThrows(ApiException.class,()->service.delete(1L,"users",26L));verify(em,never()).remove(any());}
    @Test void adminQuickExamCreatesActualQuestionsAndPersistsAiPolicy() {
        var summary=new ExamSummaryDto(20L,"WEB-NEW","New",10L,"WEB","Web",20,"draft",null,true,true,false);
        when(builder.createQuick(any(),eq(1L))).thenReturn(new QuickExamResult(summary,10,6,4,20,0,List.of(1L,2L),List.of()));
        var input=new QuickExamRequest(10L,"New","web-new",20,50,30,20,100,List.of(),true,true,false);
        service.createExam(1L,input);verify(builder).createQuick(argThat(r->r.code().equals("WEB-NEW")&&!r.antiCheatMode()),eq(1L));
        assertTrue(statements.stream().anyMatch(s->s.startsWith("INSERT INTO exam_ai_policies")));
        verify(audit).audit(eq(1L),eq("CREATE_EXAM"),eq("EXAM"),eq(20L),anyString());
    }
}
