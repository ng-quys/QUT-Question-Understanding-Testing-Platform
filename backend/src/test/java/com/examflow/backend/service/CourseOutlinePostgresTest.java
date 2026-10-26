package com.examflow.backend.service;

import com.examflow.backend.dto.CourseOutline.*;
import com.examflow.backend.entity.Course;
import com.examflow.backend.entity.UserEntity;
import com.examflow.backend.repository.*;
import jakarta.persistence.EntityManager;
import org.hibernate.SessionFactory;
import org.hibernate.cfg.Configuration;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.data.jpa.repository.support.JpaRepositoryFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.orm.jpa.JpaTransactionManager;
import org.springframework.orm.jpa.SharedEntityManagerCreator;
import org.springframework.transaction.support.TransactionTemplate;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

/** Opt-in loopback fixture only, with its own schema. Never loads application properties. */
@EnabledIfEnvironmentVariable(named="OUTLINE_PG_FIXTURE",matches="true")
class CourseOutlinePostgresTest {
    static final String URL="jdbc:postgresql://127.0.0.1:55439/examflow_worker_test";
    static DriverManagerDataSource source;
    static JdbcTemplate db;
    static SessionFactory factory;
    static EntityManager em;
    static TransactionTemplate tx;
    TeacherCourseContentService content;
    CourseOutlineImportService service;
    @BeforeAll static void fixture() {
        source=new DriverManagerDataSource(URL,"examflow_test_owner","");
        var root=new JdbcTemplate(source);root.execute("CREATE SCHEMA IF NOT EXISTS outline_import_fixture");
        Properties props=new Properties();props.setProperty("currentSchema","outline_import_fixture");source.setConnectionProperties(props);
        db=new JdbcTemplate(source);
        db.execute("CREATE TABLE IF NOT EXISTS courses(id bigint generated always as identity primary key,code varchar(80) unique,name varchar(255),description text,credits smallint,department varchar(255),status varchar(30),created_by bigint)");
        db.execute("CREATE TABLE IF NOT EXISTS chapters(id bigint generated always as identity primary key,course_id bigint references courses(id),code varchar(80),name varchar(255),chapter_order int)");
        db.execute("CREATE TABLE IF NOT EXISTS topics(id bigint generated always as identity primary key,course_id bigint references courses(id),chapter_id bigint references chapters(id),code varchar(80),name varchar(255),topic_order int)");
        db.execute("CREATE TABLE IF NOT EXISTS clos(id bigint generated always as identity primary key,course_id bigint references courses(id),code varchar(80),name varchar(80),description text,default_bloom varchar(30),status varchar(30),notes text,clo_order int)");
        Configuration cfg=new Configuration().addAnnotatedClass(Course.class);
        cfg.getProperties().put("hibernate.connection.datasource",source);
        factory=cfg.buildSessionFactory();em=SharedEntityManagerCreator.createSharedEntityManager(factory);
        var manager=new JpaTransactionManager(factory);manager.setDataSource(source);
        // Match Spring Boot's Hibernate adapter: expose the JPA connection to JdbcTemplate.
        manager.setJpaDialect(new org.springframework.orm.jpa.vendor.HibernateJpaDialect());
        tx=new TransactionTemplate(manager);
    }
    @AfterAll static void close() {if(factory!=null)factory.close();}
    @BeforeEach void setup() {
        db.execute("TRUNCATE topics,clos,chapters,courses RESTART IDENTITY CASCADE");
        var users=mock(CurrentUserService.class);var actor=new UserEntity();actor.setId(35L);actor.setRole("teacher");when(users.getCurrentUser(null)).thenReturn(actor);
        var repo=new JpaRepositoryFactory(em).getRepository(CourseRepository.class);
        var stats=mock(QuestionBankStatsService.class);
        var courses=new TeacherCourseService(repo,mock(ChapterRepository.class),mock(CloRepository.class),stats,users);
        content=spy(new TeacherCourseContentService(db,users,stats));service=new CourseOutlineImportService(db,users,courses,content);
    }
    @Test void savesInOneTransactionAndRerunOnlySkips() {
        var first=tx.execute(status->service.confirm(null,new Confirmation(CourseOutlineImportTest.draft(),false)));
        assertEquals(new Counts(1,1,1),first.created());
        var second=tx.execute(status->service.confirm(null,new Confirmation(CourseOutlineImportTest.draft(),true)));
        assertEquals(new Counts(0,0,0),second.created());assertEquals(new Counts(1,1,1),second.skipped());
        assertEquals(1,db.queryForObject("SELECT count(*) FROM courses",Integer.class));
        assertEquals(35L,db.queryForObject("SELECT created_by FROM courses",Long.class));
        assertEquals(1,db.queryForObject("SELECT count(*) FROM topics t JOIN chapters c ON c.id=t.chapter_id AND c.course_id=t.course_id",Integer.class));
    }
    @Test void failureAfterCourseAndTopicsRollsBackEverything() {
        doThrow(new IllegalStateException("fixture failure")).when(content).createClo(anyLong(),any(),isNull());
        assertThrows(IllegalStateException.class,()->tx.execute(status->service.confirm(null,new Confirmation(CourseOutlineImportTest.draft(),false))));
        for(String table:List.of("courses","chapters","topics","clos"))assertEquals(0,db.queryForObject("SELECT count(*) FROM "+table,Integer.class));
    }
    @Test void existingCourseNeedsExplicitConfirmationAndConflictingCloNeverOverwrites() {
        tx.execute(status->service.confirm(null,new Confirmation(CourseOutlineImportTest.draft(),false)));
        assertThrows(RuntimeException.class,()->tx.execute(status->service.confirm(null,new Confirmation(CourseOutlineImportTest.draft(),false))));
        db.update("UPDATE clos SET description='Original existing description'");
        assertThrows(RuntimeException.class,()->tx.execute(status->service.confirm(null,new Confirmation(CourseOutlineImportTest.draft(),true))));
        assertEquals("Original existing description",db.queryForObject("SELECT description FROM clos",String.class));
    }
    @Test void concurrentImportsOfSameCodeCreateOnlyOneStructure()throws Exception {
        var executor=java.util.concurrent.Executors.newFixedThreadPool(2);
        var start=new java.util.concurrent.CountDownLatch(1);
        try {
            java.util.concurrent.Callable<Plan> call=()->{start.await();return tx.execute(status->service.confirm(null,new Confirmation(CourseOutlineImportTest.draft(),true)));};
            var a=executor.submit(call);var b=executor.submit(call);start.countDown();
            Plan first=a.get(15,java.util.concurrent.TimeUnit.SECONDS),second=b.get(15,java.util.concurrent.TimeUnit.SECONDS);
            assertEquals(1,first.created().chapters()+second.created().chapters());
            assertEquals(1,first.created().topics()+second.created().topics());
            assertEquals(1,first.created().clos()+second.created().clos());
            for(String table:List.of("courses","chapters","topics","clos"))assertEquals(1,db.queryForObject("SELECT count(*) FROM "+table,Integer.class));
        } finally {executor.shutdownNow();}
    }
    @Test void courseAssignedToAnotherOwnerCannotBeWritten() {
        tx.execute(status->service.confirm(null,new Confirmation(CourseOutlineImportTest.draft(),false)));
        db.update("UPDATE courses SET created_by=99");
        assertThrows(RuntimeException.class,()->tx.execute(status->service.confirm(null,new Confirmation(CourseOutlineImportTest.draft(),true))));
        assertEquals(99L,db.queryForObject("SELECT created_by FROM courses",Long.class));
        assertEquals(1,db.queryForObject("SELECT count(*) FROM topics",Integer.class));
    }
}
