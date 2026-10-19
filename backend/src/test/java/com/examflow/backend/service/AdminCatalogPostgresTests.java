package com.examflow.backend.service;

import com.examflow.backend.dto.QuickExamRequest;
import com.examflow.backend.entity.*;
import com.examflow.backend.exception.ApiException;
import com.examflow.backend.repository.*;
import jakarta.persistence.EntityManager;
import org.hibernate.SessionFactory;
import org.hibernate.cfg.Configuration;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfSystemProperty;
import org.springframework.data.jpa.repository.support.JpaRepositoryFactory;
import org.springframework.test.util.ReflectionTestUtils;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.concurrent.TimeUnit;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

/** Opt-in integration test: disposable PostgreSQL, no application config, secrets or user database. */
@EnabledIfSystemProperty(named="qut.catalog.postgres",matches="true")
@TestMethodOrder(MethodOrderer.OrderAnnotation.class)
class AdminCatalogPostgresTests {
    static String container;
    static java.nio.file.Path localData;
    static String localBin;
    static SessionFactory factory;
    EntityManager em;
    AdminCatalogService service;
    Long teacherId;

    static String docker(String... args) throws Exception {
        String[] command=new String[args.length+1];command[0]="docker";System.arraycopy(args,0,command,1,args.length);
        Process process=new ProcessBuilder(command).redirectErrorStream(true).start();
        if(!process.waitFor(45,TimeUnit.SECONDS)){process.destroyForcibly();throw new IllegalStateException("Docker test command timed out");}
        String output=new String(process.getInputStream().readAllBytes(),java.nio.charset.StandardCharsets.UTF_8).trim();
        if(process.exitValue()!=0)throw new IllegalStateException(output);
        return output;
    }

    static AdminCodeGenerator generator(EntityManager manager){AdminCodeGenerator codes=new AdminCodeGenerator();ReflectionTestUtils.setField(codes,"em",manager);return codes;}
    @Test void automaticCodesSkipExistingValuesAndHaveRequestedFormats(){
        // Sequence state is not rolled back: set explicitly inside this disposable database.
        em.createNativeQuery("ALTER SEQUENCE admin_student_code_seq RESTART WITH 1").executeUpdate();
        em.createNativeQuery("ALTER SEQUENCE admin_teacher_code_seq RESTART WITH 1").executeUpdate();
        em.createNativeQuery("ALTER SEQUENCE admin_course_code_seq RESTART WITH 1").executeUpdate();
        em.createNativeQuery("UPDATE users SET username='2000000001' WHERE id=:id").setParameter("id",teacherId).executeUpdate();
        var codes=generator(em);
        assertEquals("2000000002",codes.next(AdminCodeGenerator.Kind.STUDENT));
        assertEquals("3000000001",codes.next(AdminCodeGenerator.Kind.TEACHER));
        assertEquals("MH01",service.course(teacherId,null,new AdminCatalogService.CourseInput(null,"Môn tự động",3,"CNTT","",teacherId,"active")).get("code"));
        assertEquals("MH02",service.course(teacherId,null,new AdminCatalogService.CourseInput(null,"Môn tự động 2",3,"CNTT","",teacherId,"active")).get("code"));
        var admin=account("auto-code-admin","admin");
        em.createNativeQuery("ALTER SEQUENCE admin_class_code_seq RESTART WITH 1").executeUpdate();
        organization().saveClass(admin,null,new ExamOrganizationService.ClassInput(null,"Lớp tự động","CNTT","active"));
        long classId=((Number)em.createNativeQuery("SELECT id FROM student_classes WHERE code='L01'").getSingleResult()).longValue();
        organization().saveClass(admin,classId,new ExamOrganizationService.ClassInput(null,"Lớp đổi tên","CNTT","active"));
        assertEquals("L01",em.createNativeQuery("SELECT code FROM student_classes WHERE id=:id").setParameter("id",classId).getSingleResult());
        em.createNativeQuery("ALTER SEQUENCE admin_period_code_seq RESTART WITH 1").executeUpdate();
        var period=allocation().period(admin,new CourseAllocationService.PeriodInput(null,"Đợt thi tự động"));
        assertEquals("DT01",period.get("code"));assertTrue(((Number)period.get("id")).longValue()>0);
        em.createNativeQuery("ALTER SEQUENCE admin_class_code_seq RESTART WITH 99").executeUpdate();
        assertEquals("L99",codes.next(AdminCodeGenerator.Kind.CLASS));assertEquals("L100",codes.next(AdminCodeGenerator.Kind.CLASS));
        em.createNativeQuery("ALTER SEQUENCE admin_student_code_seq RESTART WITH 9999999").executeUpdate();
        assertEquals("2009999999",codes.next(AdminCodeGenerator.Kind.STUDENT));
    }
    @Test @Order(Integer.MAX_VALUE) void concurrentReservationsAreUniqueAcrossConnections() throws Exception {
        // Commit schema before other connections allocate from the same sequence.
        em.getTransaction().commit();
        var executor=java.util.concurrent.Executors.newFixedThreadPool(6);
        try {
            var jobs=new java.util.ArrayList<java.util.concurrent.Callable<String>>();
            for(int i=0;i<60;i++)jobs.add(()->{try(var connection=factory.createEntityManager()){
                connection.getTransaction().begin();String code=generator(connection).next(AdminCodeGenerator.Kind.TEACHER);connection.getTransaction().rollback();return code;
            }});
            var codes=new java.util.HashSet<String>();for(var result:executor.invokeAll(jobs)){String code=result.get();assertTrue(code.matches("300[0-9]{7}"));assertTrue(codes.add(code));}
            assertEquals(60,codes.size());
        } finally {
            executor.shutdownNow();em.getTransaction().begin();
            // This test committed only its synthetic teacher/schema; remove the teacher again.
            em.createNativeQuery("DELETE FROM users WHERE id=:id").setParameter("id",teacherId).executeUpdate();em.getTransaction().commit();em.getTransaction().begin();
        }
    }

    @BeforeAll static void startPostgres() throws Exception {
        String port;
        localBin=System.getProperty("qut.catalog.pgBin");
        if(localBin!=null){
            localData=java.nio.file.Files.createTempDirectory(java.nio.file.Path.of("target"),"qut-pg-test-").toAbsolutePath();
            runLocal("initdb.exe","-D",localData.toString(),"-A","trust","-U","postgres","-E","UTF8","--no-locale");
            try(java.net.ServerSocket socket=new java.net.ServerSocket(0)){port=String.valueOf(socket.getLocalPort());}
            runLocal("pg_ctl.exe","-D",localData.toString(),"-l",localData.resolve("server.log").toString(),"-o","-h 127.0.0.1 -p "+port+" -F","-w","start");
        }else{
            container=docker("run","--rm","-d","-p","127.0.0.1::5432","-e","POSTGRES_PASSWORD=synthetic-admin-test","postgres:17-alpine");
            port=null;
        }
        try {
          if(container!=null){
            boolean ready=false;
            for(int i=0;i<30;i++){
                try{docker("exec",container,"pg_isready","-U","postgres");ready=true;break;}catch(IllegalStateException retry){Thread.sleep(500);}
            }
            if(!ready)throw new IllegalStateException("Disposable PostgreSQL not ready");
            port=docker("port",container,"5432/tcp").split(":")[1];
          }
            Configuration config=new Configuration();
            for(Class<?> entity:List.of(UserEntity.class,Course.class,Exam.class,ExamSession.class,Question.class,Clo.class,
                    ExamQuestion.class,StudentAnswer.class,Answer.class,DifficultyLevel.class,ExamAttempt.class,ExamSessionStudent.class,AntiCheatEvent.class))config.addAnnotatedClass(entity);
            config.setProperty("hibernate.connection.url","jdbc:postgresql://127.0.0.1:"+port+"/postgres");
            config.setProperty("hibernate.connection.username","postgres");config.setProperty("hibernate.connection.password","synthetic-admin-test");
            config.setProperty("hibernate.hbm2ddl.auto","create-drop");config.setProperty("hibernate.show_sql","false");
            factory=config.buildSessionFactory();
        } catch(Exception failure){if(container!=null){docker("stop",container);container=null;}else if(localData!=null)runLocal("pg_ctl.exe","-D",localData.toString(),"-m","fast","-w","stop");throw failure;}
    }
    static void runLocal(String name,String...args) throws Exception {
        java.util.List<String> command=new java.util.ArrayList<>();command.add(java.nio.file.Path.of(localBin,name).toString());command.addAll(List.of(args));
        var output=java.nio.file.Files.createTempFile(java.nio.file.Path.of("target"),"pg-command-",".log");
        Process process=new ProcessBuilder(command).redirectErrorStream(true).redirectOutput(output.toFile()).start();
        if(!process.waitFor(40,TimeUnit.SECONDS)){process.destroyForcibly();throw new IllegalStateException("Local PostgreSQL command timed out");}
        if(process.exitValue()!=0)throw new IllegalStateException(java.nio.file.Files.readString(output));
    }
    @AfterAll static void stopPostgres() throws Exception {
        try{if(factory!=null)factory.close();}finally{if(container!=null)docker("stop",container);else if(localData!=null)runLocal("pg_ctl.exe","-D",localData.toString(),"-m","fast","-w","stop");}
    }
    @BeforeEach void setup(){
        em=factory.createEntityManager();em.getTransaction().begin();
        em.createNativeQuery("CREATE TABLE IF NOT EXISTS classes(id bigint PRIMARY KEY,name text)").executeUpdate();
        em.createNativeQuery("CREATE TABLE IF NOT EXISTS chapters(id bigint PRIMARY KEY,course_id bigint REFERENCES courses(id) ON DELETE CASCADE)").executeUpdate();
        em.createNativeQuery("CREATE TABLE IF NOT EXISTS exam_ai_policies(exam_id bigint PRIMARY KEY REFERENCES exams(id),enabled boolean NOT NULL)").executeUpdate();
        em.createNativeQuery("CREATE TABLE IF NOT EXISTS attempt_reviews(attempt_id bigint PRIMARY KEY,outcome text)").executeUpdate();
        // Monitoring columns are migration-managed, outside the legacy JPA entity mapping.
        em.createNativeQuery("ALTER TABLE anti_cheat_events ADD COLUMN IF NOT EXISTS module text, ADD COLUMN IF NOT EXISTS risk_score numeric DEFAULT 0, ADD COLUMN IF NOT EXISTS risk_level text DEFAULT 'LOW'").executeUpdate();
        em.createNativeQuery("CREATE TABLE IF NOT EXISTS course_faculties(course_id bigint REFERENCES courses(id),faculty_id bigint REFERENCES users(id),PRIMARY KEY(course_id,faculty_id))").executeUpdate();
        em.createNativeQuery("ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at timestamp DEFAULT NOW()").executeUpdate();
        em.createNativeQuery("ALTER TABLE users ADD COLUMN IF NOT EXISTS created_at timestamp DEFAULT NOW()").executeUpdate();
        try {
            for(String file:List.of("009_exam_rooms.sql","010_assigned_examinations.sql","011_exam_authorship.sql")) {
                String sql=java.nio.file.Files.readString(java.nio.file.Path.of("../database/migrations",file));
                sql=sql.lines().filter(line->!line.stripLeading().startsWith("--")).collect(java.util.stream.Collectors.joining("\n"));
                for(String statement:sql.split(";")){String part=statement.trim();if(!part.isEmpty()&&!part.equals("BEGIN")&&!part.equals("COMMIT"))em.createNativeQuery(part).executeUpdate();}
            }
        }catch(java.io.IOException error){throw new RuntimeException(error);}
        try {
            for(String file:List.of("012_course_exam_allocation.sql","013_department_exam_sittings.sql","014_session_ai_policy.sql","017_admin_automatic_codes.sql")){
                String migration=java.nio.file.Files.readString(java.nio.file.Path.of("../database/migrations",file)).replaceAll("(?m)^BEGIN;\\s*$", "").replaceAll("(?m)^COMMIT;\\s*$", "");
                em.unwrap(org.hibernate.Session.class).doWork(connection->{try(var statement=connection.createStatement()){statement.execute(migration);}});
            }
        }catch(java.io.IOException error){throw new RuntimeException(error);}
        UserEntity teacher=new UserEntity();teacher.setUsername("synthetic-teacher");teacher.setEmail("teacher@example.invalid");
        teacher.setFullName("Giảng viên kiểm thử");teacher.setRole("teacher");teacher.setStatus("active");em.persist(teacher);teacherId=teacher.getId();
        JpaRepositoryFactory repos=new JpaRepositoryFactory(em);
        var bank=mock(QuestionBankExamBridge.class);
        when(bank.approvedPool(anyLong(),anyList())).thenAnswer(call->{
            Long course=call.getArgument(0);List<Long> clos=call.getArgument(1);
            return repos.getRepository(QuestionRepository.class).findApprovedPool(course,clos.isEmpty()?List.of(-1L):clos,clos.isEmpty()).stream()
                .map(q->new QuestionBankExamBridge.Candidate(q.getId(),q.getDifficultyLevelId())).toList();
        });
        TeacherExamService builder=new TeacherExamService(repos.getRepository(CourseRepository.class),bank,
                repos.getRepository(ExamRepository.class),repos.getRepository(ExamQuestionRepository.class),repos.getRepository(DifficultyLevelRepository.class));
        service=new AdminCatalogService(mock(AdminService.class),builder);ReflectionTestUtils.setField(service,"em",em);ReflectionTestUtils.setField(service,"codes",generator(em));ReflectionTestUtils.setField(service,"snapshots",snapshots(em));
    }
    @AfterEach void rollback(){if(em!=null){if(em.getTransaction().isActive())em.getTransaction().rollback();em.close();}}
    Long course(String code){return ((Number)service.course(teacherId,null,new AdminCatalogService.CourseInput(code,"Học phần kiểm thử",3,"CNTT","Synthetic",teacherId,"active")).get("id")).longValue();}
    long count(String table){return ((Number)em.createNativeQuery("SELECT COUNT(*) FROM "+table).getSingleResult()).longValue();}
    AdminWorkspaceService workspace(){AdminWorkspaceService result=new AdminWorkspaceService(mock(AdminService.class));ReflectionTestUtils.setField(result,"em",em);return result;}
    Long simpleExam(){
        Course course=em.find(Course.class,course("STATUS-COURSE"));
        Exam exam=new Exam();exam.setCreatedBy(teacherId);exam.setCourse(course);exam.setCode("STATUS-EXAM");exam.setTitle("Đề kiểm thử trạng thái");
        exam.setTotalQuestions(1);exam.setTotalPoints(BigDecimal.TEN);exam.setStatus("draft");exam.setShuffleQuestions(true);exam.setShuffleAnswers(true);exam.setAntiCheatMode(false);em.persist(exam);
        Question question=new Question();question.setCourse(course);question.setCognitiveLevelId((short)1);question.setDifficultyLevelId((short)1);
        question.setContent("Câu hỏi tổng hợp");question.setStatus("approved");question.setSource("manual");question.setDefaultScore(BigDecimal.ONE);em.persist(question);
        for(short i=1;i<=2;i++){Answer answer=new Answer();answer.setQuestion(question);answer.setLabel(i==1?"A":"B");answer.setContent("Đáp án tổng hợp "+i);answer.setCorrect(i==1);answer.setPosition(i);em.persist(answer);}
        ExamQuestion link=new ExamQuestion();link.setExam(exam);link.setQuestionId(question.getId());link.setPosition(1);link.setPoints(BigDecimal.TEN);em.persist(link);em.flush();return exam.getId();
    }

