package com.examflow.backend.service;

import com.examflow.backend.dto.QuickExamRequest;
import com.examflow.backend.entity.*;
import com.examflow.backend.exception.ApiException;
import jakarta.persistence.*;
import jakarta.validation.constraints.*;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.time.*;
import java.util.*;

/** Admin-only catalog mutations; existing student and teacher APIs are unchanged. */
@Service
public class AdminCatalogService {
    @org.springframework.beans.factory.annotation.Autowired private QuestionBankStatsService bankStats;
    @org.springframework.beans.factory.annotation.Autowired private ExamSnapshotReadService snapshots;
    @org.springframework.beans.factory.annotation.Autowired private AdminCodeGenerator codes;
    @PersistenceContext private EntityManager em;
    private final AdminService audit;
    private final TeacherExamService examBuilder;
    public AdminCatalogService(AdminService audit, TeacherExamService examBuilder) { this.audit=audit; this.examBuilder=examBuilder; }
    public record CourseInput(@Size(max=20) String code, @NotBlank @Size(max=200) String name,
            @Min(1) @Max(30) int credits, @Size(max=100) String department, @Size(max=4000) String description,
            @NotNull Long teacherId, @NotBlank String status) {}
    public record ExamInput(@Size(max=20) String code, @NotBlank @Size(max=200) String title,
            boolean shuffleQuestions, boolean shuffleAnswers) {}
    // Separate admin input keeps the teacher's existing manual-code validation unchanged.
    public record QuickExamInput(@NotNull Long courseId,@NotBlank @Size(max=200) String title,@Size(max=20) String code,
            @Min(1) @Max(500) int totalQuestions,
            @DecimalMin("0") @DecimalMax("100") double mediumPercent,
            @DecimalMin("0") @DecimalMax("100") double goodPercent,
            @DecimalMin("0") @DecimalMax("100") double excellentPercent,
            @DecimalMin("0") @DecimalMax("100") double maxOverlapPercent,
            List<Long> cloIds,boolean shuffleQuestions,boolean shuffleAnswers,boolean antiCheatMode) {
        public QuickExamRequest request(){return new QuickExamRequest(courseId,title,null,totalQuestions,mediumPercent,goodPercent,excellentPercent,maxOverlapPercent,cloIds,shuffleQuestions,shuffleAnswers,antiCheatMode);}
    }
    public record SessionInput(@NotNull Long examId, @NotBlank @Size(max=200) String name,
            @Size(max=20) String code, Long classId, @NotNull LocalDateTime startTime, @NotNull LocalDateTime endTime) {}
    private static String clean(String s) { return s==null?"":s.trim(); }
    private static LocalDateTime now() { return LocalDateTime.now(ZoneId.of("Asia/Ho_Chi_Minh")); }
    private static ApiException conflict(String s) { return new ApiException(HttpStatus.CONFLICT,s); }
    private static ApiException invalid(String s) { return new ApiException(HttpStatus.BAD_REQUEST,s); }
    private <T> T require(Class<T> type, Long id, boolean lock) {
        if (id==null || id<=0) throw invalid("ID không hợp lệ");
        T row=lock?em.find(type,id,LockModeType.PESSIMISTIC_WRITE):em.find(type,id);
        if(row==null) throw new ApiException(HttpStatus.NOT_FOUND,"Bản ghi không còn tồn tại. Vui lòng tải lại danh sách.");
        return row;
    }
    private long count(String sql, Long id) { return ((Number)em.createNativeQuery(sql).setParameter("id",id).getSingleResult()).longValue(); }
    private String code(String text) {
        String result=clean(text).toUpperCase(Locale.ROOT);
        if(!result.matches("[A-Z0-9][A-Z0-9_-]{1,19}")) throw invalid("Mã gồm 2–20 ký tự chữ không dấu, số, dấu gạch ngang hoặc gạch dưới");
        return result;
    }
    private void unique(String table, String column, String value, Long id) {
        long duplicates=((Number)em.createNativeQuery("SELECT COUNT(*) FROM "+table+" WHERE LOWER("+column+")=LOWER(:code) AND id<>:id")
                .setParameter("code",value).setParameter("id",id==null?0:id).getSingleResult()).longValue();
        if(duplicates>0) throw conflict("Mã đã tồn tại. Vui lòng chọn mã khác.");
    }
    private void noCourseActivity(Long id) {
        if(count("SELECT COUNT(*) FROM exam_attempts a JOIN exams e ON e.id=a.exam_id WHERE e.course_id=:id AND a.status='in_progress'",id)>0)
            throw conflict("Không sửa học phần khi có sinh viên đang làm bài");
    }
    private void noExamUsage(Long id) {
        if(count("SELECT COUNT(*) FROM exam_sessions WHERE exam_id=:id",id)>0 || count("SELECT COUNT(*) FROM exam_attempts WHERE exam_id=:id",id)>0 || count("SELECT COUNT(*) FROM exam_sitting_groups WHERE exam_id=:id",id)>0)
            throw conflict("Đề đã có ca thi hoặc bài làm. Không sửa/xóa cấu trúc đề; hãy tạo đề mới.");
    }
    private void noSessionUsage(Long id) {
        if(count("SELECT COUNT(*) FROM exam_attempts WHERE exam_session_id=:id",id)>0)
            throw conflict("Ca thi đã có bài làm, không được sửa/xóa. Có thể dùng thao tác hủy hoặc kết thúc ca.");
    }
    private void noOtherReferences(String parent,Long id,Set<String> permittedTables) {
        // Inspect real FK relations as well: never silently cascade-delete an unanticipated child table.
        List<?> references=em.createNativeQuery("""
            SELECT ns.nspname,child.relname,col.attname
            FROM pg_constraint fk JOIN pg_class child ON child.oid=fk.conrelid
            JOIN pg_namespace ns ON ns.oid=child.relnamespace
            JOIN pg_attribute col ON col.attrelid=child.oid AND col.attnum=fk.conkey[1]
            WHERE fk.contype='f' AND fk.confrelid=to_regclass(:parent) AND cardinality(fk.conkey)=1
            """).setParameter("parent","public."+parent).getResultList();
        for(Object item:references) {
            Object[] ref=(Object[])item;
            if("public".equals(ref[0].toString()) && permittedTables.contains(ref[1].toString())) continue;
            String table=quote(ref[0].toString())+"."+quote(ref[1].toString());
            if(count("SELECT COUNT(*) FROM "+table+" WHERE "+quote(ref[2].toString())+"=:id",id)>0)
                throw conflict("Bản ghi đang được dữ liệu khác sử dụng. Không thể xóa; hãy ngưng hoạt động hoặc hủy để giữ lịch sử.");
        }
    }
    private static String quote(String identifier) { return "\""+identifier.replace("\"","\"\"")+"\""; }
    private void changed(Long actor,String action,String target,Long id,String detail) {
        em.flush(); audit.audit(actor,action,target,id,detail);
    }
    static void updateExamSchedule(EntityManager em,Exam exam) {
        // The parent exam must reflect all its sessions, including when a draft is scheduled.
        em.flush();
        List<ExamSession> sessions=em.createQuery("SELECT s FROM ExamSession s WHERE s.exam.id=:id AND s.status<>'cancelled' ORDER BY s.startTime",ExamSession.class)
                .setParameter("id",exam.getId()).getResultList();
        LocalDateTime clock=now();
        List<ExamSession> remaining=sessions.stream().filter(s->Set.of("scheduled","ongoing").contains(s.getStatus()) && s.getEndTime().isAfter(clock)).toList();
        if(!remaining.isEmpty()) {
            ExamSession first=remaining.get(0);
            exam.setStatus(first.getStartTime().isAfter(clock)?"upcoming":"ongoing");exam.setExamDate(first.getStartTime());
        } else if(!sessions.isEmpty()) {
            exam.setStatus("completed");exam.setExamDate(sessions.get(0).getStartTime());
        } else if(((Number)em.createNativeQuery("SELECT COUNT(*) FROM exam_attempts WHERE exam_id=:id").setParameter("id",exam.getId()).getSingleResult()).longValue()==0) {
            exam.setStatus("draft");exam.setExamDate(null);
        } else {
            exam.setStatus("cancelled");
        }
    }
    @Transactional(readOnly=true)
    public Map<String,Object> options() {
        Map<String,Object> result=new LinkedHashMap<>();
        result.put("teachers", rows("SELECT id,full_name,username FROM users WHERE role IN ('teacher','faculty') AND status='active' ORDER BY full_name,id",new String[]{"id","name","code"}));
        result.put("courses", rows("SELECT id,name,code FROM courses WHERE status='active' ORDER BY code",new String[]{"id","name","code"}));
        result.put("exams", rows("SELECT e.id,e.title,e.code,c.code FROM exams e JOIN courses c ON c.id=e.course_id WHERE e.status NOT IN ('cancelled','completed') AND EXISTS(SELECT 1 FROM exam_questions q WHERE q.exam_id=e.id) ORDER BY e.id DESC",new String[]{"id","name","code","courseCode"}));
        result.put("classes", rows("SELECT id,name FROM classes ORDER BY name,id",new String[]{"id","name"}));
        return result;
    }
    private List<Map<String,Object>> rows(String sql,String[] names) {
        return em.createNativeQuery(sql).getResultList().stream().map(item->{Object[] values=(Object[])item;Map<String,Object> row=new LinkedHashMap<>();for(int i=0;i<names.length;i++) row.put(names[i],values[i]);return row;}).toList();
    }
    @Transactional(readOnly=true)
    public Map<String,Object> detail(String resource,Long id) {
        Map<String,Object> r=new LinkedHashMap<>(); r.put("id",id);
        switch(resource) {
            case "courses" -> { Course c=require(Course.class,id,false);r.put("code",c.getCode());r.put("name",c.getName());r.put("credits",c.getCredits());r.put("department",c.getDepartment());r.put("description",c.getDescription());r.put("teacherId",c.getCreatedBy());r.put("status",c.getStatus()); }
            case "exams" -> { Exam e=require(Exam.class,id,false);r.put("code",e.getCode());r.put("title",e.getTitle());r.put("shuffleQuestions",e.getShuffleQuestions());r.put("shuffleAnswers",e.getShuffleAnswers());r.put("status",e.getStatus()); }
            case "sessions" -> { ExamSession s=require(ExamSession.class,id,false);r.put("examId",s.getExam().getId());r.put("name",s.getName());r.put("code",s.getRoomCode());r.put("classId",s.getClassId());r.put("startTime",s.getStartTime());r.put("endTime",s.getEndTime());r.put("status",s.getStatus()); }
            default -> throw new ApiException(HttpStatus.NOT_FOUND,"Không có danh mục này");
        }
        return r;
    }
    @Transactional
    public Map<String,Object> course(Long actor,Long id,CourseInput input) {
        String code=clean(input.code()).isEmpty()?(id==null?codes.next(AdminCodeGenerator.Kind.COURSE):require(Course.class,id,true).getCode()):code(input.code()); unique("courses","code",code,id);
        UserEntity teacher=require(UserEntity.class,input.teacherId(),false);
        if(!Set.of("teacher","faculty").contains(teacher.getRole()) || !"active".equals(teacher.getStatus())) throw invalid("Chọn giảng viên phụ trách đang hoạt động");
        if(!Set.of("active","inactive").contains(input.status())) throw invalid("Trạng thái học phần không hợp lệ");
        Course course=id==null?new Course():require(Course.class,id,true);
        if(id!=null) noCourseActivity(id);
        course.setCode(code);course.setName(clean(input.name()));course.setCredits((short)input.credits());course.setDepartment(clean(input.department()));
        course.setDescription(clean(input.description()));course.setCreatedBy(teacher.getId());course.setStatus(input.status());
        if(id==null)em.persist(course);
        changed(actor,id==null?"CREATE_COURSE":"UPDATE_COURSE","COURSE",course.getId(),"code="+code+"; teacherId="+teacher.getId());
        return detail("courses",course.getId());
    }
    @Transactional
    public Map<String,Object> createExam(Long actor,QuickExamRequest input) {
        require(Course.class,input.courseId(),true);
        if(!"active".equals(require(Course.class,input.courseId(),false).getStatus())) throw invalid("Học phần đã ngừng hoạt động");
        String normalized=clean(input.code()).isEmpty()?codes.next(AdminCodeGenerator.Kind.EXAM):code(input.code());unique("exams","code",normalized,null);
        if(input.title().trim().length()>200 || input.totalQuestions()>500) throw invalid("Đề tối đa 500 câu, tiêu đề tối đa 200 ký tự");
        var safe=new QuickExamRequest(input.courseId(),clean(input.title()),normalized,input.totalQuestions(),input.mediumPercent(),input.goodPercent(),input.excellentPercent(),input.maxOverlapPercent(),input.cloIds(),input.shuffleQuestions(),input.shuffleAnswers(),input.antiCheatMode());
        var result=examBuilder.createQuick(safe,actor);
        em.createNativeQuery("INSERT INTO exam_ai_policies(exam_id,enabled) VALUES (:id,:enabled) ON CONFLICT(exam_id) DO UPDATE SET enabled=EXCLUDED.enabled")
                .setParameter("id",result.exam().id()).setParameter("enabled",input.antiCheatMode()).executeUpdate();
        changed(actor,"CREATE_EXAM","EXAM",result.exam().id(),"code="+normalized);
        return detail("exams",result.exam().id());
    }
    @Transactional
    public Map<String,Object> closeExam(Long actor,Long id){
        Exam exam=require(Exam.class,id,true);noExamUsage(id);
        if(!"cancelled".equals(exam.getStatus())){exam.setStatus("cancelled");changed(actor,"CLOSE_EXAM","EXAM",id,"Đóng đề chưa sử dụng; giữ câu hỏi và phân công");}
        return detail("exams",id);
    }
    @Transactional(readOnly=true)
    public Map<String,Object> reviewExam(Long id){
        Exam exam=require(Exam.class,id,false);var result=new LinkedHashMap<>(detail("exams",id));
        result.put("courseName",exam.getCourse().getName());result.put("totalPoints",exam.getTotalPoints());
        boolean unused=count("SELECT COUNT(*) FROM exam_sessions WHERE exam_id=:id",id)==0&&count("SELECT COUNT(*) FROM exam_attempts WHERE exam_id=:id",id)==0&&count("SELECT COUNT(*) FROM exam_sitting_groups WHERE exam_id=:id",id)==0;
        result.put("canEdit",unused&&"draft".equals(exam.getStatus()));result.put("canClose",unused&&!Set.of("cancelled","completed").contains(exam.getStatus()));
        List<Map<String,Object>> questions=new ArrayList<>();
        if(snapshots!=null&&snapshots.usesSnapshots(id)){
            for(Object raw:em.createNativeQuery("SELECT id,question_id,position,points FROM exam_questions WHERE exam_id=:id ORDER BY position").setParameter("id",id).getResultList()){
                Object[] row=(Object[])raw;var snapshot=snapshots.find(((Number)row[0]).longValue()).orElseThrow(()->conflict("Đề thiếu bản lưu nội dung câu hỏi"));
                var question=new LinkedHashMap<String,Object>();question.put("id",row[1]);question.put("content",snapshot.content());question.put("position",row[2]);question.put("points",row[3]);
                question.put("answers",snapshot.options().stream().map(a->Map.of("label",a.label(),"content",a.content(),"correct",a.id()==snapshot.correctAnswerId())).toList());questions.add(question);
            }
            result.put("questions",questions);result.put("revisionToken",AdminExamContentService.token(result));return result;
        }
        for(Object raw:em.createNativeQuery("SELECT q.id,q.content,eq.position,eq.points FROM exam_questions eq JOIN questions q ON q.id=eq.question_id WHERE eq.exam_id=:id ORDER BY eq.position").setParameter("id",id).getResultList()){
            Object[] row=(Object[])raw;var question=new LinkedHashMap<String,Object>();question.put("id",row[0]);question.put("content",row[1]);question.put("position",row[2]);question.put("points",row[3]);
            List<Map<String,Object>> answers=new ArrayList<>();for(Object answerRaw:em.createNativeQuery("SELECT label,content,is_correct FROM answers WHERE question_id=:id ORDER BY position").setParameter("id",row[0]).getResultList()){Object[] answer=(Object[])answerRaw;answers.add(Map.of("label",answer[0].toString(),"content",answer[1],"correct",Boolean.TRUE.equals(answer[2])));}question.put("answers",answers);questions.add(question);
        }result.put("questions",questions);result.put("revisionToken",AdminExamContentService.token(result));return result;
    }
    @Transactional
    public Map<String,Object> exam(Long actor,Long id,ExamInput input) {
        Exam exam=require(Exam.class,id,true);noExamUsage(id);
        if(!"draft".equals(exam.getStatus())) throw conflict("Chỉ sửa đề thi ở trạng thái nháp");
        String normalized=clean(input.code()).isEmpty()?exam.getCode():code(input.code());unique("exams","code",normalized,id);
        exam.setCode(normalized);exam.setTitle(clean(input.title()));exam.setShuffleQuestions(input.shuffleQuestions());exam.setShuffleAnswers(input.shuffleAnswers());
        changed(actor,"UPDATE_EXAM","EXAM",id,"code="+normalized);return detail("exams",id);
    }
    @Transactional
    public Map<String,Object> session(Long actor,Long id,SessionInput input) {
        // Match the existing exam lock used by student entry and AI policy changes.
        Exam exam=require(Exam.class,input.examId(),true);
        if(Set.of("cancelled","completed").contains(exam.getStatus())) throw conflict("Đề thi đã hủy/kết thúc, không thể lập ca mới");
        if(count("SELECT COUNT(*) FROM exam_questions WHERE exam_id=:id",exam.getId())==0) throw invalid("Đề thi chưa có câu hỏi");
        if(!input.endTime().isAfter(input.startTime()) || !input.endTime().isAfter(now())) throw invalid("Giờ kết thúc phải sau giờ bắt đầu và sau thời điểm hiện tại");
        if(input.classId()!=null && count("SELECT COUNT(*) FROM classes WHERE id=:id",input.classId())==0) throw invalid("Lớp không tồn tại");
        ExamSession session=id==null?new ExamSession():require(ExamSession.class,id,true);
        if(id!=null) {
            noSessionUsage(id);
            if(session.getRoomId()!=null && count("SELECT COUNT(*) FROM exam_session_students WHERE exam_session_id=:id",id)>0)
                throw conflict("Ca đã chốt danh sách riêng. Hãy hủy ca và chia lại thay vì sửa lịch/đề/phòng.");
            if(session.getPublishedAt()!=null)throw conflict("Ca đã công bố, không sửa lịch/đề/phòng");
            if(!session.getExam().getId().equals(input.examId())) throw conflict("Không đổi đề của ca đã tạo. Hãy tạo ca mới.");
            if(!"scheduled".equals(session.getStatus()) || !session.getStartTime().isAfter(now())) throw conflict("Chỉ sửa ca chưa bắt đầu");
        }
        String value=clean(input.code()).isEmpty()?(id==null?"EXAM-"+UUID.randomUUID().toString().substring(0,8).toUpperCase():session.getRoomCode()):code(input.code());
        unique("exam_sessions","room_code",value,id);
        session.setExam(exam);session.setClassId(input.classId());session.setName(clean(input.name()));session.setRoomCode(value);
        session.setAccessCode(value); // One public code, compatible with the existing join flow.
        session.setStartTime(input.startTime());session.setEndTime(input.endTime());session.setStatus(input.startTime().isAfter(now())?"scheduled":"ongoing");
        if(id==null)em.persist(session);
        updateExamSchedule(em,exam);
        changed(actor,id==null?"CREATE_SESSION":"UPDATE_SESSION","SESSION",session.getId(),"code="+value);
        return detail("sessions",session.getId());
    }
    @Transactional
    public void delete(Long actor,String resource,Long id) {
        switch(resource) {
            case "courses" -> {
                Course c=require(Course.class,id,true);
                if(bankStats!=null&&bankStats.countByCourse(id)>0)throw conflict("Học phần đã có câu hỏi trong ngân hàng. Hãy ngưng hoạt động thay vì xóa.");
                // Preserve the teacher's question bank and teaching structure, including empty chapters.
                if(count("SELECT COUNT(*) FROM exams WHERE course_id=:id",id)>0 || count("SELECT COUNT(*) FROM questions WHERE course_id=:id",id)>0
                        || count("SELECT COUNT(*) FROM chapters WHERE course_id=:id",id)>0 || count("SELECT COUNT(*) FROM clos WHERE course_id=:id",id)>0)
                    throw conflict("Học phần đã có nội dung hoặc đề thi. Hãy chuyển sang Ngưng hoạt động thay vì xóa.");
                noOtherReferences("courses",id,Set.of());
                em.remove(c);changed(actor,"DELETE_COURSE","COURSE",id,"code="+c.getCode());
            }
            case "exams" -> {
                Exam exam=require(Exam.class,id,true);noExamUsage(id);
                if(!"draft".equals(exam.getStatus()))throw conflict("Chỉ xóa đề nháp chưa có ca thi/bài làm");
                noOtherReferences("exams",id,Set.of("exam_questions","exam_ai_policies"));
                em.createNativeQuery("DELETE FROM exam_questions WHERE exam_id=:id").setParameter("id",id).executeUpdate();
                em.createNativeQuery("DELETE FROM exam_ai_policies WHERE exam_id=:id").setParameter("id",id).executeUpdate();
                em.remove(exam);changed(actor,"DELETE_EXAM","EXAM",id,"code="+exam.getCode());
            }
            case "sessions" -> {
                ExamSession preview=require(ExamSession.class,id,false);require(Exam.class,preview.getExam().getId(),true);
                ExamSession session=require(ExamSession.class,id,true);noSessionUsage(id);
                if(session.getPublishedAt()!=null)throw conflict("Ca đã công bố, hãy hủy thay vì xóa lịch sử");
                if(!Set.of("scheduled","cancelled").contains(session.getStatus())) throw conflict("Chỉ xóa ca chưa bắt đầu hoặc đã hủy, chưa có bài làm");
                if("scheduled".equals(session.getStatus())&&!session.getStartTime().isAfter(now())) throw conflict("Ca đã đến giờ bắt đầu. Hãy hủy ca trước khi xóa.");
                if(count("SELECT COUNT(*) FROM exam_session_students WHERE exam_session_id=:id",id)>0) throw conflict("Ca đã có sinh viên đăng ký. Hãy hủy ca để giữ danh sách.");
                noOtherReferences("exam_sessions",id,Set.of());
                em.remove(session);updateExamSchedule(em,session.getExam());changed(actor,"DELETE_SESSION","SESSION",id,"code="+session.getRoomCode());
            }
            default -> throw new ApiException(HttpStatus.NOT_FOUND,"Danh mục này không hỗ trợ xóa");
        }
    }
}
