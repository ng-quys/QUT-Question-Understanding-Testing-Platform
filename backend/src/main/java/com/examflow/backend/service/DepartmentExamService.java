package com.examflow.backend.service;

import com.examflow.backend.entity.*;
import com.examflow.backend.exception.ApiException;
import jakarta.persistence.*;
import jakarta.validation.constraints.*;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.time.*;
import java.util.*;

@Service
@Transactional(timeout=40)
public class DepartmentExamService {
    @org.springframework.beans.factory.annotation.Autowired private AntiCheatService antiCheat;
    @PersistenceContext private EntityManager em;
    private final AdminService audit;private final ExamOrganizationService organization;
    public DepartmentExamService(AdminService audit,ExamOrganizationService organization){this.audit=audit;this.organization=organization;}
    public record Input(@NotNull UUID requestId,@NotNull @Positive Long periodId,@NotNull @Positive Long courseId,
        @NotBlank @Size(max=200) String department,@NotBlank @Size(max=160) String name,
        @NotNull LocalDateTime startTime,@NotNull LocalDateTime endTime,
        @Min(1) @Max(1000) int studentsPerGroup,@Size(max=64) String previewToken){}
    public record Assignment(@Positive Long roomId,@Positive Long teacherId,@Positive Long examId){}
    public record ScheduleInput(@NotBlank @Size(max=160) String name,@NotNull LocalDateTime startTime,
        @NotNull LocalDateTime endTime,@NotNull LocalDateTime expectedStartTime,@NotNull LocalDateTime expectedEndTime){}
    private String scheduleLock(long id){
        if(count("SELECT COUNT(*) FROM exam_attempts a JOIN exam_sitting_groups g ON g.session_id=a.exam_session_id WHERE g.sitting_id=:id",Map.of("id",id))>0)return "Ca đã có bài làm, không được thay đổi lịch thi.";
        if(count("SELECT COUNT(*) FROM exam_sitting_groups WHERE sitting_id=:id AND status<>'cancelled'",Map.of("id",id))==0)return "Ca đã hủy, không được thay đổi lịch thi.";
        if(count("SELECT COUNT(*) FROM exam_sessions s JOIN exam_sitting_groups g ON g.session_id=s.id WHERE g.sitting_id=:id AND g.status<>'cancelled' AND (s.status NOT IN ('scheduled','ongoing') OR (s.published_at IS NOT NULL AND s.start_time<=:clock))",Map.of("id",id,"clock",ExamOrganizationService.now()))>0)return "Ca đã bắt đầu hoặc đã đóng, không được thay đổi lịch thi.";
        return "";
    }
    public Map<String,Object> schedule(UserEntity actor,long id,ScheduleInput input){
        admin(actor);var current=sitting(id,true);
        q("SELECT e.id FROM exams e WHERE e.id IN (SELECT exam_id FROM exam_sitting_groups WHERE sitting_id=:id) ORDER BY e.id FOR UPDATE OF e",Map.of("id",id)).getResultList();
        var groups=rows("SELECT id,room_id,teacher_id,exam_id,session_id,group_number FROM exam_sitting_groups WHERE sitting_id=:id AND status<>'cancelled' ORDER BY id FOR UPDATE","id,roomId,teacherId,examId,sessionId,number",Map.of("id",id));
        List<ExamSession> sessions=new ArrayList<>();for(var g:groups)if(g.get("sessionId")!=null){var s=em.find(ExamSession.class,((Number)g.get("sessionId")).longValue(),LockModeType.PESSIMISTIC_WRITE);em.refresh(s);sessions.add(s);}
        String locked=scheduleLock(id);if(!locked.isEmpty())throw conflict(locked);
        if(!Objects.equals(current.get("startTime"),input.expectedStartTime())||!Objects.equals(current.get("endTime"),input.expectedEndTime()))throw conflict("Lịch đã được thay đổi. Tải lại ca thi trước khi chỉnh sửa.");
        if(input.name()==null||input.name().isBlank()||input.name().trim().length()>160||input.startTime()==null||input.endTime()==null||!input.startTime().isAfter(ExamOrganizationService.now())||!input.endTime().isAfter(input.startTime())||input.endTime().isAfter(input.startTime().plusHours(8)))throw bad("Tên ca hợp lệ, giờ bắt đầu phải ở tương lai, kết thúc sau bắt đầu và tối đa 8 giờ.");
        var proposed=new LinkedHashMap<>(current);proposed.put("startTime",input.startTime());proposed.put("endTime",input.endTime());
        q("SELECT r.id FROM exam_rooms r WHERE r.id IN (SELECT room_id FROM exam_sitting_groups WHERE sitting_id=:id AND status<>'cancelled') ORDER BY r.id FOR UPDATE OF r",Map.of("id",id)).getResultList();
        q("SELECT u.id FROM users u WHERE u.id IN (SELECT teacher_id FROM exam_sitting_groups WHERE sitting_id=:id AND status<>'cancelled') ORDER BY u.id FOR UPDATE OF u",Map.of("id",id)).getResultList();
        q("SELECT u.id FROM users u WHERE u.id IN (SELECT rs.student_id FROM exam_sitting_students rs JOIN exam_sitting_groups g ON g.id=rs.group_id WHERE g.sitting_id=:id AND g.status<>'cancelled' AND rs.released_at IS NULL) ORDER BY u.id FOR UPDATE OF u",Map.of("id",id)).getResultList();
        for(var g:groups){
            long groupId=((Number)g.get("id")).longValue();
            var ids=q("SELECT student_id FROM exam_sitting_students WHERE group_id=:id AND released_at IS NULL",Map.of("id",groupId)).getResultList().stream().map(v->((Number)v).longValue()).toList();
            if(!ids.isEmpty())checkStudentWindows(ids,input.startTime(),input.endTime(),groupId);
            assignmentWindow(g,proposed,new Assignment(g.get("roomId")==null?null:((Number)g.get("roomId")).longValue(),g.get("teacherId")==null?null:((Number)g.get("teacherId")).longValue(),g.get("examId")==null?null:((Number)g.get("examId")).longValue()));
        }
        q("UPDATE exam_sittings SET name=:name,start_time=:start,end_time=:end WHERE id=:id",Map.of("id",id,"name",input.name().trim(),"start",input.startTime(),"end",input.endTime())).executeUpdate();
        for(var s:sessions){var g=groups.stream().filter(v->v.get("sessionId")!=null&&Objects.equals(((Number)v.get("sessionId")).longValue(),s.getId())).findFirst().orElseThrow();s.setName(input.name().trim()+" · Nhóm "+g.get("number"));s.setStartTime(input.startTime());s.setEndTime(input.endTime());s.setStatus("scheduled");}
        em.flush();for(var s:sessions)AdminCatalogService.updateExamSchedule(em,s.getExam());
        audit.audit(actor.getId(),"UPDATE_SITTING_SCHEDULE","EXAM_SITTING",id,"start="+input.startTime()+"; end="+input.endTime());return detail(actor,id);
    }
    public Map<String,Object> aiPolicy(UserEntity actor,long id,boolean enabled){
        admin(actor);var group=group(id);long sittingId=((Number)group.get("sittingId")).longValue();sitting(sittingId,true);group=group(id);
        if("cancelled".equals(group.get("status")))throw conflict("Nhóm đã hủy, không đổi giám sát AI");
        if(group.get("sessionId")!=null)antiCheat.updateSessionPolicy(((Number)group.get("sessionId")).longValue(),enabled);
        q("UPDATE exam_sitting_groups SET ai_enabled=:enabled WHERE id=:id",Map.of("id",id,"enabled",enabled)).executeUpdate();
        audit.audit(actor.getId(),"UPDATE_SESSION_AI_POLICY","EXAM_SITTING_GROUP",id,"enabled="+enabled);return detail(actor,sittingId);
    }
    private static ApiException bad(String message){return new ApiException(HttpStatus.BAD_REQUEST,message);}
    private static ApiException conflict(String message){return new ApiException(HttpStatus.CONFLICT,message);}
    private void admin(UserEntity actor){if(!ExamOrganizationService.isAdmin(actor))throw new ApiException(HttpStatus.FORBIDDEN,"Chỉ admin được tổ chức ca thi");}
    private Query q(String sql,Map<String,?> args){Query query=em.createNativeQuery(sql);args.forEach(query::setParameter);return query;}
    private long count(String sql,Map<String,?> args){return ((Number)q(sql,args).getSingleResult()).longValue();}
    private List<Map<String,Object>> rows(String sql,String keys,Map<String,?> args){
        String[] columns=keys.split(",");List<Map<String,Object>> result=new ArrayList<>();
        for(Object raw:q(sql,args).getResultList()){Object[] values=raw instanceof Object[] a?a:new Object[]{raw};Map<String,Object> row=new LinkedHashMap<>();for(int i=0;i<columns.length;i++)row.put(columns[i],values[i] instanceof java.sql.Timestamp t?t.toLocalDateTime():values[i]);result.add(row);}return result;
    }
    private Map<String,Object> sitting(long id,boolean lock){var list=rows("SELECT id,period_id,course_id,department,name,start_time,end_time,students_per_group FROM exam_sittings WHERE id=:id"+(lock?" FOR UPDATE":""),"id,periodId,courseId,department,name,startTime,endTime,studentsPerGroup",Map.of("id",id));if(list.isEmpty())throw new ApiException(HttpStatus.NOT_FOUND,"Không tìm thấy ca thi");var result=list.get(0);result.put("code","CT-"+id);return result;}
    private Map<String,Object> group(long id){var list=rows("SELECT id,sitting_id,group_number,room_id,teacher_id,exam_id,session_id,status,ai_enabled FROM exam_sitting_groups WHERE id=:id","id,sittingId,number,roomId,teacherId,examId,sessionId,status,aiEnabled",Map.of("id",id));if(list.isEmpty())throw new ApiException(HttpStatus.NOT_FOUND,"Không tìm thấy nhóm dự thi");return list.get(0);}
    public Map<String,Object> options(UserEntity actor){admin(actor);return Map.of(
        "courses",rows("SELECT id,code,name,department FROM courses WHERE status='active' ORDER BY code","id,code,name,department",Map.of()),
        "departments",rows("SELECT MIN(BTRIM(department)),COUNT(*) FROM users WHERE role='student' AND status='active' AND NULLIF(BTRIM(department),'') IS NOT NULL GROUP BY LOWER(BTRIM(department)) ORDER BY MIN(BTRIM(department))","name,studentCount",Map.of()),
        "periods",rows("SELECT id,code,name,status FROM exam_periods ORDER BY id DESC","id,code,name,status",Map.of()));}
    private void selection(long course,long period){if(count("SELECT COUNT(*) FROM courses WHERE id=:id AND status='active'",Map.of("id",course))==0)throw bad("Môn thi không hoạt động");if(count("SELECT COUNT(*) FROM exam_periods WHERE id=:id AND status='active'",Map.of("id",period))==0)throw bad("Đợt thi không hoạt động");}
    private List<Map<String,Object>> eligible(long course,long period,String department,boolean lock){
        var result=rows("SELECT u.id,u.username,u.full_name,c.name,u.department FROM users u LEFT JOIN student_classes c ON c.id=u.student_class_id WHERE u.role='student' AND u.status='active' AND LOWER(BTRIM(u.department))=LOWER(:department) AND NOT EXISTS(SELECT 1 FROM exam_sitting_students a WHERE a.student_id=u.id AND a.period_id=:period AND a.course_id=:course AND a.released_at IS NULL) AND NOT EXISTS(SELECT 1 FROM exam_session_students old_rs JOIN exam_sessions old_s ON old_s.id=old_rs.exam_session_id JOIN exams old_e ON old_e.id=old_s.exam_id WHERE old_rs.student_id=u.id AND old_s.exam_period_id=:period AND old_e.course_id=:course AND (old_s.status<>'cancelled' OR EXISTS(SELECT 1 FROM exam_attempts old_a WHERE old_a.exam_session_id=old_s.id AND old_a.student_id=u.id))) ORDER BY u.id LIMIT 10001"+(lock?" FOR UPDATE OF u":""),"id,username,name,className,department",Map.of("department",department.trim(),"period",period,"course",course));
        if(result.size()>10000)throw bad("Mỗi ca tối đa 10.000 sinh viên; cần kiểm tra lại quy mô khoa");result.sort(CourseAllocationService.studentOrder());return result;
    }
    public Map<String,Object> candidates(UserEntity actor,long course,long period,String department){admin(actor);selection(course,period);var students=eligible(course,period,department,false);long total=departmentTotal(department);return Map.of("total",total,"assigned",total-students.size(),"remaining",students.size(),"students",students);}
    private long departmentTotal(String department){return count("SELECT COUNT(*) FROM users WHERE role='student' AND status='active' AND LOWER(BTRIM(department))=LOWER(:department)",Map.of("department",department.trim()));}
    private String hash(Input i){return CourseAllocationService.hash(i.requestId()+"|"+i.periodId()+"|"+i.courseId()+"|"+i.department().trim().toLowerCase(Locale.ROOT)+"|"+i.name().trim()+"|"+i.startTime()+"|"+i.endTime()+"|"+i.studentsPerGroup());}
    static List<Map<String,Object>> split(List<Map<String,Object>> students,Input input){
        List<Map<String,Object>> result=new ArrayList<>();for(int offset=0;offset<students.size();offset+=input.studentsPerGroup())result.add(Map.of("number",result.size()+1,"startTime",input.startTime(),"endTime",input.endTime(),"students",List.copyOf(students.subList(offset,Math.min(offset+input.studentsPerGroup(),students.size())))));return result;
    }
    private List<Map<String,Object>> plan(Input input,boolean lock){
        if(input.studentsPerGroup()<1||input.studentsPerGroup()>1000)throw bad("Số sinh viên mỗi nhóm phải từ 1 đến 1.000");
        if(!input.startTime().isAfter(ExamOrganizationService.now())||!input.endTime().isAfter(input.startTime())||input.endTime().isAfter(input.startTime().plusHours(8)))throw bad("Ca thi phải bắt đầu trong tương lai, kết thúc sau bắt đầu và dài tối đa 8 giờ");
        selection(input.courseId(),input.periodId());var students=eligible(input.courseId(),input.periodId(),input.department(),lock);if(students.isEmpty())throw conflict("Khoa không còn sinh viên chưa xếp môn này trong đợt đã chọn");if((students.size()+input.studentsPerGroup()-1)/input.studentsPerGroup()>200)throw bad("Tối đa 200 nhóm trong một ca thi");
        checkStudentWindows(students.stream().map(s->((Number)s.get("id")).longValue()).toList(),input.startTime(),input.endTime(),0);
        return students;
    }
    private void checkStudentWindows(List<Long> students,LocalDateTime start,LocalDateTime end,long exceptGroup){
        if(count("SELECT COUNT(*) FROM exam_session_students rs JOIN exam_sessions s ON s.id=rs.exam_session_id WHERE rs.student_id IN (:students) AND s.status<>'cancelled' AND s.start_time<:end AND s.end_time>:start AND NOT EXISTS(SELECT 1 FROM exam_sitting_groups g WHERE g.id=:except AND g.session_id=s.id)",Map.of("students",students,"start",start,"end",end,"except",exceptGroup))>0 || count("SELECT COUNT(*) FROM exam_sitting_students rs JOIN exam_sitting_groups g ON g.id=rs.group_id JOIN exam_sittings s ON s.id=g.sitting_id WHERE rs.student_id IN (:students) AND rs.released_at IS NULL AND g.status<>'cancelled' AND g.id<>:except AND s.start_time<:end AND s.end_time>:start",Map.of("students",students,"start",start,"end",end,"except",exceptGroup))>0)throw conflict("Có sinh viên đã được xếp ca khác trùng thời gian. Chọn thời gian khác.");
    }
    public Map<String,Object> preview(UserEntity actor,Input input){admin(actor);var students=plan(input,false);long total=departmentTotal(input.department());return Map.of("previewToken",CourseAllocationService.hash(hash(input)+"|"+students),"total",total,"assigned",total-students.size(),"remaining",students.size(),"groups",split(students,input));}
    public Map<String,Object> create(UserEntity actor,Input input){
        admin(actor);q("SELECT id FROM exam_periods WHERE id=:id FOR UPDATE",Map.of("id",input.periodId())).getResultList();
        var previous=rows("SELECT id,request_hash,created_by FROM exam_sittings WHERE request_id=:request","id,hash,actor",Map.of("request",input.requestId()));
        if(!previous.isEmpty()){var row=previous.get(0);if(!hash(input).equals(row.get("hash"))||!actor.getId().equals(((Number)row.get("actor")).longValue()))throw conflict("Mã yêu cầu đã dùng cho cấu hình khác");return detail(actor,((Number)row.get("id")).longValue());}
        em.find(Course.class,input.courseId(),LockModeType.PESSIMISTIC_WRITE);var students=plan(input,true);
        if(!CourseAllocationService.hash(hash(input)+"|"+students).equals(input.previewToken()))throw conflict("Danh sách hoặc cấu hình đã thay đổi. Vui lòng xem trước lại.");
        long sitting=((Number)q("INSERT INTO exam_sittings(request_id,request_hash,period_id,course_id,department,name,start_time,end_time,students_per_group,created_by) VALUES(:request,:hash,:period,:course,:department,:name,:start,:end,:size,:actor) RETURNING id",Map.of("request",input.requestId(),"hash",hash(input),"period",input.periodId(),"course",input.courseId(),"department",input.department().trim(),"name",input.name().trim(),"start",input.startTime(),"end",input.endTime(),"size",input.studentsPerGroup(),"actor",actor.getId())).getSingleResult()).longValue();
        for(var proposed:split(students,input)){
            long group=((Number)q("INSERT INTO exam_sitting_groups(sitting_id,group_number) VALUES(:sitting,:number) RETURNING id",Map.of("sitting",sitting,"number",proposed.get("number"))).getSingleResult()).longValue();
            @SuppressWarnings("unchecked") List<Map<String,Object>> roster=(List<Map<String,Object>>)proposed.get("students");Map<String,Object> args=new HashMap<>(Map.of("group",group,"period",input.periodId(),"course",input.courseId()));List<String> values=new ArrayList<>();
            for(int n=0;n<roster.size();n++){args.put("student"+n,roster.get(n).get("id"));values.add("(CAST(:student"+n+" AS bigint),"+(n+1)+")");}
            q("INSERT INTO exam_sitting_students(group_id,period_id,course_id,student_id,position) SELECT :group,:period,:course,r.student_id,r.position FROM (VALUES "+String.join(",",values)+") r(student_id,position)",args).executeUpdate();
        }
        audit.audit(actor.getId(),"CREATE_DEPARTMENT_SITTING","EXAM_SITTING",sitting,"groups="+split(students,input).size()+", students="+students.size());return detail(actor,sitting);
    }
    public Map<String,Object> list(UserEntity actor,String search,int page){return list(actor,search,page,"");}
    public Map<String,Object> list(UserEntity actor,String search,int page,String status){
        admin(actor);if(page<0)throw bad("Trang không hợp lệ");
        String cte="""
          WITH totals AS (
            SELECT g.sitting_id,count(*) AS groups,count(*) FILTER(WHERE g.status='cancelled') AS cancelled,
              count(*) FILTER(WHERE es.published_at IS NOT NULL AND g.status<>'cancelled') AS published,
              count(*) FILTER(WHERE g.exam_id IS NOT NULL AND e.status NOT IN ('cancelled','completed')) AS with_exam,
              bool_and(g.status='cancelled' OR (g.room_id IS NOT NULL AND r.status='active' AND g.teacher_id IS NOT NULL AND teacher.status='active')) AS assigned,
              bool_and(g.status='cancelled' OR (g.exam_id IS NOT NULL AND e.status NOT IN ('cancelled','completed') AND e.course_id=schedule.course_id AND EXISTS(SELECT 1 FROM exam_questions eq WHERE eq.exam_id=e.id))) AS has_exam
            FROM exam_sitting_groups g JOIN exam_sittings schedule ON schedule.id=g.sitting_id LEFT JOIN exam_rooms r ON r.id=g.room_id LEFT JOIN users teacher ON teacher.id=g.teacher_id LEFT JOIN exams e ON e.id=g.exam_id LEFT JOIN exam_sessions es ON es.id=g.session_id GROUP BY g.sitting_id
          ), entries AS (
            SELECT s.id,'CT-'||s.id::text AS code,s.name,s.department,c.code AS course_code,c.name AS course_name,p.name AS period_name,
              s.start_time,s.end_time,t.groups,(SELECT count(*) FROM exam_sitting_students rs JOIN exam_sitting_groups g ON g.id=rs.group_id WHERE g.sitting_id=s.id) AS students,
              t.published,t.with_exam,
              CASE WHEN t.cancelled=t.groups THEN 'cancelled'
                WHEN t.published>0 AND s.end_time<=:clock THEN 'completed'
                WHEN t.published>0 AND s.start_time<=:clock THEN 'ongoing'
                WHEN t.published=t.groups-t.cancelled THEN 'published'
                WHEN t.published>0 THEN 'partial'
                WHEN NOT t.assigned THEN 'assignment' WHEN NOT t.has_exam THEN 'exam' ELSE 'ready' END AS stage,'sitting' AS kind
            FROM exam_sittings s JOIN courses c ON c.id=s.course_id JOIN exam_periods p ON p.id=s.period_id JOIN totals t ON t.sitting_id=s.id
            UNION ALL
            SELECT es.id,es.room_code,es.name,coalesce(c.department,''),c.code,c.name,coalesce(p.name,'Ca thi trước đây'),es.start_time,es.end_time,1::bigint,
              (SELECT count(*) FROM exam_session_students rs WHERE rs.exam_session_id=es.id),CASE WHEN es.published_at IS NULL THEN 0 ELSE 1 END::bigint,1::bigint,
              CASE WHEN es.status IN ('cancelled','completed') THEN es.status WHEN es.end_time<=:clock THEN 'completed' WHEN es.published_at IS NULL THEN 'ready' WHEN es.start_time<=:clock THEN 'ongoing' ELSE 'published' END,'legacy'
            FROM exam_sessions es JOIN exams e ON e.id=es.exam_id JOIN courses c ON c.id=e.course_id LEFT JOIN exam_periods p ON p.id=es.exam_period_id
            WHERE NOT EXISTS(SELECT 1 FROM exam_sitting_groups g WHERE g.session_id=es.id)
          )
          """;
        String where=" WHERE STRPOS(LOWER(CONCAT_WS(' ',code,name,department,course_code,course_name,period_name)),LOWER(:search))>0 AND (:status='' OR stage=:status)";
        var args=new HashMap<String,Object>(Map.of("clock",ExamOrganizationService.now(),"search",search.trim(),"status",status));
        long total=count(cte+" SELECT count(*) FROM entries"+where,args);args.put("offset",(long)page*20);
        return Map.of("total",total,"items",rows(cte+" SELECT id,code,name,department,course_code,course_name,period_name,start_time,end_time,groups,students,published,with_exam,stage,kind FROM entries"+where+" ORDER BY start_time DESC,id DESC LIMIT 20 OFFSET :offset","id,code,name,department,courseCode,courseName,periodName,startTime,endTime,groupCount,studentCount,publishedGroups,groupsWithExam,status,kind",args));
    }
    public Map<String,Object> publishSitting(UserEntity actor,long id){
        admin(actor);sitting(id,true);
        var groups=rows("SELECT id,status FROM exam_sitting_groups WHERE sitting_id=:id ORDER BY group_number","id,status",Map.of("id",id));
        if(groups.stream().noneMatch(g->!"cancelled".equals(g.get("status"))))throw conflict("Ca không còn nhóm dự thi để công bố");
        for(var entry:groups)if(!"cancelled".equals(entry.get("status"))){var g=group(((Number)entry.get("id")).longValue());if(g.get("sessionId")==null&&(g.get("roomId")==null||g.get("teacherId")==null||g.get("examId")==null))throw conflict("Hoàn thiện phòng, giảng viên và đề cho tất cả nhóm trước khi công bố ca thi");}
        // One transaction: any invalid room/exam rolls back publication of all groups.
        for(var group:groups)if(!"cancelled".equals(group.get("status")))publish(actor,((Number)group.get("id")).longValue());
        return detail(actor,id);
    }
    public Map<String,Object> detail(UserEntity actor,long id){
        admin(actor);var result=new LinkedHashMap<>(sitting(id,false));
        var groups=rows("SELECT g.id,g.group_number,g.room_id,r.code,r.name,r.capacity,g.teacher_id,u.full_name,g.exam_id,e.title,e.status,(SELECT count(*) FROM exam_questions eq WHERE eq.exam_id=e.id),r.status,u.status,g.session_id,g.status,s.published_at,COALESCE(s.ai_enabled,g.ai_enabled,(SELECT p.enabled FROM exam_ai_policies p WHERE p.exam_id=g.exam_id),TRUE),(SELECT COUNT(*) FROM exam_sitting_students rs WHERE rs.group_id=g.id) FROM exam_sitting_groups g LEFT JOIN exam_rooms r ON r.id=g.room_id LEFT JOIN users u ON u.id=g.teacher_id LEFT JOIN exams e ON e.id=g.exam_id LEFT JOIN exam_sessions s ON s.id=g.session_id WHERE g.sitting_id=:id ORDER BY g.group_number","id,number,roomId,roomCode,roomName,capacity,teacherId,teacherName,examId,examTitle,examStatus,examQuestions,roomStatus,teacherStatus,sessionId,status,publishedAt,aiEnabled,studentCount",Map.of("id",id));
        for(var group:groups){List<String> missing=new ArrayList<>();if(group.get("roomId")==null||!"active".equals(group.get("roomStatus")))missing.add("phòng");if(group.get("teacherId")==null||!"active".equals(group.get("teacherStatus")))missing.add("giảng viên");if(group.get("examId")==null||Set.of("cancelled","completed").contains(String.valueOf(group.get("examStatus")))||((Number)group.get("examQuestions")).longValue()==0)missing.add("đề thi");group.put("availableExamCount",group.get("teacherId")==null?0:count("SELECT COUNT(*) FROM exams e JOIN courses c ON c.id=e.course_id WHERE e.course_id=:course AND COALESCE(e.created_by,c.created_by)=:teacher AND e.status NOT IN ('cancelled','completed') AND EXISTS(SELECT 1 FROM exam_questions eq WHERE eq.exam_id=e.id)",Map.of("course",result.get("courseId"),"teacher",group.get("teacherId"))));group.put("missing",missing);group.put("ready",missing.isEmpty()&&!"cancelled".equals(group.get("status")));group.put("students",rows("SELECT u.id,u.username,u.full_name,c.name,u.department,rs.position,rs.released_at FROM exam_sitting_students rs JOIN users u ON u.id=rs.student_id LEFT JOIN student_classes c ON c.id=u.student_class_id WHERE rs.group_id=:id ORDER BY rs.position","id,username,name,className,department,position,releasedAt",Map.of("id",group.get("id"))));}
        String locked=scheduleLock(id);result.put("canEditSchedule",locked.isEmpty());result.put("scheduleLockReason",locked);result.put("groups",groups);return result;
    }
    private void assignmentWindow(Map<String,Object> group,Map<String,Object> sitting,Assignment input){
        long groupId=((Number)group.get("id")).longValue();LocalDateTime start=(LocalDateTime)sitting.get("startTime"),end=(LocalDateTime)sitting.get("endTime");
        if(input.roomId()!=null){
            var rooms=rows("SELECT capacity,status FROM exam_rooms WHERE id=:id FOR UPDATE","capacity,status",Map.of("id",input.roomId()));if(rooms.isEmpty()||!"active".equals(rooms.get(0).get("status")))throw bad("Phòng không hoạt động");
            if(count("SELECT COUNT(*) FROM exam_sitting_students WHERE group_id=:id AND released_at IS NULL",Map.of("id",groupId))>((Number)rooms.get(0).get("capacity")).longValue())throw conflict("Phòng không đủ sức chứa nhóm sinh viên");
            if(count("SELECT COUNT(*) FROM exam_sessions other WHERE room_id=:room AND status<>'cancelled' AND start_time<:end AND end_time>:start AND NOT EXISTS(SELECT 1 FROM exam_sitting_groups own WHERE own.id=:id AND own.session_id=other.id)",Map.of("room",input.roomId(),"start",start,"end",end,"id",groupId))>0||count("SELECT COUNT(*) FROM exam_sitting_groups g JOIN exam_sittings s ON s.id=g.sitting_id WHERE g.room_id=:room AND g.id<>:id AND g.status<>'cancelled' AND s.start_time<:end AND s.end_time>:start",Map.of("room",input.roomId(),"id",groupId,"start",start,"end",end))>0)throw conflict("Phòng đã được dùng cho nhóm hoặc ca trùng giờ");
        }
        if(input.teacherId()!=null){
            UserEntity teacher=em.find(UserEntity.class,input.teacherId(),LockModeType.PESSIMISTIC_WRITE);if(teacher==null||!Set.of("teacher","faculty").contains(teacher.getRole())||!"active".equals(teacher.getStatus()))throw bad("Giảng viên không hoạt động");
            if(count("SELECT COUNT(*) FROM exam_sitting_groups g JOIN exam_sittings s ON s.id=g.sitting_id WHERE g.teacher_id=:teacher AND g.id<>:id AND g.status<>'cancelled' AND s.start_time<:end AND s.end_time>:start",Map.of("teacher",input.teacherId(),"id",groupId,"start",start,"end",end))>0||count("SELECT COUNT(*) FROM exam_sessions s JOIN exam_room_teachers t ON t.room_id=s.room_id WHERE t.teacher_id=:teacher AND s.status<>'cancelled' AND s.start_time<:end AND s.end_time>:start AND NOT EXISTS(SELECT 1 FROM exam_sitting_groups g WHERE g.session_id=s.id)",Map.of("teacher",input.teacherId(),"start",start,"end",end))>0)throw conflict("Giảng viên đã được phân công ca hoặc nhóm khác trùng giờ");
        }
    }
    private Exam validateExam(Map<String,Object> sitting,Assignment input,boolean lock){
        if(input.examId()==null)return null;Exam exam=lock?em.find(Exam.class,input.examId(),LockModeType.PESSIMISTIC_WRITE):em.find(Exam.class,input.examId());
        if(exam==null||!exam.getCourse().getId().equals(((Number)sitting.get("courseId")).longValue())||Set.of("cancelled","completed").contains(exam.getStatus()))throw bad("Đề thi phải thuộc đúng môn và còn sử dụng được");
        if(input.teacherId()!=null&&!input.teacherId().equals(exam.getCreatedBy())&&!(exam.getCreatedBy()==null&&input.teacherId().equals(exam.getCourse().getCreatedBy())))throw bad("Chọn đề do giảng viên được phân công tạo; đề cũ chưa có tác giả dùng giảng viên phụ trách môn");return exam;
    }
    public Map<String,Object> assign(UserEntity actor,long id,Assignment input){
        admin(actor);if(input.examId()!=null)throw bad("Admin chỉ phân phòng và giảng viên. Đề thi do giảng viên được phân công thêm vào ca.");
        var group=group(id);long sittingId=((Number)group.get("sittingId")).longValue();var sitting=sitting(sittingId,true);group=group(id);if(group.get("sessionId")!=null||"cancelled".equals(group.get("status"))||!((LocalDateTime)sitting.get("startTime")).isAfter(ExamOrganizationService.now()))throw conflict("Nhóm đã công bố, đã hủy hoặc đã đến giờ; không đổi phân công");
        Long existingExam=Objects.equals(group.get("teacherId"),input.teacherId())?(group.get("examId")==null?null:((Number)group.get("examId")).longValue()):null;
        var effective=new Assignment(input.roomId(),input.teacherId(),existingExam);validateExam(sitting,effective,true);assignmentWindow(group,sitting,effective);
        Map<String,Object> args=new HashMap<>();args.put("room",input.roomId());args.put("teacher",input.teacherId());args.put("exam",existingExam);args.put("id",id);
        q("UPDATE exam_sitting_groups SET room_id=:room,teacher_id=:teacher,exam_id=:exam WHERE id=:id",args).executeUpdate();audit.audit(actor.getId(),"ASSIGN_SITTING_GROUP","EXAM_SITTING_GROUP",id,"");return detail(actor,sittingId);
    }
    public Map<String,Object> publish(UserEntity actor,long id){
        admin(actor);var group=group(id);long sittingId=((Number)group.get("sittingId")).longValue();var sitting=sitting(sittingId,true);group=group(id);
        if(group.get("sessionId")!=null)return detail(actor,sittingId);
        if("cancelled".equals(group.get("status")))throw conflict("Nhóm đã bị hủy");if(group.get("roomId")==null||group.get("teacherId")==null||group.get("examId")==null)throw conflict("Cần gán đủ phòng, giảng viên và đề thi trước khi công bố");
        var input=new Assignment(((Number)group.get("roomId")).longValue(),((Number)group.get("teacherId")).longValue(),((Number)group.get("examId")).longValue());Exam exam=validateExam(sitting,input,true);assignmentWindow(group,sitting,input);
        if(!((LocalDateTime)sitting.get("startTime")).isAfter(ExamOrganizationService.now()))throw conflict("Ca đã đến giờ; cần hoàn thiện và công bố trước giờ bắt đầu");
        List<Long> ids=q("SELECT u.id FROM users u JOIN exam_sitting_students rs ON rs.student_id=u.id WHERE rs.group_id=:id AND rs.released_at IS NULL ORDER BY u.id FOR UPDATE OF u",Map.of("id",id)).getResultList().stream().map(v->((Number)v).longValue()).toList();if(ids.isEmpty())throw conflict("Nhóm không có sinh viên");checkStudentWindows(ids,(LocalDateTime)sitting.get("startTime"),(LocalDateTime)sitting.get("endTime"),id);
        ExamSession session=new ExamSession();session.setExam(exam);session.setAiEnabled((Boolean)group.get("aiEnabled"));session.setName(sitting.get("name")+" · Nhóm "+group.get("number"));session.setRoomId(input.roomId());session.setRoomCode("CTG-"+Long.toString(id,36).toUpperCase(Locale.ROOT));session.setAccessCode(session.getRoomCode());session.setStartTime((LocalDateTime)sitting.get("startTime"));session.setEndTime((LocalDateTime)sitting.get("endTime"));session.setStatus("scheduled");em.persist(session);em.flush();
        q("UPDATE exam_sitting_groups SET session_id=:session WHERE id=:id",Map.of("session",session.getId(),"id",id)).executeUpdate();q("UPDATE exam_sessions SET exam_period_id=:period WHERE id=:id",Map.of("period",sitting.get("periodId"),"id",session.getId())).executeUpdate();
        q("INSERT INTO exam_session_students(exam_session_id,student_id,status) SELECT :session,student_id,'registered' FROM exam_sitting_students WHERE group_id=:id AND released_at IS NULL",Map.of("session",session.getId(),"id",id)).executeUpdate();organization.publish(actor,session.getId());return detail(actor,sittingId);
    }
    public Map<String,Object> cancel(UserEntity actor,long id){admin(actor);var group=group(id);long sitting=((Number)group.get("sittingId")).longValue();sitting(sitting,true);group=group(id);if(!"cancelled".equals(group.get("status"))){if(group.get("sessionId")!=null)organization.status(actor,((Number)group.get("sessionId")).longValue(),"cancelled");else{q("UPDATE exam_sitting_groups SET status='cancelled' WHERE id=:id",Map.of("id",id)).executeUpdate();q("UPDATE exam_sitting_students SET released_at=NOW() WHERE group_id=:id AND released_at IS NULL",Map.of("id",id)).executeUpdate();}audit.audit(actor.getId(),"CANCEL_SITTING_GROUP","EXAM_SITTING_GROUP",id,"");}return detail(actor,sitting);}
}