    @Test void realCourseExamSessionCrudPreservesBankQuestions(){
        Long courseId=course("TEST-WEB");
        assertEquals(1,((List<?>)service.options().get("courses")).size());
        for(short i=1;i<=3;i++){
            DifficultyLevel level=new DifficultyLevel();ReflectionTestUtils.setField(level,"id",i);ReflectionTestUtils.setField(level,"code","L"+i);
            ReflectionTestUtils.setField(level,"name","Mức "+i);ReflectionTestUtils.setField(level,"levelOrder",i);em.persist(level);
            Question q=new Question();q.setCourse(em.find(Course.class,courseId));q.setCognitiveLevelId((short)1);q.setDifficultyLevelId(i);
            q.setContent("Câu hỏi tổng hợp "+i);q.setStatus("approved");q.setSource("manual");q.setDefaultScore(BigDecimal.ONE);em.persist(q);
        }
        em.flush();
        Map<String,Object> created=service.createExam(teacherId,new QuickExamRequest(courseId,"Đề kiểm thử","TEST-EXAM",1,100,0,0,100,List.of(),true,true,false));
        Long examId=((Number)created.get("id")).longValue();assertEquals(1,count("exam_questions"));assertEquals(1,count("exam_ai_policies"));
        service.exam(teacherId,examId,new AdminCatalogService.ExamInput("TEST-EDIT","Đề đã sửa",false,true));
        assertEquals("TEST-EDIT",service.detail("exams",examId).get("code"));
        LocalDateTime start=LocalDateTime.now().plusYears(1);
        Long sessionId=((Number)service.session(teacherId,null,new AdminCatalogService.SessionInput(examId,"Ca kiểm thử","TEST-SESSION",null,start,start.plusHours(1))).get("id")).longValue();
        em.clear();ExamSession session=em.find(ExamSession.class,sessionId);assertEquals(session.getRoomCode(),session.getAccessCode());
        assertEquals("upcoming",em.find(Exam.class,examId).getStatus());
        AdminWorkspaceService workspace=new AdminWorkspaceService(mock(AdminService.class));ReflectionTestUtils.setField(workspace,"em",em);
        var filters=new AdminWorkspaceService.Filters("","","","",null,null,null);
        var courses=workspace.list("courses",filters,0,20);
        assertEquals("Giảng viên kiểm thử",courses.items().get(0).get("teacherName"));
        assertEquals(3,((Number)courses.items().get(0).get("credits")).intValue());
        assertEquals("TEST-SESSION",workspace.list("sessions",filters,0,20).items().get(0).get("roomCode"));
        assertEquals("Ca kiểm thử",workspace.list("sessions",filters,0,20).items().get(0).get("name"));
        assertEquals(1,workspace.list("exams",filters,0,20).total());
        assertEquals(0,workspace.list("attempts",filters,0,20).total());
        assertThrows(ApiException.class,()->service.delete(teacherId,"exams",examId));
        service.session(teacherId,sessionId,new AdminCatalogService.SessionInput(examId,"Ca đã sửa","TEST-EDIT-SESSION",null,start.plusDays(1),start.plusDays(1).plusHours(1)));
        service.delete(teacherId,"sessions",sessionId);assertEquals("draft",em.find(Exam.class,examId).getStatus());
        service.delete(teacherId,"exams",examId);em.flush();
        assertEquals(0,count("exam_sessions"));assertEquals(0,count("exams"));assertEquals(0,count("exam_questions"));assertEquals(3,count("questions"));
        assertThrows(ApiException.class,()->service.delete(teacherId,"courses",courseId));
    }
    @Test void actualForeignKeyGuardPreventsUnanticipatedCascade(){
        Long id=course("TEST-EMPTY");
        service.course(teacherId,id,new AdminCatalogService.CourseInput("TEST-UPDATED","Đã cập nhật",4,"CNTT","Synthetic",teacherId,"inactive"));
        assertEquals("inactive",service.detail("courses",id).get("status"));
        em.createNativeQuery("CREATE TABLE unexpected_course_child(course_id bigint REFERENCES courses(id) ON DELETE CASCADE)").executeUpdate();
        em.createNativeQuery("INSERT INTO unexpected_course_child VALUES (:id)").setParameter("id",id).executeUpdate();
        assertThrows(ApiException.class,()->service.delete(teacherId,"courses",id));assertEquals(1,count("unexpected_course_child"));
        em.createNativeQuery("DELETE FROM unexpected_course_child").executeUpdate();
        service.delete(teacherId,"courses",id);em.flush();assertEquals(0,count("courses"));
    }
    @Test void codeFilterAndStatusChangesPreserveActiveAndSubmittedAttempts(){
        Long examId=simpleExam();LocalDateTime start=LocalDateTime.now(java.time.ZoneId.of("Asia/Ho_Chi_Minh")).minusMinutes(10);
        Long sessionId=((Number)service.session(teacherId,null,new AdminCatalogService.SessionInput(examId,"Ca đang thi","STATUS-CODE",null,start,start.plusHours(2))).get("id")).longValue();
        UserEntity student=new UserEntity();student.setUsername("synthetic-student");student.setEmail("student@example.invalid");student.setFullName("Sinh viên kiểm thử");student.setRole("student");student.setStatus("active");em.persist(student);
        ExamAttempt attempt=new ExamAttempt();attempt.setExam(em.find(Exam.class,examId));attempt.setExamSession(em.find(ExamSession.class,sessionId));attempt.setStudent(student);attempt.setStatus("in_progress");attempt.setStartedAt(start.plusMinutes(1));em.persist(attempt);em.flush();
        AdminWorkspaceService workspace=workspace();
        assertThrows(ApiException.class,()->workspace.updateSessionStatus(teacherId,sessionId,"cancelled"));
        assertThrows(ApiException.class,()->workspace.updateSessionStatus(teacherId,sessionId,"completed"));
        assertEquals("ongoing",em.find(ExamSession.class,sessionId).getStatus());assertEquals("in_progress",attempt.getStatus());
        var match=new AdminWorkspaceService.Filters("","","","",null,null,null," status-code ");
        var absent=new AdminWorkspaceService.Filters("","","","",null,null,null,"NO-SUCH-CODE");
        assertEquals(1,workspace.list("attempts",match,0,20).total());assertEquals(0,workspace.list("attempts",absent,0,20).total());
        assertEquals("STATUS-CODE",workspace.list("attempts",match,0,20).items().get(0).get("sessionCode"));
        attempt.setStatus("completed");attempt.setScore(BigDecimal.valueOf(8));attempt.setSubmittedAt(start.plusMinutes(5));em.flush();
        assertEquals(1L,((Number)workspace.report(match).get("completed")).longValue());assertEquals(0L,((Number)workspace.report(absent).get("completed")).longValue());
        workspace.updateSessionStatus(teacherId,sessionId,"completed");
        assertEquals("completed",em.find(ExamSession.class,sessionId).getStatus());assertEquals("completed",em.find(Exam.class,examId).getStatus());
        assertEquals(0,BigDecimal.valueOf(8).compareTo(attempt.getScore()));
        assertThrows(ApiException.class,()->workspace.updateSessionStatus(teacherId,sessionId,"ongoing"));
    }
    @Test void futureSessionCanBeCancelledButNotMarkedCompleted(){
        Long examId=simpleExam();LocalDateTime start=LocalDateTime.now().plusYears(1);
        Long sessionId=((Number)service.session(teacherId,null,new AdminCatalogService.SessionInput(examId,"Ca tương lai","FUTURE-CODE",null,start,start.plusHours(1))).get("id")).longValue();
        AdminWorkspaceService workspace=workspace();assertThrows(ApiException.class,()->workspace.updateSessionStatus(teacherId,sessionId,"completed"));
        workspace.updateSessionStatus(teacherId,sessionId,"cancelled");
        assertEquals("cancelled",em.find(ExamSession.class,sessionId).getStatus());assertEquals("draft",em.find(Exam.class,examId).getStatus());
        assertThrows(ApiException.class,()->workspace.updateSessionStatus(teacherId,sessionId,"scheduled"));
    }
    UserEntity account(String name,String role){UserEntity u=new UserEntity();u.setUsername(name);u.setFullName(name);u.setEmail(name+"@example.invalid");u.setRole(role);u.setStatus("active");u.setKeycloakUserId("subject-"+name);em.persist(u);return u;}
    @Test void accountClassIsValidatedPersistedAndReturnedInLists(){
        var org=organization();UserEntity actor=account("class-admin","admin"),student=account("9000000099","student");student.setKeycloakUserId(null);em.flush();
        org.saveClass(actor,null,new ExamOrganizationService.ClassInput("DHTH01","DHTH01","CNTT","active"));
        org.saveClass(actor,null,new ExamOrganizationService.ClassInput("DHKT01","DHKT01","Kinh tế","inactive"));
        Long classId=((Number)em.createNativeQuery("SELECT id FROM student_classes WHERE code='DHTH01'").getSingleResult()).longValue();
        Long inactive=((Number)em.createNativeQuery("SELECT id FROM student_classes WHERE code='DHKT01'").getSingleResult()).longValue();
        var identities=mock(KeycloakAdminService.class);var accounts=new AdminAccountService(new JpaRepositoryFactory(em).getRepository(UserRepository.class),identities,mock(AdminService.class));ReflectionTestUtils.setField(accounts,"em",em);
        assertThrows(ApiException.class,()->accounts.edit(actor.getId(),student.getId(),new AdminAccountService.Edit("Sinh viên","Kinh tế",com.examflow.backend.dto.RegistrationRole.STUDENT,"active",classId)));
        assertThrows(ApiException.class,()->accounts.edit(actor.getId(),student.getId(),new AdminAccountService.Edit("Sinh viên","Kinh tế",com.examflow.backend.dto.RegistrationRole.STUDENT,"active",inactive)));
        assertThrows(ApiException.class,()->accounts.edit(actor.getId(),student.getId(),new AdminAccountService.Edit("Sinh viên","CNTT",com.examflow.backend.dto.RegistrationRole.STUDENT,"active",999999L)));
        verifyNoInteractions(identities);
        var result=accounts.edit(actor.getId(),student.getId(),new AdminAccountService.Edit("Sinh viên","CNTT",com.examflow.backend.dto.RegistrationRole.STUDENT,"active",classId));
        assertEquals(classId,result.studentClassId());assertEquals("DHTH01",result.classCode());assertEquals("CNTT",result.department());
        accounts.status(actor.getId(),student.getId(),"locked");assertEquals(classId,student.getStudentClassId());
        var rows=workspace().list("users",new AdminWorkspaceService.Filters("DHTH01","","","",null,null,null),0,20);
        assertEquals(1,rows.total());assertEquals("DHTH01",rows.items().get(0).get("classCode"));
        assertEquals(2,((List<?>)accounts.academicOptions().get("classes")).size());
    }
    @Test void trialSeedCreatesFifteenClassesAndPreservesUnrelatedFieldsOnRerun()throws Exception{
        var ids=List.of(4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,25,26,27,28,29,30,36);
        // This schema is disposable and rolled back after each test.
        em.createNativeQuery("UPDATE users SET id=100000 WHERE id=:id").setParameter("id",teacherId).executeUpdate();em.clear();
        for(int i=0;i<ids.size();i++)em.createNativeQuery("INSERT INTO users(id,username,email,full_name,role,status,updated_at) VALUES(:id,:code,:email,'Synthetic','student','active',NOW())").setParameter("id",ids.get(i)).setParameter("code",String.format("900000%04d",i+1)).setParameter("email","trial"+i+"@example.invalid").executeUpdate();
        String before=(String)em.createNativeQuery("SELECT md5(string_agg((to_jsonb(u)-'department'-'student_class_id'-'updated_at')::text,'|' ORDER BY id)) FROM users u").getSingleResult();
        String sql=java.nio.file.Files.readString(java.nio.file.Path.of("../database/seeds/001_demo_faculties_classes.sql")).replaceAll("(?m)^BEGIN;\\s*$", "").replaceAll("(?m)^COMMIT;\\s*$", "");
        em.unwrap(org.hibernate.Session.class).doWork(c->{for(int run=0;run<2;run++){try(var statement=c.createStatement()){statement.execute(sql);statement.execute("DROP TABLE qut_demo_students,qut_demo_classes");}}});
        assertEquals(15,count("student_classes"));assertEquals(3,((Number)em.createNativeQuery("SELECT count(DISTINCT department) FROM users WHERE role='student'").getSingleResult()).intValue());
        assertEquals(27,((Number)em.createNativeQuery("SELECT count(*) FROM users WHERE student_class_id IS NOT NULL").getSingleResult()).intValue());
        assertEquals(before,em.createNativeQuery("SELECT md5(string_agg((to_jsonb(u)-'department'-'student_class_id'-'updated_at')::text,'|' ORDER BY id)) FROM users u").getSingleResult());
    }
    @Test void roomCodeIsGeneratedWhenOmittedAndRemainsStableOnEdit(){
        var org=organization();var actor=account("room-code-admin","admin");
        org.saveRoom(actor,null,new ExamOrganizationService.RoomInput(null,"Phòng tự động","active",30));
        org.saveRoom(actor,null,new ExamOrganizationService.RoomInput("","Phòng thứ hai","active",35));
        var rows=em.createNativeQuery("SELECT id,code FROM exam_rooms ORDER BY id").getResultList();assertEquals(2,rows.size());
        Object[] first=(Object[])rows.get(0),second=(Object[])rows.get(1);assertNotEquals(first[1],second[1]);assertTrue(first[1].toString().matches("P[0-9]{2,}"));
        org.saveRoom(actor,((Number)first[0]).longValue(),new ExamOrganizationService.RoomInput("CHANGED","Đổi tên phòng","inactive",40));
        assertEquals(first[1],em.createNativeQuery("SELECT code FROM exam_rooms WHERE id=:id").setParameter("id",first[0]).getSingleResult());
    }
    @Test void examReviewIncludesQuestionsAndClosingPreservesContent(){
        long exam=simpleExam();var result=service.reviewExam(exam);assertEquals(true,result.get("canEdit"));
        assertEquals(1,((List<?>)result.get("questions")).size());long questions=count("questions"),answers=count("answers");
        service.closeExam(teacherId,exam);assertEquals("cancelled",em.find(Exam.class,exam).getStatus());assertEquals(questions,count("questions"));assertEquals(answers,count("answers"));
        assertEquals(false,service.reviewExam(exam).get("canEdit"));
    }
    @Test void editingExamClonesBankQuestionsAndUsedExamRevisionLeavesHistoryUntouched(){
        long id=simpleExam();var original=service.reviewExam(id);var question=em.createQuery("SELECT q FROM Question q WHERE q.id IN (SELECT eq.questionId FROM ExamQuestion eq WHERE eq.exam.id=:id)",Question.class).setParameter("id",id).getSingleResult();String oldText=question.getContent();
        var editor=new AdminExamContentService(service,mock(AdminService.class));ReflectionTestUtils.setField(editor,"em",em);ReflectionTestUtils.setField(editor,"codes",generator(em));ReflectionTestUtils.setField(editor,"snapshots",snapshots(em));
        var answers=List.of(new AdminExamContentService.AnswerInput("Đáp án mới đúng",true),new AdminExamContentService.AnswerInput("Đáp án mới sai",false));
        var input=new AdminExamContentService.Input((String)original.get("revisionToken"),"Đề đã chỉnh sửa",List.of(new AdminExamContentService.QuestionInput(question.getId(),"Nội dung đã chỉnh sửa",BigDecimal.TEN,answers)));
        var saved=editor.save(teacherId,id,input,false);assertEquals("Đề đã chỉnh sửa",saved.get("title"));assertEquals(oldText,question.getContent());assertEquals(2,count("questions"));
        em.clear();assertEquals(saved.get("revisionToken"),service.reviewExam(id).get("revisionToken"));
        assertThrows(ApiException.class,()->editor.save(teacherId,id,input,false));
        var start=ExamOrganizationService.now().plusDays(1);service.session(teacherId,null,new AdminCatalogService.SessionInput(id,"Ca giữ nguyên","KEEP-HISTORY",null,start,start.plusHours(1)));em.flush();
        var used=service.reviewExam(id);@SuppressWarnings("unchecked") var changedQuestion=(Map<String,Object>)((List<?>)used.get("questions")).get(0);
        var revisedInput=new AdminExamContentService.Input((String)used.get("revisionToken"),"Bản sửa mới",List.of(new AdminExamContentService.QuestionInput(((Number)changedQuestion.get("id")).longValue(),"Nội dung bản mới",BigDecimal.TEN,answers)));
        assertThrows(ApiException.class,()->editor.save(teacherId,id,revisedInput,false));var copy=editor.save(teacherId,id,revisedInput,true);
        assertNotEquals(id,((Number)copy.get("id")).longValue());assertEquals("draft",copy.get("status"));assertEquals("Đề đã chỉnh sửa",em.find(Exam.class,id).getTitle());assertEquals(1,count("exam_sessions"));
    }
    @Test void snapshotExamCanBeReviewedEditedAndRevisedWithoutChangingTheQuestionBank(){
        long id=simpleExam();var link=em.createQuery("SELECT eq FROM ExamQuestion eq WHERE eq.exam.id=:id",ExamQuestion.class).setParameter("id",id).getSingleResult();
        em.createNativeQuery("CREATE TABLE exam_question_snapshots(exam_question_id bigint PRIMARY KEY REFERENCES exam_questions(id) ON DELETE CASCADE,exam_id bigint NOT NULL REFERENCES exams(id),question_id bigint NOT NULL,course_id bigint NOT NULL,clo_id bigint,question_content text NOT NULL,question_explanation text,options jsonb NOT NULL,correct_answer_id bigint NOT NULL)").executeUpdate();
        // Positive ID exists only in the external bank; no Main DB Question entity with this ID.
        link.setQuestionId(7654321L);em.flush();
        em.createNativeQuery("INSERT INTO exam_question_snapshots VALUES(:link,:exam,7654321,:course,NULL,'Frozen bank content','',cast(:options as jsonb),101)")
            .setParameter("link",link.getId()).setParameter("exam",id).setParameter("course",link.getExam().getCourse().getId())
            .setParameter("options","[{\"id\":101,\"label\":\"A\",\"content\":\"Correct\"},{\"id\":102,\"label\":\"B\",\"content\":\"Incorrect\"}]").executeUpdate();
        var view=service.reviewExam(id);assertEquals("Frozen bank content",((Map<?,?>)((List<?>)view.get("questions")).get(0)).get("content"));
        long questions=count("questions"),answers=count("answers");
        var editor=new AdminExamContentService(service,mock(AdminService.class));ReflectionTestUtils.setField(editor,"em",em);ReflectionTestUtils.setField(editor,"codes",generator(em));ReflectionTestUtils.setField(editor,"snapshots",snapshots(em));
        var choices=List.of(new AdminExamContentService.AnswerInput("Corrected A",false),new AdminExamContentService.AnswerInput("Corrected B",true));
        var edit=new AdminExamContentService.Input((String)view.get("revisionToken"),"Edited snapshot paper",List.of(new AdminExamContentService.QuestionInput(7654321L,"Admin-corrected content",BigDecimal.TEN,choices),new AdminExamContentService.QuestionInput(null,"Additional question",BigDecimal.ONE,choices)));
        var changed=editor.save(teacherId,id,edit,false);assertEquals(questions,count("questions"));assertEquals(answers,count("answers"));
        var first=(Map<?,?>)((List<?>)changed.get("questions")).get(0);long negative=((Number)first.get("id")).longValue();assertTrue(negative<0);assertEquals("Admin-corrected content",first.get("content"));
        var freshLink=em.createQuery("SELECT eq FROM ExamQuestion eq WHERE eq.exam.id=:id AND eq.position=1",ExamQuestion.class).setParameter("id",id).getSingleResult();
        var frozen=snapshots(em).find(freshLink.getId()).orElseThrow();assertEquals(negative,frozen.questionId());assertTrue(frozen.isCorrect(2));assertFalse(frozen.isCorrect(1));
        var revision=editor.save(teacherId,id,new AdminExamContentService.Input((String)changed.get("revisionToken"),"Snapshot revision",List.of(new AdminExamContentService.QuestionInput(negative,"Revision only",BigDecimal.TEN,choices))),true);
        assertNotEquals(id,((Number)revision.get("id")).longValue());assertEquals("Admin-corrected content",((Map<?,?>)((List<?>)service.reviewExam(id).get("questions")).get(0)).get("content"));
        assertEquals(questions,count("questions"));assertEquals(answers,count("answers"));
    }
    @Test void shortRoomMigrationPreservesIdsAndCustomCodes()throws Exception{
        var actor=account("room-migration-admin","admin");organization().saveRoom(actor,null,new ExamOrganizationService.RoomInput("PH-1234567890ABCDEF1234567890ABCDEF","A101","active",40));organization().saveRoom(actor,null,new ExamOrganizationService.RoomInput("LAB-A","Phòng riêng","active",40));
        long id=((Number)em.createNativeQuery("SELECT id FROM exam_rooms WHERE name='A101'").getSingleResult()).longValue();
        String sql=java.nio.file.Files.readString(java.nio.file.Path.of("../database/migrations/015_short_room_codes.sql")).replaceAll("(?m)^BEGIN;\\s*$", "").replaceAll("(?m)^COMMIT;\\s*$", "");
        em.unwrap(org.hibernate.Session.class).doWork(c->{try(var q=c.createStatement()){q.execute(sql);q.execute(sql);}});
        assertEquals(String.format("P%03d",id),em.createNativeQuery("SELECT code FROM exam_rooms WHERE id=:id").setParameter("id",id).getSingleResult());assertEquals(1L,((Number)em.createNativeQuery("SELECT count(*) FROM exam_rooms WHERE code='LAB-A'").getSingleResult()).longValue());
    }
    @Test void sessionAiOverrideDoesNotChangeOtherSessionsOrTheExamPolicy(){
        long exam=simpleExam();var student=account("ai-policy-student","student");LocalDateTime start=ExamOrganizationService.now().minusMinutes(5);
        var first=new ExamSession();first.setExam(em.find(Exam.class,exam));first.setName("Ca một");first.setRoomCode("AI-ONE");first.setAccessCode("AI-ONE");first.setStartTime(start);first.setEndTime(start.plusHours(1));first.setStatus("ongoing");em.persist(first);
        var second=new ExamSession();second.setExam(first.getExam());second.setName("Ca hai");second.setRoomCode("AI-TWO");second.setAccessCode("AI-TWO");second.setStartTime(start);second.setEndTime(start.plusHours(1));second.setStatus("ongoing");em.persist(second);
        var attempt=new ExamAttempt();attempt.setExam(first.getExam());attempt.setExamSession(first);attempt.setStudent(student);attempt.setStatus("in_progress");attempt.setStartedAt(start);em.persist(attempt);em.flush();
        var anti=new AntiCheatService(new JpaRepositoryFactory(em).getRepository(ExamAttemptRepository.class),"http://127.0.0.1:1","placeholder");var batch=mock(BatchMonitoringService.class);ReflectionTestUtils.setField(anti,"entityManager",em);ReflectionTestUtils.setField(anti,"batchMonitoring",batch);
        anti.updateSessionPolicy(first.getId(),false);assertFalse(anti.isRequired(exam,first));assertTrue(anti.isRequired(exam,second));assertNull(second.getAiEnabled());verify(batch).stop(attempt.getId());assertEquals("in_progress",attempt.getStatus());
        anti.updateSessionPolicy(first.getId(),true);assertTrue(anti.isRequired(exam,first));verify(batch).queue(attempt.getId(),student.getId());
        first.setStatus("completed");em.flush();assertThrows(ApiException.class,()->anti.updateSessionPolicy(first.getId(),false));
        assertThrows(ApiException.class,()->service.closeExam(teacherId,exam));
    }
    ExamOrganizationService organization(){var value=new ExamOrganizationService(mock(AdminService.class),workspace());ReflectionTestUtils.setField(value,"em",em);ReflectionTestUtils.setField(value,"codes",generator(em));return value;}
    StudentService studentService(){return studentService(em);}
    ExamSnapshotReadService snapshots(EntityManager context){
        var jdbc=context.unwrap(org.hibernate.Session.class).doReturningWork(connection->new org.springframework.jdbc.core.JdbcTemplate(new org.springframework.jdbc.datasource.SingleConnectionDataSource(connection,true)));
        return new ExamSnapshotReadService(jdbc,new com.fasterxml.jackson.databind.ObjectMapper());
    }
    StudentService studentService(EntityManager context){var r=new JpaRepositoryFactory(context);var value=new StudentService(r.getRepository(UserRepository.class),r.getRepository(ExamSessionStudentRepository.class),r.getRepository(ExamSessionRepository.class),r.getRepository(ExamAttemptRepository.class),r.getRepository(ExamQuestionRepository.class),r.getRepository(CloRepository.class),r.getRepository(StudentAnswerRepository.class),mock(AntiCheatService.class),snapshots(context));ReflectionTestUtils.setField(value,"em",context);return value;}
    @Test void publishedRosterIsExplicitIdempotentAndIndependentFromRoomTemplate(){
        var org=organization();var admin=account("assigned-admin","admin");var teacher=em.find(UserEntity.class,teacherId);var a=account("SV001","student");var b=account("SV002","student");var outsider=account("SV003","student");
        long examId=simpleExam();org.saveRoom(admin,null,new ExamOrganizationService.RoomInput("ROOM-A","Phòng A","active"));long roomId=((Number)em.createNativeQuery("SELECT id FROM exam_rooms WHERE code='ROOM-A'").getSingleResult()).longValue();
        org.members(admin,roomId,new ExamOrganizationService.Ids(List.of(a.getId(),a.getId(),b.getId())),false);assertEquals(2,count("exam_room_students"));
        org.teachers(admin,roomId,new ExamOrganizationService.Ids(List.of(teacherId)));
        var start=ExamOrganizationService.now().minusMinutes(1);
        long id=((Number)org.saveSession(teacher,null,new ExamOrganizationService.SessionInput(examId,roomId,"Ca phân công",start,start.plusHours(2))).get("id")).longValue();
        var students=studentService();assertTrue(students.getSessions(a.getId()).isEmpty());
        assertThrows(ApiException.class,()->students.startExam(a.getId(),id,null));
        org.publish(teacher,id);org.publish(teacher,id);assertEquals(2,count("exam_session_students"));
        assertEquals(1,students.getSessions(a.getId()).size());assertTrue(students.getSessions(outsider.getId()).isEmpty());
        assertThrows(ApiException.class,()->students.startExam(outsider.getId(),id,null));assertEquals(0,count("exam_attempts"));
        org.members(admin,roomId,new ExamOrganizationService.Ids(List.of(outsider.getId())),false);assertEquals(3,count("exam_room_students"));assertEquals(2,count("exam_session_students"));
        var attempt=students.startExam(a.getId(),id,null);var resumed=students.startExam(a.getId(),id,null);assertEquals(attempt.attemptId(),resumed.attemptId());assertEquals(1,count("exam_attempts"));
        assertThrows(ApiException.class,()->org.members(admin,roomId,new ExamOrganizationService.Ids(List.of(a.getId())),true));
        assertThrows(ApiException.class,()->students.getAttempt(outsider.getId(),attempt.attemptId()));
        assertThrows(ApiException.class,()->org.saveSession(teacher,id,new ExamOrganizationService.SessionInput(examId,roomId,"Changed",start,start.plusHours(3))));
        var live=org.sessions(admin,true,"ROOM-A",0,20);assertEquals(1,live.total());var row=live.items().get(0);
        assertEquals(2L,((Number)row.get("totalStudents")).longValue());assertEquals(1L,((Number)row.get("inProgress")).longValue());assertEquals(1L,((Number)row.get("notEntered")).longValue());
        assertThrows(ApiException.class,()->org.status(teacher,id,"cancelled"));
        students.submit(a.getId(),attempt.attemptId(),new com.examflow.backend.dto.SubmitExamRequest(List.of()));assertEquals(1,students.getResults(a.getId()).size());
        assertThrows(ApiException.class,()->students.startExam(a.getId(),id,null));
        assertEquals(1L,((Number)org.sessions(admin,true,"",0,20).items().get(0).get("submitted")).longValue());
    }
    @Test void reportUsesOneEligibleScorePopulationForBinsAverageAndThreshold(){
        long exam=simpleExam();em.find(Exam.class,exam).setTotalPoints(BigDecimal.TEN);
        var start=ExamOrganizationService.now().minusHours(2);
        long session=((Number)service.session(teacherId,null,new AdminCatalogService.SessionInput(exam,"Ca kiểm tra biểu đồ","CHART-CHECK",null,start,start.plusHours(3))).get("id")).longValue();
        BigDecimal[] scores={BigDecimal.ZERO,BigDecimal.valueOf(2),BigDecimal.valueOf(4),BigDecimal.valueOf(5),BigDecimal.valueOf(6),BigDecimal.valueOf(8),BigDecimal.TEN,null,BigDecimal.valueOf(-1),BigDecimal.valueOf(11)};
        for(int i=0;i<scores.length;i++){var a=new ExamAttempt();a.setExam(em.find(Exam.class,exam));a.setExamSession(em.find(ExamSession.class,session));a.setStudent(account("770000"+String.format("%04d",i),"student"));a.setStatus("submitted");a.setStartedAt(start);a.setSubmittedAt(start.plusMinutes(30));a.setScore(scores[i]);em.persist(a);}em.flush();
        var report=workspace().report(new AdminWorkspaceService.Filters("","","","",null,null,null));
        assertEquals(10L,((Number)report.get("completed")).longValue());assertEquals(7L,((Number)report.get("graded")).longValue());assertEquals(3L,((Number)report.get("ungraded")).longValue());assertEquals(4L,((Number)report.get("atLeastHalf")).longValue());
        @SuppressWarnings("unchecked") var bins=(List<Map<String,Object>>)report.get("distribution");assertEquals(7L,bins.stream().mapToLong(b->((Number)b.get("count")).longValue()).sum());assertEquals(2L,((Number)bins.get(4).get("count")).longValue());
        assertEquals(0,new BigDecimal("50.00").compareTo((BigDecimal)report.get("averagePercent")));
        em.find(Exam.class,exam).setTotalPoints(BigDecimal.ZERO);em.flush();var noGrades=workspace().report(new AdminWorkspaceService.Filters("","","","",null,null,null));assertEquals(0L,((Number)noGrades.get("graded")).longValue());assertTrue(((List<?>)noGrades.get("distribution")).isEmpty());assertEquals(0L,((Number)noGrades.get("atLeastHalf")).longValue());
    }
    @Test void warningSessionsGroupActiveEventsAndDrillDownStaysInsideSelectedSession(){
        long exam=simpleExam();var start=ExamOrganizationService.now().minusHours(1);var firstStudent=account("7600000001","student");var secondStudent=account("7600000002","student");
        long first=((Number)service.session(teacherId,null,new AdminCatalogService.SessionInput(exam,"Ca cảnh báo A","WARN-A",null,start,start.plusHours(2))).get("id")).longValue();
        long second=((Number)service.session(teacherId,null,new AdminCatalogService.SessionInput(exam,"Ca cảnh báo B","WARN-B",null,start,start.plusHours(2))).get("id")).longValue();
        long inactive=((Number)service.session(teacherId,null,new AdminCatalogService.SessionInput(exam,"Ca chỉ có sự kiện đã gỡ","WARN-INACTIVE",null,start,start.plusHours(2))).get("id")).longValue();
        for(int i=0;i<4;i++){
            var attempt=new ExamAttempt();attempt.setExam(em.find(Exam.class,exam));attempt.setExamSession(em.find(ExamSession.class,i<2?first:i==2?second:inactive));attempt.setStudent(i==1?secondStudent:firstStudent);attempt.setStatus("submitted");attempt.setStartedAt(start);em.persist(attempt);em.flush();
            em.createNativeQuery("INSERT INTO anti_cheat_events(attempt_id,event,active,module,occurred_at) VALUES(:attempt,'TEST_WARNING',:active,:module,NOW())").setParameter("attempt",attempt.getId()).setParameter("active",i!=3).setParameter("module",i==0?"M7":"M1").executeUpdate();
            if(i==0)em.createNativeQuery("INSERT INTO anti_cheat_events(attempt_id,event,active,module,occurred_at) VALUES(:attempt,'TEST_WARNING',TRUE,'M7',NOW())").setParameter("attempt",attempt.getId()).executeUpdate();
        }
        var workspace=workspace();var all=new AdminWorkspaceService.Filters("","","","",null,null,null);
        assertEquals(2,workspace.list("warning-sessions",all,0,1).total());assertEquals(1,workspace.list("warning-sessions",all,0,1).items().size());
        var selected=new AdminWorkspaceService.Filters("","","","",first,null,null);var page=workspace.list("warning-sessions",selected,0,20);assertEquals(1,page.total());var row=page.items().get(0);
        assertEquals(2L,((Number)row.get("warnedStudents")).longValue());assertEquals(2L,((Number)row.get("warnedAttempts")).longValue());assertEquals(2L,((Number)row.get("browserEvents")).longValue());assertEquals(1L,((Number)row.get("aiEvents")).longValue());
        var students=workspace.list("anti",selected,0,20);assertEquals(2,students.total());assertTrue(students.items().stream().allMatch(a->((Number)a.get("sessionId")).longValue()==first));
        assertEquals(1,workspace.list("warning-sessions",new AdminWorkspaceService.Filters("warn-a","","","",null,null,null),0,20).total());
        assertEquals(0,workspace.list("warning-sessions",new AdminWorkspaceService.Filters("","","","",inactive,null,null),0,20).total());
    }
    @Test void roomAndCoursePermissionsAndFutureVisibilityAreEnforced(){
        var org=organization();var admin=account("policy-admin","admin");var teacher=em.find(UserEntity.class,teacherId);var otherTeacher=account("other-teacher","teacher");var a=account("SV101","student");long examId=simpleExam();
        org.saveRoom(admin,null,new ExamOrganizationService.RoomInput("ROOM-B","Phòng B","active"));long roomId=((Number)em.createNativeQuery("SELECT id FROM exam_rooms WHERE code='ROOM-B'").getSingleResult()).longValue();
        assertThrows(ApiException.class,()->org.saveRoom(teacher,null,new ExamOrganizationService.RoomInput("ROOM-X","X","active")));
        assertThrows(ApiException.class,()->org.roomDetail(otherTeacher,roomId));org.teachers(admin,roomId,new ExamOrganizationService.Ids(List.of(teacherId,otherTeacher.getId())));
        org.members(admin,roomId,new ExamOrganizationService.Ids(List.of(a.getId())),false);var start=ExamOrganizationService.now().plusDays(1);
        assertThrows(ApiException.class,()->org.saveSession(otherTeacher,null,new ExamOrganizationService.SessionInput(examId,roomId,"Wrong course",start,start.plusHours(1))));
        long id=((Number)org.saveSession(teacher,null,new ExamOrganizationService.SessionInput(examId,roomId,"Ca ngày mai",start,start.plusHours(1))).get("id")).longValue();org.publish(teacher,id);
        assertTrue(studentService().getSessions(a.getId()).isEmpty());assertThrows(ApiException.class,()->studentService().startExam(a.getId(),id,null));assertEquals(0,org.sessions(admin,true,"",0,20).total());
        org.members(admin,roomId,new ExamOrganizationService.Ids(List.of(a.getId())),true);assertEquals(1,count("exam_session_students"));
        assertThrows(ApiException.class,()->org.deleteRoom(admin,roomId));
        org.status(teacher,id,"cancelled");assertTrue(studentService().getSessions(a.getId()).isEmpty());
        org.deleteRoom(admin,roomId);assertEquals(0,count("exam_rooms"));assertEquals(1,count("exam_sessions"));assertEquals(1,count("exam_session_students"));
    }
    @Test void emptyRoomsCannotPublishAndClassProfilesAreManagedByAdmin(){
        var org=organization();var admin=account("class-admin","admin");var student=account("SV201","student");var teacher=em.find(UserEntity.class,teacherId);long examId=simpleExam();
        org.saveClass(admin,null,new ExamOrganizationService.ClassInput("CNTT24","CNTT K24","CNTT","active"));long classId=((Number)em.createNativeQuery("SELECT id FROM student_classes").getSingleResult()).longValue();
        org.profile(admin,student.getId(),new ExamOrganizationService.ProfileInput(student.getFullName(),"CNTT",classId));
        assertEquals(1,org.students(admin,"SV201",classId,"CNTT",0,20).total());assertThrows(ApiException.class,()->org.deleteClass(admin,classId));
        assertThrows(ApiException.class,()->org.profile(teacher,student.getId(),new ExamOrganizationService.ProfileInput(student.getFullName(),"CNTT",null)));
        org.saveRoom(admin,null,new ExamOrganizationService.RoomInput("ROOM-C","Phòng C","active"));long roomId=((Number)em.createNativeQuery("SELECT id FROM exam_rooms").getSingleResult()).longValue();org.teachers(admin,roomId,new ExamOrganizationService.Ids(List.of(teacherId)));
        var start=ExamOrganizationService.now();long id=((Number)org.saveSession(teacher,null,new ExamOrganizationService.SessionInput(examId,roomId,"Empty roster",start,start.plusHours(1))).get("id")).longValue();assertThrows(ApiException.class,()->org.publish(teacher,id));
        assertEquals(0,count("exam_session_students"));
    }
    @Test void liveMetricsUseSessionDeadlineForLongRunningWorkAndWarnings(){
        var org=organization();var admin=account("metrics-admin","admin");var teacher=em.find(UserEntity.class,teacherId);var a=account("SV301","student");var b=account("SV302","student");long examId=simpleExam();
        org.saveRoom(admin,null,new ExamOrganizationService.RoomInput("METRICS","Phòng thống kê","active"));long roomId=((Number)em.createNativeQuery("SELECT id FROM exam_rooms").getSingleResult()).longValue();org.members(admin,roomId,new ExamOrganizationService.Ids(List.of(a.getId(),b.getId())),false);org.teachers(admin,roomId,new ExamOrganizationService.Ids(List.of(teacherId)));
        var start=ExamOrganizationService.now().minusHours(2);long id=((Number)org.saveSession(teacher,null,new ExamOrganizationService.SessionInput(examId,roomId,"Ca A",start,start.plusHours(4))).get("id")).longValue();org.publish(teacher,id);
        org.saveRoom(admin,null,new ExamOrganizationService.RoomInput("METRICS-B","Phòng thống kê B","active"));
        long secondRoom=((Number)em.createNativeQuery("SELECT id FROM exam_rooms WHERE code='METRICS-B'").getSingleResult()).longValue();
        var c=account("SV303","student");var d=account("SV304","student");
        org.members(admin,secondRoom,new ExamOrganizationService.Ids(List.of(c.getId(),d.getId())),false);org.teachers(admin,secondRoom,new ExamOrganizationService.Ids(List.of(teacherId)));
        assertThrows(ApiException.class,()->org.saveSession(teacher,null,new ExamOrganizationService.SessionInput(examId,roomId,"Ca trùng",start,start.plusHours(3))));
        long second=((Number)org.saveSession(teacher,null,new ExamOrganizationService.SessionInput(examId,secondRoom,"Ca B",start,start.plusHours(3))).get("id")).longValue();org.publish(teacher,second);
        assertEquals(second,((Number)org.saveSession(teacher,null,new ExamOrganizationService.SessionInput(examId,secondRoom,"Ca B",start,start.plusHours(3))).get("id")).longValue());assertEquals(2,count("exam_sessions"));
        var attempt=new ExamAttempt();attempt.setExam(em.find(Exam.class,examId));attempt.setExamSession(em.find(ExamSession.class,id));attempt.setStudent(a);attempt.setStartedAt(start);attempt.setStatus("in_progress");em.persist(attempt);em.flush();
        var warning=new AntiCheatEvent();warning.setAttempt(attempt);warning.setEvent("NO_FACE");warning.setActive(true);em.persist(warning);
        var another=new AntiCheatEvent();another.setAttempt(attempt);another.setEvent("PHONE");another.setActive(true);em.persist(another);em.flush();
        var page=org.sessions(admin,true,"",0,20);assertEquals(2,page.total());var row=page.items().stream().filter(r->((Number)r.get("id")).longValue()==id).findFirst().orElseThrow();
        assertEquals(0L,((Number)row.get("expired")).longValue());assertEquals(1L,((Number)row.get("inProgress")).longValue());assertEquals(1L,((Number)row.get("warnedAttempts")).longValue());
        assertEquals(em.find(ExamSession.class,id).getEndTime(),studentService().getAttempt(a.getId(),attempt.getId()).endTime());
        var future=ExamOrganizationService.now().plusDays(1);long draft=((Number)org.saveSession(teacher,null,new ExamOrganizationService.SessionInput(examId,roomId,"Invalid answers",future,future.plusHours(1))).get("id")).longValue();
        em.createNativeQuery("UPDATE answers SET is_correct=FALSE").executeUpdate();assertThrows(ApiException.class,()->org.publish(teacher,draft));
    }
    @Test void monitoringRequiresExactExamAuthorEvenForSameRoomAndCourse(){
        var org=organization();var admin=account("scope-admin","admin");var author=em.find(UserEntity.class,teacherId);var colleague=account("colleague","teacher");var student=account("scope-student","student");long examId=simpleExam();
        org.saveRoom(admin,null,new ExamOrganizationService.RoomInput("SCOPE","Scope","active"));
        long roomId=((Number)em.createNativeQuery("SELECT id FROM exam_rooms").getSingleResult()).longValue();
        org.teachers(admin,roomId,new ExamOrganizationService.Ids(List.of(teacherId,colleague.getId())));
        org.members(admin,roomId,new ExamOrganizationService.Ids(List.of(student.getId())),false);
        em.createNativeQuery("INSERT INTO course_faculties(course_id,faculty_id) VALUES(:course,:teacher)").setParameter("course",em.find(Exam.class,examId).getCourse().getId()).setParameter("teacher",colleague.getId()).executeUpdate();
        var start=ExamOrganizationService.now().minusMinutes(1);
        long id=((Number)org.saveSession(author,null,new ExamOrganizationService.SessionInput(examId,roomId,"Scope",start,start.plusHours(1))).get("id")).longValue();org.publish(author,id);
        assertEquals(1,org.sessions(author,true,"",0,20).total());
        assertEquals(0,org.sessions(colleague,true,"",0,20).total());
        assertEquals(0,org.sessions(colleague,false,"",0,20).total());
        assertThrows(ApiException.class,()->org.detail(colleague,id));
        assertThrows(ApiException.class,()->org.status(colleague,id,"cancelled"));
        assertEquals(1,org.sessions(admin,true,"",0,20).total());
        em.find(Exam.class,examId).setCreatedBy(null);em.flush();
        assertEquals(0,org.sessions(author,true,"",0,20).total());
        assertThrows(ApiException.class,()->org.detail(author,id));
        assertNotNull(org.detail(admin,id));
    }
    @Test void legacyTeacherSessionCanBeAssignedAndPublishedByAdminWithoutChangingTeacherForm(){
        var org=organization();var admin=account("legacy-admin","admin");var student=account("LEGACY-NEW-STUDENT","student");long examId=simpleExam();
        var repositories=new JpaRepositoryFactory(em);
        var legacy=new TeacherExamSessionService(repositories.getRepository(ExamSessionRepository.class),repositories.getRepository(ExamRepository.class),repositories.getRepository(UserRepository.class),repositories.getRepository(ExamSessionStudentRepository.class),repositories.getRepository(ExamAttemptRepository.class));
        var start=ExamOrganizationService.now().minusMinutes(1);
        var created=legacy.create(new com.examflow.backend.dto.CreateExamSessionRequest(examId,"Ca giao diện cũ","LEGACY-NEW-CODE",null,start,start.plusHours(1),List.of()));
        assertNull(em.find(ExamSession.class,created.id()).getRoomId());
        assertNull(em.find(ExamSession.class,created.id()).getPublishedAt());
        assertTrue(studentService().getSessions(student.getId()).isEmpty());
        org.saveRoom(admin,null,new ExamOrganizationService.RoomInput("ADMIN-ASSIGNED","Phòng admin phân","active"));
        long roomId=((Number)em.createNativeQuery("SELECT id FROM exam_rooms").getSingleResult()).longValue();
        org.members(admin,roomId,new ExamOrganizationService.Ids(List.of(student.getId())),false);
        org.saveSession(admin,created.id(),new ExamOrganizationService.SessionInput(examId,roomId,"Ca giao diện cũ",start,start.plusHours(1)));
        org.publish(admin,created.id());
        assertEquals(1,studentService().getSessions(student.getId()).size());
        assertEquals(created.id(),studentService().getSessions(student.getId()).get(0).sessionId());
    }
    @Test void existingLegacyAttemptCanFinishWithoutOpeningLegacyRegistrationToOthers(){
        long examId=simpleExam();UserEntity a=account("LEGACY-A","student"),b=account("LEGACY-B","student");
        var s=new ExamSession();s.setExam(em.find(Exam.class,examId));s.setName("Ca cũ");s.setRoomCode("LEGACY");s.setAccessCode("LEGACY");s.setStatus("ongoing");s.setStartTime(ExamOrganizationService.now().minusMinutes(5));s.setEndTime(ExamOrganizationService.now().plusHours(1));em.persist(s);
        for(UserEntity user:List.of(a,b)){var r=new ExamSessionStudent();r.setExamSession(s);r.setStudent(user);r.setStatus("registered");em.persist(r);}
        var existing=new ExamAttempt();existing.setExam(s.getExam());existing.setExamSession(s);existing.setStudent(a);existing.setStartedAt(s.getStartTime());existing.setStatus("in_progress");em.persist(existing);em.flush();
        var students=studentService();assertEquals(1,students.getSessions(a.getId()).size());assertTrue(students.getSessions(b.getId()).isEmpty());
        assertEquals(existing.getId(),students.startExam(a.getId(),s.getId(),null).attemptId());assertThrows(ApiException.class,()->students.startExam(b.getId(),s.getId(),null));assertEquals(1,count("exam_attempts"));assertNull(s.getPublishedAt());
    }
    // Simulates an exam link supplied by the separate teacher implementation; not an admin action.
    void linkExamFixture(long group,long exam){em.createNativeQuery("UPDATE exam_sitting_groups SET exam_id=:exam WHERE id=:id").setParameter("exam",exam).setParameter("id",group).executeUpdate();}
    DepartmentExamService department(){return department(em);}
    @Test void minimal012CanRunAgainWithoutCreatingUnusedTablesOrChangingProfiles() throws Exception {
        var student=account("7500000001","student");student.setDepartment("Công nghệ thông tin");em.flush();long before=count("users");
        String migration=java.nio.file.Files.readString(java.nio.file.Path.of("../database/migrations/012_course_exam_allocation.sql")).replaceAll("(?m)^BEGIN;\\s*$", "").replaceAll("(?m)^COMMIT;\\s*$", "");
        em.unwrap(org.hibernate.Session.class).doWork(connection->{try(var statement=connection.createStatement()){statement.execute(migration);statement.execute(migration);}});
        assertEquals(before,count("users"));assertEquals("Công nghệ thông tin",em.find(UserEntity.class,student.getId()).getDepartment());
        for(String unused:List.of("course_students","exam_allocation_batches","exam_student_allocations"))assertNull(em.createNativeQuery("SELECT CAST(to_regclass(:name) AS text)").setParameter("name","public."+unused).getSingleResult());
        assertEquals(0L,((Number)em.createNativeQuery("SELECT COUNT(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='exam_sessions' AND column_name='allocation_batch_id'").getSingleResult()).longValue());
    }
    DepartmentExamService department(EntityManager context){var workspace=new AdminWorkspaceService(mock(AdminService.class));ReflectionTestUtils.setField(workspace,"em",context);var org=new ExamOrganizationService(mock(AdminService.class),workspace);ReflectionTestUtils.setField(org,"em",context);var service=new DepartmentExamService(mock(AdminService.class),org);ReflectionTestUtils.setField(service,"em",context);return service;}
    DepartmentExamService.Input departmentInput(java.util.UUID request,long period,long course,String token){var start=ExamOrganizationService.now().plusDays(3).withHour(8).withMinute(0).withSecond(0).withNano(0);return new DepartmentExamService.Input(request,period,course,"Công nghệ thông tin","Ca Cơ sở dữ liệu",start,start.plusHours(1),30,token);}
    @Test void departmentSittingCreatesOneCommonWindowAndFourPendingGroupsWithoutEnrollment(){
        var service=department();var admin=account("department-admin","admin");long exam=simpleExam(),course=em.find(Exam.class,exam).getCourse().getId();long period=period(allocation(),admin,"DEP-FINAL");
        var ids=new java.util.ArrayList<Long>();for(int n=0;n<100;n++){var s=account(String.format("700000%04d",n),"student");s.setDepartment("Công nghệ thông tin");ids.add(s.getId());}var outsider=account("7100000001","student");outsider.setDepartment("Kinh tế");em.flush();
        var request=java.util.UUID.randomUUID();var input=departmentInput(request,period,course,null);var preview=service.preview(admin,input);assertEquals(100,((Number)preview.get("remaining")).intValue());assertNull(em.createNativeQuery("SELECT CAST(to_regclass('public.course_students') AS text)").getSingleResult());assertNull(em.createNativeQuery("SELECT CAST(to_regclass('public.exam_student_allocations') AS text)").getSingleResult());assertNull(em.createNativeQuery("SELECT CAST(to_regclass('public.exam_allocation_batches') AS text)").getSingleResult());
        var result=service.create(admin,departmentInput(request,period,course,(String)preview.get("previewToken")));assertEquals(1,count("exam_sittings"));assertEquals(4,count("exam_sitting_groups"));assertEquals(100,count("exam_sitting_students"));assertEquals(0,count("exam_sessions"));
        @SuppressWarnings("unchecked") var groups=(List<Map<String,Object>>)result.get("groups");assertEquals(List.of(30L,30L,30L,10L),groups.stream().map(g->((Number)g.get("studentCount")).longValue()).toList());for(var group:groups){assertNull(group.get("roomId"));assertNull(group.get("teacherId"));assertNull(group.get("examId"));assertEquals(false,group.get("ready"));}
        assertThrows(ApiException.class,()->service.publishSitting(admin,((Number)result.get("id")).longValue()));assertEquals(0,count("exam_sessions"));
        @SuppressWarnings("unchecked") var proposed=(List<Map<String,Object>>)preview.get("groups");for(var group:proposed){assertEquals(input.startTime(),group.get("startTime"));assertEquals(input.endTime(),group.get("endTime"));}
        assertEquals(result,service.create(admin,departmentInput(request,period,course,(String)preview.get("previewToken"))));assertEquals(0,((Number)service.candidates(admin,course,period,"Công nghệ thông tin").get("remaining")).intValue());
        long group=((Number)groups.get(0).get("id")).longValue();assertThrows(ApiException.class,()->service.publish(admin,group));assertTrue(studentService().getSessions(ids.get(0)).isEmpty());
        service.aiPolicy(admin,group,false);
        em.createNativeQuery("ALTER TABLE exam_sessions ALTER COLUMN access_code TYPE varchar(30)").executeUpdate();
        em.createNativeQuery("ALTER TABLE exam_sessions ALTER COLUMN room_code TYPE varchar(30)").executeUpdate();
        long room=allocationRoom(admin,"DEP-ROOM");service.assign(admin,group,new DepartmentExamService.Assignment(room,teacherId,null));linkExamFixture(group,exam);service.publish(admin,group);service.publish(admin,group);assertEquals(1,count("exam_sessions"));assertEquals(30,count("exam_session_students"));assertTrue(studentService().getSessions(ids.get(0)).isEmpty());
        long session=((Number)em.createNativeQuery("SELECT id FROM exam_sessions").getSingleResult()).longValue();var entity=em.find(ExamSession.class,session);assertTrue(entity.getRoomCode().matches("CTG-[0-9A-Z]+"));assertTrue(entity.getRoomCode().length()<=30);assertEquals(entity.getRoomCode(),entity.getAccessCode());assertEquals(false,entity.getAiEnabled());entity.setStartTime(ExamOrganizationService.now().minusMinutes(1));entity.setEndTime(ExamOrganizationService.now().plusMinutes(59));em.flush();
        assertEquals(1,studentService().getSessions(ids.get(0)).size());assertTrue(studentService().getSessions(ids.get(31)).isEmpty());assertTrue(studentService().getSessions(outsider.getId()).isEmpty());assertThrows(ApiException.class,()->studentService().startExam(outsider.getId(),session,null));assertNotNull(studentService().startExam(ids.get(0),session,null));assertThrows(ApiException.class,()->service.cancel(admin,group));
    }
    @Test void plannedSittingAppearsBeforePublicationAndWholeSittingPublishIsIdempotent(){
        var service=department();var admin=account("publish-all-admin","admin");long exam=simpleExam(),course=em.find(Exam.class,exam).getCourse().getId();long period=period(allocation(),admin,"PUBLISH-ALL");var student=account("7400123456","student");student.setDepartment("Công nghệ thông tin");em.flush();
        var request=java.util.UUID.randomUUID();var preview=service.preview(admin,departmentInput(request,period,course,null));var created=service.create(admin,departmentInput(request,period,course,(String)preview.get("previewToken")));long id=((Number)created.get("id")).longValue();
        var list=service.list(admin,"",0);assertEquals(1L,((Number)list.get("total")).longValue());var row=(Map<?,?>)((List<?>)list.get("items")).get(0);assertEquals("assignment",row.get("status"));assertEquals(0,count("exam_sessions"));
        long group=((Number)((Map<?,?>)((List<?>)created.get("groups")).get(0)).get("id")).longValue();long room=allocationRoom(admin,"PUBLISH-ROOM");
        service.assign(admin,group,new DepartmentExamService.Assignment(room,teacherId,null));assertEquals(1L,((Number)service.list(admin,"",0,"exam").get("total")).longValue());
        var otherTeacher=account("unassigned-teacher","teacher");assertThrows(ApiException.class,()->service.assign(admin,group,new DepartmentExamService.Assignment(room,teacherId,exam)));
        ApiException roomInUse=assertThrows(ApiException.class,()->organization().deleteRoom(admin,room));assertTrue(roomInUse.getMessage().contains("nhóm dự thi"));assertEquals(1L,((Number)em.createNativeQuery("SELECT COUNT(*) FROM exam_rooms WHERE id=:id").setParameter("id",room).getSingleResult()).longValue());
        service.assign(admin,group,new DepartmentExamService.Assignment(room,teacherId,null));linkExamFixture(group,exam);assertEquals(1L,((Number)service.list(admin,"",0,"ready").get("total")).longValue());
        service.assign(admin,group,new DepartmentExamService.Assignment(room,teacherId,null));assertEquals(1L,((Number)service.list(admin,"",0,"ready").get("total")).longValue());
        service.assign(admin,group,new DepartmentExamService.Assignment(room,otherTeacher.getId(),null));assertEquals(0L,((Number)service.list(admin,"",0,"ready").get("total")).longValue());assertNull(em.createNativeQuery("SELECT exam_id FROM exam_sitting_groups WHERE id=:id").setParameter("id",group).getSingleResult());
        service.assign(admin,group,new DepartmentExamService.Assignment(room,teacherId,null));linkExamFixture(group,exam);

        service.publishSitting(admin,id);service.publishSitting(admin,id);assertEquals(1,count("exam_sessions"));assertEquals(1L,((Number)service.list(admin,"",0,"published").get("total")).longValue());assertEquals(0L,((Number)service.list(admin,"",0,"ready").get("total")).longValue());
    }
    @Test void deletingRoomDetachesCancelledUnpublishedGroupAndPreservesRoster(){
        var service=department();var admin=account("delete-draft-admin","admin");long exam=simpleExam(),course=em.find(Exam.class,exam).getCourse().getId();long period=period(allocation(),admin,"DELETE-DRAFT");
        var student=account("7400123457","student");student.setDepartment("Công nghệ thông tin");em.flush();
        var request=java.util.UUID.randomUUID();var preview=service.preview(admin,departmentInput(request,period,course,null));var created=service.create(admin,departmentInput(request,period,course,(String)preview.get("previewToken")));
        long group=((Number)((Map<?,?>)((List<?>)created.get("groups")).get(0)).get("id")).longValue(),room=allocationRoom(admin,"DELETE-DRAFT-ROOM");
        service.assign(admin,group,new DepartmentExamService.Assignment(room,teacherId,null));
        assertThrows(ApiException.class,()->organization().deleteRoom(admin,room));
        service.cancel(admin,group);organization().deleteRoom(admin,room);
        assertEquals(0,count("exam_rooms"));assertEquals(1,count("exam_sittings"));assertEquals(1,count("exam_sitting_groups"));assertEquals(1,count("exam_sitting_students"));
        assertNull(em.createNativeQuery("SELECT room_id FROM exam_sitting_groups WHERE id=:id").setParameter("id",group).getSingleResult());
        assertEquals("cancelled",em.createNativeQuery("SELECT status FROM exam_sitting_groups WHERE id=:id").setParameter("id",group).getSingleResult());
    }
    @Test void deletingRoomDetachesCancelledPublishedSessionWithoutDeletingExamHistory(){
        var service=department();var admin=account("delete-session-admin","admin");long exam=simpleExam(),course=em.find(Exam.class,exam).getCourse().getId();long period=period(allocation(),admin,"DELETE-SESSION");
        var student=account("7400123458","student");student.setDepartment("Công nghệ thông tin");em.flush();
        var request=java.util.UUID.randomUUID();var preview=service.preview(admin,departmentInput(request,period,course,null));var created=service.create(admin,departmentInput(request,period,course,(String)preview.get("previewToken")));
        long group=((Number)((Map<?,?>)((List<?>)created.get("groups")).get(0)).get("id")).longValue(),room=allocationRoom(admin,"DELETE-SESSION-ROOM");
        service.assign(admin,group,new DepartmentExamService.Assignment(room,teacherId,null));linkExamFixture(group,exam);service.publishSitting(admin,((Number)created.get("id")).longValue());
        String roomCode=(String)em.createNativeQuery("SELECT room_code FROM exam_sessions").getSingleResult();
        service.cancel(admin,group);organization().deleteRoom(admin,room);
        assertEquals(0,count("exam_rooms"));assertEquals(1,count("exam_sessions"));assertEquals(1,count("exam_session_students"));assertEquals(1,count("exam_sitting_students"));
        assertNull(em.createNativeQuery("SELECT room_id FROM exam_sessions").getSingleResult());assertNull(em.createNativeQuery("SELECT room_id FROM exam_sitting_groups").getSingleResult());
        assertEquals(roomCode,em.createNativeQuery("SELECT room_code FROM exam_sessions").getSingleResult());assertEquals("cancelled",em.createNativeQuery("SELECT status FROM exam_sessions").getSingleResult());
    }
    @Test void deletingRoomWithCancelledSessionAndSubmittedAttemptStillProtectsHistory(){
        var org=organization();var admin=account("delete-attempt-admin","admin");var student=account("7400123459","student");long exam=simpleExam(),room=allocationRoom(admin,"DELETE-ATTEMPT-ROOM");
        var session=new ExamSession();session.setExam(em.find(Exam.class,exam));session.setName("Ca đã hủy có bài làm");session.setRoomId(room);session.setRoomCode("DELETE-ATTEMPT-ROOM");session.setAccessCode("DELETE-ATTEMPT");session.setStatus("cancelled");session.setStartTime(ExamOrganizationService.now().minusHours(2));session.setEndTime(ExamOrganizationService.now().minusHours(1));em.persist(session);
        var attempt=new ExamAttempt();attempt.setExam(session.getExam());attempt.setExamSession(session);attempt.setStudent(student);attempt.setStartedAt(session.getStartTime());attempt.setStatus("submitted");em.persist(attempt);em.flush();
        ApiException error=assertThrows(ApiException.class,()->org.deleteRoom(admin,room));assertTrue(error.getMessage().contains("bài làm"));
        assertEquals(1,count("exam_rooms"));assertEquals(1,count("exam_attempts"));assertEquals(room,((Number)em.createNativeQuery("SELECT room_id FROM exam_sessions").getSingleResult()).longValue());
    }
    @Test void departmentGroupReservationsValidateRoomTeacherCapacityAndCancellation(){
        var service=department();var admin=account("group-admin","admin");long exam=simpleExam(),course=em.find(Exam.class,exam).getCourse().getId();long period=period(allocation(),admin,"GROUP-FINAL");for(int i=0;i<31;i++){var s=account("720000"+String.format("%04d",i),"student");s.setDepartment("Công nghệ thông tin");}em.flush();
        var request=java.util.UUID.randomUUID();var preview=service.preview(admin,departmentInput(request,period,course,null));var result=service.create(admin,departmentInput(request,period,course,(String)preview.get("previewToken")));@SuppressWarnings("unchecked") var groups=(List<Map<String,Object>>)result.get("groups");long first=((Number)groups.get(0).get("id")).longValue(),second=((Number)groups.get(1).get("id")).longValue();
        long room=allocationRoom(admin,"GROUP-ROOM");organization().saveRoom(admin,null,new ExamOrganizationService.RoomInput("SMALL-ROOM","Phòng nhỏ","active",20));long small=((Number)em.createNativeQuery("SELECT id FROM exam_rooms WHERE code='SMALL-ROOM'").getSingleResult()).longValue();assertThrows(ApiException.class,()->service.assign(admin,first,new DepartmentExamService.Assignment(small,null,null)));
        service.assign(admin,first,new DepartmentExamService.Assignment(room,teacherId,null));assertThrows(ApiException.class,()->service.assign(admin,second,new DepartmentExamService.Assignment(room,null,null)));assertThrows(ApiException.class,()->service.assign(admin,second,new DepartmentExamService.Assignment(null,teacherId,null)));
        service.assign(admin,second,new DepartmentExamService.Assignment(null,null,null));assertEquals(0,count("exam_sessions"));service.cancel(admin,first);assertEquals(30,((Number)service.candidates(admin,course,period,"Công nghệ thông tin").get("remaining")).intValue());assertEquals(31,count("exam_sitting_students"));
        service.assign(admin,second,new DepartmentExamService.Assignment(room,teacherId,null));linkExamFixture(second,exam);assertThrows(ApiException.class,()->service.publish(account("not-admin","student"),second));
        long retake=period(allocation(),admin,"GROUP-RETAKE");assertThrows(ApiException.class,()->service.preview(admin,departmentInput(java.util.UUID.randomUUID(),retake,course,null)));
    }
    @Test void departmentPreviewDetectsProfileChangesBeforeCreation(){
        var service=department();var admin=account("profile-change-admin","admin");long course=course("DEP-COURSE"),period=period(allocation(),admin,"DEP-CHANGE");var student=account("7300000001","student");student.setDepartment("Công nghệ thông tin");em.flush();var request=java.util.UUID.randomUUID();var preview=service.preview(admin,departmentInput(request,period,course,null));var extra=account("7300000002","student");extra.setDepartment("Công nghệ thông tin");em.flush();assertThrows(ApiException.class,()->service.create(admin,departmentInput(request,period,course,(String)preview.get("previewToken"))));assertEquals(0,count("exam_sittings"));assertThrows(ApiException.class,()->service.options(student));assertThrows(ApiException.class,()->service.options(em.find(UserEntity.class,teacherId)));
    }
    @Test @Order(Integer.MAX_VALUE-2) void concurrentDepartmentRequestsCreateOneSittingAndOneSeat() throws Exception {
        var service=department();var admin=account("department-race","admin");long course=course("DEP-RACE"),period=period(allocation(),admin,"DEP-RACE-PERIOD");var student=account("7400000001","student");student.setDepartment("Công nghệ thông tin");em.flush();var request=java.util.UUID.randomUUID();var preview=service.preview(admin,departmentInput(request,period,course,null));var input=departmentInput(request,period,course,(String)preview.get("previewToken"));em.getTransaction().commit();
        var workers=java.util.concurrent.Executors.newFixedThreadPool(2);var gate=new java.util.concurrent.CountDownLatch(1);java.util.concurrent.Callable<Object> run=()->{var context=factory.createEntityManager();context.getTransaction().begin();try{gate.await(10,TimeUnit.SECONDS);var value=department(context).create(admin,input);context.getTransaction().commit();return value;}catch(Exception error){context.getTransaction().rollback();throw error;}finally{context.close();}};
        try{var one=workers.submit(run);var two=workers.submit(run);gate.countDown();assertEquals(one.get(30,TimeUnit.SECONDS),two.get(30,TimeUnit.SECONDS));assertEquals(1,count("exam_sittings"));assertEquals(1,count("exam_sitting_students"));}finally{gate.countDown();workers.shutdownNow();workers.awaitTermination(5,TimeUnit.SECONDS);em.getTransaction().begin();em.createNativeQuery("TRUNCATE TABLE users,courses,exam_periods CASCADE").executeUpdate();em.getTransaction().commit();}
    }
    CourseAllocationService allocation(){return allocation(em);}
    CourseAllocationService allocation(EntityManager context){var value=new CourseAllocationService(mock(AdminService.class));ReflectionTestUtils.setField(value,"em",context);ReflectionTestUtils.setField(value,"codes",generator(context));return value;}
    long period(CourseAllocationService allocation,UserEntity admin,String code){allocation.period(admin,new CourseAllocationService.PeriodInput(code,code));return ((Number)em.createNativeQuery("SELECT id FROM exam_periods WHERE code=:code").setParameter("code",code).getSingleResult()).longValue();}
    long allocationRoom(UserEntity admin,String code){organization().saveRoom(admin,null,new ExamOrganizationService.RoomInput(code,code,"active",40));return ((Number)em.createNativeQuery("SELECT id FROM exam_rooms WHERE code=:code").setParameter("code",code).getSingleResult()).longValue();}
    @Test void scheduleEditPreservesAssignmentsAndSynchronizesPublishedFutureSession(){
        var service=department();var admin=account("schedule-admin","admin");long exam=simpleExam(),course=em.find(Exam.class,exam).getCourse().getId();long period=period(allocation(),admin,"SCHEDULE");
        var student=account("7500000001","student");student.setDepartment("Công nghệ thông tin");em.flush();
        var request=java.util.UUID.randomUUID();var input=departmentInput(request,period,course,null);var preview=service.preview(admin,input);var created=service.create(admin,departmentInput(request,period,course,(String)preview.get("previewToken")));
        long id=((Number)created.get("id")).longValue(),group=((Number)((Map<?,?>)((List<?>)created.get("groups")).get(0)).get("id")).longValue();
        var draftEdit=new DepartmentExamService.ScheduleInput("Ca đã đổi tên",input.startTime().plusHours(2),input.endTime().plusHours(2),input.startTime(),input.endTime());
        service.schedule(admin,id,draftEdit);assertEquals(1,count("exam_sitting_students"));assertEquals(0,count("exam_sessions"));
        assertThrows(ApiException.class,()->service.schedule(admin,id,draftEdit));
        long room=allocationRoom(admin,"SCHEDULE-ROOM");service.assign(admin,group,new DepartmentExamService.Assignment(room,teacherId,null));linkExamFixture(group,exam);service.publishSitting(admin,id);
        long sessionId=((Number)em.createNativeQuery("SELECT session_id FROM exam_sitting_groups WHERE id=:id").setParameter("id",group).getSingleResult()).longValue();
        em.flush();em.refresh(em.find(ExamSession.class,sessionId));var before=em.find(ExamSession.class,sessionId).getPublishedAt();String code=em.find(ExamSession.class,sessionId).getRoomCode();
        var moved=new DepartmentExamService.ScheduleInput("Ca đổi lịch đã công bố",draftEdit.startTime().plusHours(2),draftEdit.endTime().plusHours(2),draftEdit.startTime(),draftEdit.endTime());
        service.schedule(admin,id,moved);em.flush();em.clear();var session=em.find(ExamSession.class,sessionId);
        assertEquals(moved.startTime(),session.getStartTime());assertEquals(moved.endTime(),session.getEndTime());assertEquals(before.truncatedTo(java.time.temporal.ChronoUnit.MICROS),session.getPublishedAt());assertEquals(code,session.getRoomCode());assertEquals(exam,session.getExam().getId());assertEquals(room,session.getRoomId());assertEquals(1,count("exam_session_students"));
        assertTrue((Boolean)service.detail(admin,id).get("canEditSchedule"));
        assertThrows(ApiException.class,()->service.schedule(student,id,new DepartmentExamService.ScheduleInput("Denied",moved.startTime(),moved.endTime(),moved.startTime(),moved.endTime())));
        var attempt=new ExamAttempt();attempt.setExam(session.getExam());attempt.setExamSession(session);attempt.setStudent(student);attempt.setStatus("completed");attempt.setStartedAt(ExamOrganizationService.now());em.persist(attempt);em.flush();
        assertFalse((Boolean)service.detail(admin,id).get("canEditSchedule"));assertThrows(ApiException.class,()->service.schedule(admin,id,new DepartmentExamService.ScheduleInput("No change",moved.startTime().plusHours(1),moved.endTime().plusHours(1),moved.startTime(),moved.endTime())));
    }
    @Test void scheduleEditRejectsOverlapsAndStartedPublishedSessions(){
        var service=department();var admin=account("schedule-conflict-admin","admin");long exam=simpleExam(),course=em.find(Exam.class,exam).getCourse().getId();long period=period(allocation(),admin,"SCHEDULE-CONFLICT");
        var student=account("7500000002","student");student.setDepartment("Công nghệ thông tin");em.flush();
        var request=java.util.UUID.randomUUID();var input=departmentInput(request,period,course,null);var preview=service.preview(admin,input);var created=service.create(admin,departmentInput(request,period,course,(String)preview.get("previewToken")));
        long id=((Number)created.get("id")).longValue(),group=((Number)((Map<?,?>)((List<?>)created.get("groups")).get(0)).get("id")).longValue(),room=allocationRoom(admin,"SCHEDULE-CONFLICT-R");service.assign(admin,group,new DepartmentExamService.Assignment(room,teacherId,null));linkExamFixture(group,exam);
        var future=input.startTime().plusHours(3);organization().saveSession(admin,null,new ExamOrganizationService.SessionInput(exam,room,"Other room booking",future,future.plusHours(1)));
        assertThrows(ApiException.class,()->service.schedule(admin,id,new DepartmentExamService.ScheduleInput("Overlap",future,future.plusHours(1),input.startTime(),input.endTime())));
        assertEquals(input.startTime(),service.detail(admin,id).get("startTime"));
        assertThrows(ApiException.class,()->service.schedule(admin,id,new DepartmentExamService.ScheduleInput("Too long",future,future.plusHours(9),input.startTime(),input.endTime())));
        service.publishSitting(admin,id);long sessionId=((Number)em.createNativeQuery("SELECT session_id FROM exam_sitting_groups WHERE id=:id").setParameter("id",group).getSingleResult()).longValue();
        em.find(ExamSession.class,sessionId).setStartTime(ExamOrganizationService.now().minusMinutes(1));em.flush();
        assertFalse((Boolean)service.detail(admin,id).get("canEditSchedule"));assertThrows(ApiException.class,()->service.schedule(admin,id,new DepartmentExamService.ScheduleInput("Started",future.plusHours(2),future.plusHours(3),input.startTime(),input.endTime())));
    }
    @Test void timingMigrationPreservesPaperAndSessionSchedule() throws Exception {
        long examId=simpleExam();
        var start=ExamOrganizationService.now().plusHours(1).truncatedTo(java.time.temporal.ChronoUnit.MICROS);
        long sessionId=((Number)service.session(teacherId,null,new AdminCatalogService.SessionInput(examId,"Timing migration",null,null,start,start.plusMinutes(30))).get("id")).longValue();
        em.createNativeQuery("ALTER TABLE exams ADD COLUMN duration_minutes integer NOT NULL DEFAULT 60").executeUpdate();
        em.createNativeQuery("CREATE VIEW vw_exam_summary WITH (security_invoker=true) AS SELECT id,duration_minutes FROM exams").executeUpdate();
        em.createNativeQuery("COMMENT ON VIEW vw_exam_summary IS 'Timing report test'").executeUpdate();
        em.createNativeQuery("GRANT SELECT ON vw_exam_summary TO PUBLIC").executeUpdate();
        String migration=java.nio.file.Files.readString(java.nio.file.Path.of("../database/migrations/016_session_based_exam_timing.sql"))
                .replaceAll("(?m)^BEGIN;\\s*$", "").replaceAll("(?m)^COMMIT;\\s*$", "");
        em.unwrap(org.hibernate.Session.class).doWork(connection->{try(var statement=connection.createStatement()){statement.execute(migration);statement.execute(migration);}});
        assertEquals(0,((Number)em.createNativeQuery("SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='exams' AND column_name='duration_minutes'").getSingleResult()).longValue());
        em.clear();
        assertEquals("Đề kiểm thử trạng thái",em.find(Exam.class,examId).getTitle());
        ExamSession scheduled=em.find(ExamSession.class,sessionId);
        assertEquals(start,scheduled.getStartTime());assertEquals(start.plusMinutes(30),scheduled.getEndTime());
        assertFalse(service.reviewExam(examId).containsKey("durationMinutes"));
        assertEquals(0,((Number)em.createNativeQuery("SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='vw_exam_summary' AND column_name='duration_minutes'").getSingleResult()).longValue());
        assertEquals(1,((Number)em.createNativeQuery("SELECT count(*) FROM vw_exam_summary WHERE id=:id").setParameter("id",examId).getSingleResult()).longValue());
        assertTrue((Boolean)em.createNativeQuery("SELECT has_table_privilege('public.vw_exam_summary','SELECT')").getSingleResult());
        assertEquals("Timing report test",em.createNativeQuery("SELECT obj_description('public.vw_exam_summary'::regclass,'pg_class')").getSingleResult());
        assertEquals("security_invoker=true",em.createNativeQuery("SELECT unnest(reloptions) FROM pg_class WHERE oid='public.vw_exam_summary'::regclass").getSingleResult());
        assertNotNull(workspace().list("exams",new AdminWorkspaceService.Filters("","","","",null,null,null),0,20));
    }
    @Test @Order(Integer.MAX_VALUE) void simultaneousStartRequestsCreateOneAttempt() throws Exception {
        var org=organization();var admin=account("race-admin","admin");var student=account("SV401","student");var teacher=em.find(UserEntity.class,teacherId);long examId=simpleExam();
        org.saveRoom(admin,null,new ExamOrganizationService.RoomInput("RACE-ROOM","Phòng kiểm thử đồng thời","active"));long roomId=((Number)em.createNativeQuery("SELECT id FROM exam_rooms").getSingleResult()).longValue();org.members(admin,roomId,new ExamOrganizationService.Ids(List.of(student.getId())),false);org.teachers(admin,roomId,new ExamOrganizationService.Ids(List.of(teacherId)));
        var start=ExamOrganizationService.now().minusMinutes(1);long id=((Number)org.saveSession(teacher,null,new ExamOrganizationService.SessionInput(examId,roomId,"Ca đồng thời",start,start.plusHours(1))).get("id")).longValue();org.publish(teacher,id);
        em.getTransaction().commit();
        var workers=java.util.concurrent.Executors.newFixedThreadPool(2);var ready=new java.util.concurrent.CountDownLatch(2);var go=new java.util.concurrent.CountDownLatch(1);
        java.util.concurrent.Callable<Long> call=()->{EntityManager context=factory.createEntityManager();context.getTransaction().begin();try{ready.countDown();if(!go.await(10,TimeUnit.SECONDS))throw new IllegalStateException("Start gate timeout");Long attempt=studentService(context).startExam(student.getId(),id,null).attemptId();context.getTransaction().commit();return attempt;}catch(Exception failure){if(context.getTransaction().isActive())context.getTransaction().rollback();throw failure;}finally{context.close();}};
        try{var one=workers.submit(call);var two=workers.submit(call);assertTrue(ready.await(10,TimeUnit.SECONDS));go.countDown();assertEquals(one.get(30,TimeUnit.SECONDS),two.get(30,TimeUnit.SECONDS));assertEquals(1,count("exam_attempts"));}
        finally{go.countDown();workers.shutdownNow();workers.awaitTermination(5,TimeUnit.SECONDS);}
    }
}
