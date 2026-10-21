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

/** Room membership is a template. Published session membership is an immutable snapshot. */
@Service
@Transactional
public class ExamOrganizationService {
    private String monitoringAccess(){return "(EXISTS(SELECT 1 FROM exam_sitting_groups assigned WHERE assigned.session_id=s.id AND assigned.teacher_id=:actor) OR (NOT EXISTS(SELECT 1 FROM exam_sitting_groups assigned WHERE assigned.session_id=s.id) AND EXISTS(SELECT 1 FROM exam_room_teachers assigned WHERE assigned.room_id=s.room_id AND assigned.teacher_id=:actor)))";}
    public void requireMonitoring(UserEntity actor,long id){
        if(isAdmin(actor))return;
        if(!Set.of("teacher","faculty").contains(actor.getRole())||!"active".equals(actor.getStatus())||count("SELECT COUNT(*) FROM exam_sessions s WHERE s.id=:id AND s.published_at IS NOT NULL AND "+monitoringAccess(),Map.of("id",id,"actor",actor.getId()))==0)throw denied();
    }
    @org.springframework.beans.factory.annotation.Autowired private ExamSnapshotReadService snapshots;
    @org.springframework.beans.factory.annotation.Autowired private AdminCodeGenerator codes;
    @PersistenceContext private EntityManager em;
    @org.springframework.beans.factory.annotation.Autowired private BatchMonitoringService batchMonitoring;
    @org.springframework.beans.factory.annotation.Autowired private AntiCheatService antiCheat;
    private final AdminService audit;
    private final AdminWorkspaceService workspace;
    public ExamOrganizationService(AdminService audit,AdminWorkspaceService workspace){this.audit=audit;this.workspace=workspace;}
    public record RoomInput(@Size(max=50) String code,@NotBlank @Size(max=200) String name,@NotBlank String status,@Min(1) @Max(1000) Integer capacity){public RoomInput(String code,String name,String status){this(code,name,status,null);}}
    public record ClassInput(@Size(max=50) String code,@NotBlank @Size(max=200) String name,@Size(max=150) String department,@NotBlank String status){}
    public record Ids(@NotNull @Size(max=2000) List<@NotNull @Positive Long> ids){}
    public record ProfileInput(@NotBlank @Size(max=150) String fullName,@Size(max=150) String department,Long classId){}
    public record SessionInput(@NotNull Long examId,@NotNull Long roomId,@NotBlank @Size(max=200) String name,@NotNull LocalDateTime startTime,@NotNull LocalDateTime endTime){}
    public Map<String,Object> aiPolicy(UserEntity actor,long id,boolean enabled){
        admin(actor);antiCheat.updateSessionPolicy(id,enabled);
        query("UPDATE exam_sitting_groups SET ai_enabled=:enabled WHERE session_id=:id",Map.of("id",id,"enabled",enabled)).executeUpdate();
        log(actor,"UPDATE_SESSION_AI_POLICY","SESSION",id,"enabled="+enabled);return Map.of("sessionId",id,"enabled",enabled);
    }
    public record Page(List<Map<String,Object>> items,long total,int page,int size,LocalDateTime serverTime){}
    private static final ZoneId ZONE=ZoneId.of("Asia/Ho_Chi_Minh");
    public static LocalDateTime now(){return LocalDateTime.now(ZONE);}
    private static ApiException bad(String s){return new ApiException(HttpStatus.BAD_REQUEST,s);}
    private static ApiException conflict(String s){return new ApiException(HttpStatus.CONFLICT,s);}
    private static ApiException denied(){return new ApiException(HttpStatus.FORBIDDEN,"Bạn không được phân công phụ trách dữ liệu này");}
    private static String clean(String s){return s==null?"":s.trim();}
    public static boolean isAdmin(UserEntity actor){return "admin".equals(actor.getRole());}
    private void admin(UserEntity actor){if(!isAdmin(actor))throw denied();}
    private Query query(String sql,Map<String,?> args){Query q=em.createNativeQuery(sql);args.forEach(q::setParameter);return q;}
    private long count(String sql,Map<String,?> args){return ((Number)query(sql,args).getSingleResult()).longValue();}
    private List<Map<String,Object>> rows(String sql,String columns,Map<String,?> args){
        String[] keys=columns.split(",");List<?> list=query(sql,args).getResultList();
        return list.stream().map(item->{Object[] row=item instanceof Object[]?(Object[])item:new Object[]{item};Map<String,Object> value=new LinkedHashMap<>();for(int i=0;i<keys.length;i++)value.put(keys[i],row[i] instanceof java.sql.Timestamp t?t.toLocalDateTime():row[i]);return value;}).toList();
    }
    private Map<String,Object> room(long id,boolean lock){
        var result=rows("SELECT id,code,name,status,capacity FROM exam_rooms WHERE id=:id"+(lock?" FOR UPDATE":""),"id,code,name,status,capacity",Map.of("id",id));
        if(result.isEmpty())throw new ApiException(HttpStatus.NOT_FOUND,"Không tìm thấy phòng thi");return result.get(0);
    }
    public void requireRoom(UserEntity actor,long id){room(id,false);if(!isAdmin(actor)&&count("SELECT COUNT(*) FROM exam_room_teachers WHERE room_id=:id AND teacher_id=:actor",Map.of("id",id,"actor",actor.getId()))==0)throw denied();}
    public void requireCourse(UserEntity actor,long id){if(!isAdmin(actor)&&count("SELECT COUNT(*) FROM courses c WHERE c.id=:id AND (c.created_by=:actor OR EXISTS(SELECT 1 FROM course_faculties f WHERE f.course_id=c.id AND f.faculty_id=:actor))",Map.of("id",id,"actor",actor.getId()))==0)throw denied();}
    public boolean canUseCourse(UserEntity actor,long id){if(isAdmin(actor))return true;return count("SELECT COUNT(*) FROM courses c WHERE c.id=:id AND (c.created_by=:actor OR EXISTS(SELECT 1 FROM course_faculties f WHERE f.course_id=c.id AND f.faculty_id=:actor))",Map.of("id",id,"actor",actor.getId()))>0;}
    public void requireUnusedExam(long id){if(count("SELECT COUNT(*) FROM exam_sessions WHERE exam_id=:id",Map.of("id",id))>0||count("SELECT COUNT(*) FROM exam_attempts WHERE exam_id=:id",Map.of("id",id))>0||count("SELECT COUNT(*) FROM exam_sitting_groups WHERE exam_id=:id",Map.of("id",id))>0)throw conflict("Đề đã có ca thi hoặc bài làm, không thay đổi trạng thái trực tiếp");}
    public void requireExamCourse(UserEntity actor,long id){Exam e=em.find(Exam.class,id);if(e==null)throw new ApiException(HttpStatus.NOT_FOUND,"Không tìm thấy đề");requireCourse(actor,e.getCourse().getId());}
    public void requireExam(UserEntity actor,long id){requireExamCourse(actor,id);Exam e=em.find(Exam.class,id);if(!isAdmin(actor)&&!actor.getId().equals(e.getCreatedBy()))throw denied();}
    private ExamSession session(UserEntity actor,long id,boolean lock){
        ExamSession s=em.find(ExamSession.class,id);if(s==null)throw new ApiException(HttpStatus.NOT_FOUND,"Không tìm thấy ca thi");
        if(lock){em.find(Exam.class,s.getExam().getId(),LockModeType.PESSIMISTIC_WRITE);em.refresh(s,LockModeType.PESSIMISTIC_WRITE);}
        if(!isAdmin(actor)){if(s.getRoomId()==null)throw denied();requireRoom(actor,s.getRoomId());requireExam(actor,s.getExam().getId());}return s;
    }
    private void log(UserEntity actor,String action,String type,long id,String detail){audit.audit(actor.getId(),action,type,id,detail);}
    public Map<String,Object> bootstrap(UserEntity actor){
        Map<String,Object> args=Map.of("actor",actor.getId());boolean all=isAdmin(actor);
        Map<String,Object> result=new LinkedHashMap<>();result.put("serverTime",now());
        result.put("rooms",rows("SELECT r.id,r.code,r.name,r.status,(SELECT COUNT(*) FROM exam_room_students rs WHERE rs.room_id=r.id),r.capacity FROM exam_rooms r"+(all?"":" WHERE EXISTS(SELECT 1 FROM exam_room_teachers rt WHERE rt.room_id=r.id AND rt.teacher_id=:actor)")+" ORDER BY r.code","id,code,name,status,studentCount,capacity",all?Map.of():args));
        result.put("classes",all?rows("SELECT id,code,name,department,status FROM student_classes ORDER BY code","id,code,name,department,status",Map.of()):List.of());
        result.put("teachers",all?rows("SELECT id,username,full_name FROM users WHERE role IN ('teacher','faculty') AND status='active' ORDER BY full_name","id,username,name",Map.of()):List.of());
        result.put("exams",rows("SELECT e.id,e.code,e.title,c.code,c.id,COALESCE(e.created_by,c.created_by) FROM exams e JOIN courses c ON c.id=e.course_id WHERE e.status NOT IN ('cancelled','completed') AND EXISTS(SELECT 1 FROM exam_questions eq WHERE eq.exam_id=e.id)"+(all?"":" AND e.created_by=:actor AND (c.created_by=:actor OR EXISTS(SELECT 1 FROM course_faculties f WHERE f.course_id=c.id AND f.faculty_id=:actor))")+" ORDER BY e.id DESC","id,code,name,courseCode,courseId,authorId",all?Map.of():args));return result;
    }
    public Page students(UserEntity actor,String q,Long classId,String department,int page,int size){
        admin(actor);if(page<0||size<1||size>100)throw bad("Phân trang không hợp lệ");
        String where=" WHERE u.role='student'";Map<String,Object> args=new HashMap<>();
        if(!clean(q).isEmpty()){where+=" AND (STRPOS(LOWER(u.username),LOWER(:q))>0 OR STRPOS(LOWER(u.full_name),LOWER(:q))>0)";args.put("q",q.trim());}
        if(classId!=null){where+=" AND u.student_class_id=:classId";args.put("classId",classId);}
        if(!clean(department).isEmpty()){where+=" AND LOWER(COALESCE(u.department,''))=LOWER(:department)";args.put("department",department.trim());}
        long total=count("SELECT COUNT(*) FROM users u"+where,args);
        String sql="SELECT u.id,u.username,u.full_name,u.email,u.department,u.status,u.student_class_id,cl.name FROM users u LEFT JOIN student_classes cl ON cl.id=u.student_class_id"+where+" ORDER BY u.username LIMIT :size OFFSET :offset";
        args.put("size",size);args.put("offset",(long)page*size);
        return new Page(rows(sql,"id,username,name,email,department,status,classId,className",args),total,page,size,now());
    }
    public Map<String,Object> roomDetail(UserEntity actor,long id){
        requireRoom(actor,id);Map<String,Object> result=new LinkedHashMap<>(room(id,false));
        result.put("students",rows("SELECT u.id,u.username,u.full_name,u.department,cl.name FROM exam_room_students rs JOIN users u ON u.id=rs.student_id LEFT JOIN student_classes cl ON cl.id=u.student_class_id WHERE rs.room_id=:id ORDER BY u.username","id,username,name,department,className",Map.of("id",id)));
        result.put("teachers",rows("SELECT u.id,u.full_name,u.username FROM exam_room_teachers rt JOIN users u ON u.id=rt.teacher_id WHERE rt.room_id=:id ORDER BY u.full_name","id,name,username",Map.of("id",id)));return result;
    }
    private void validCatalog(String code,String name,String status){if(!clean(code).matches("[A-Za-z0-9][A-Za-z0-9_-]{1,49}")||clean(name).isEmpty()||!Set.of("active","inactive").contains(status))throw bad("Mã gồm 2–50 ký tự không dấu; tên và trạng thái phải hợp lệ");}
    public void saveRoom(UserEntity actor,Long id,RoomInput input){
        admin(actor);
        String code=id!=null?(String)room(id,true).get("code"):clean(input.code());
        Long allocatedId=null;
        if(code.isEmpty()){
            for(int tries=0;tries<100;tries++){
                allocatedId=((Number)query("SELECT nextval(pg_get_serial_sequence('public.exam_rooms','id'))",Map.of()).getSingleResult()).longValue();
                code=String.format(Locale.ROOT,"P%02d",allocatedId);
                if(count("SELECT COUNT(*) FROM exam_rooms WHERE LOWER(code)=LOWER(:code)",Map.of("code",code))==0)break;
            }
        }
        code=code.toUpperCase(Locale.ROOT);validCatalog(code,input.name(),input.status());
        if(count("SELECT COUNT(*) FROM exam_rooms WHERE LOWER(code)=LOWER(:code) AND id<>:id",Map.of("code",code,"id",id==null?0:id))>0)throw conflict("Mã phòng đã tồn tại");
        if(id==null){var args=new HashMap<String,Object>(Map.of("code",code,"name",input.name().trim(),"status",input.status(),"actor",actor.getId(),"capacity",input.capacity()==null?40:input.capacity()));if(allocatedId!=null)args.put("id",allocatedId);id=((Number)query("INSERT INTO exam_rooms("+(allocatedId==null?"":"id,")+"code,name,status,created_by,capacity) VALUES("+(allocatedId==null?"":":id,")+":code,:name,:status,:actor,:capacity) RETURNING id",args).getSingleResult()).longValue();}
        else{room(id,true);if(input.capacity()!=null&&count("SELECT COUNT(*) FROM exam_sessions s WHERE s.room_id=:id AND s.status IN ('scheduled','ongoing') AND (SELECT COUNT(*) FROM exam_session_students rs WHERE rs.exam_session_id=s.id)>:capacity",Map.of("id",id,"capacity",input.capacity()))>0)throw conflict("Sức chứa mới nhỏ hơn danh sách ca thi hiện có");if(count("SELECT COUNT(*) FROM exam_attempts a JOIN exam_sessions s ON s.id=a.exam_session_id WHERE s.room_id=:id AND a.status='in_progress'",Map.of("id",id))>0)throw conflict("Phòng còn bài đang làm");query("UPDATE exam_rooms SET code=:code,name=:name,status=:status,capacity=:capacity,updated_at=NOW() WHERE id=:id",Map.of("id",id,"code",code,"name",input.name().trim(),"status",input.status(),"capacity",input.capacity()==null?room(id,false).get("capacity"):input.capacity())).executeUpdate();}
        log(actor,"SAVE_ROOM","ROOM",id,"code="+code);
    }
    public void deleteRoom(UserEntity actor,long id){
        admin(actor);var existing=room(id,true);var args=Map.of("id",id);
        // Session locks also serialize against starting an attempt or changing session status.
        query("SELECT id FROM exam_sessions WHERE room_id=:id OR id IN (SELECT session_id FROM exam_sitting_groups WHERE room_id=:id) ORDER BY id FOR UPDATE",args).getResultList();
        query("SELECT id FROM exam_sitting_groups WHERE room_id=:id ORDER BY id FOR UPDATE",args).getResultList();
        if(count("SELECT COUNT(*) FROM exam_sitting_groups WHERE room_id=:id AND status<>'cancelled'",args)>0)
            throw conflict("Phòng đang được gán cho nhóm dự thi chưa hủy. Hãy hủy nhóm hoặc đổi phòng trong chi tiết ca thi trước khi xóa.");
        if(count("SELECT COUNT(*) FROM exam_sessions WHERE (room_id=:id OR id IN (SELECT session_id FROM exam_sitting_groups WHERE room_id=:id)) AND status<>'cancelled'",args)>0)
            throw conflict("Phòng còn ca thi chưa hủy. Hãy hủy ca trước khi xóa hoặc ngưng hoạt động phòng để giữ lịch sử.");
        if(count("SELECT COUNT(*) FROM exam_attempts a JOIN exam_sessions s ON s.id=a.exam_session_id WHERE s.room_id=:id OR s.id IN (SELECT session_id FROM exam_sitting_groups WHERE room_id=:id)",args)>0)
            throw conflict("Phòng đã có bài làm, kể cả trong ca đã hủy. Hãy ngưng hoạt động phòng để giữ lịch sử thi.");
        if(count("SELECT COUNT(*) FROM exam_room_students WHERE room_id=:id",args)>0)
            throw conflict("Phòng còn thành viên. Hãy bỏ thành viên khỏi phòng trước khi xóa.");
        // Keep cancelled sittings, rosters and session room-code snapshots; only detach the room.
        int groups=query("UPDATE exam_sitting_groups SET room_id=NULL WHERE room_id=:id AND status='cancelled'",args).executeUpdate();
        int sessions=query("UPDATE exam_sessions SET room_id=NULL WHERE room_id=:id AND status='cancelled'",args).executeUpdate();
        query("DELETE FROM exam_rooms WHERE id=:id",args).executeUpdate();
        log(actor,"DELETE_ROOM","ROOM",id,"code="+existing.get("code")+", detachedCancelledGroups="+groups+", detachedCancelledSessions="+sessions);
    }
    public void members(UserEntity actor,long id,Ids input,boolean remove){
        admin(actor);room(id,true);for(Long student:new LinkedHashSet<>(input.ids())){
            UserEntity user=em.find(UserEntity.class,student);if(user==null||!"student".equals(user.getRole()))throw bad("Danh sách có tài khoản không phải sinh viên");
            Map<String,Object> args=Map.of("room",id,"student",student,"actor",actor.getId());
            if(remove){if(count("SELECT COUNT(*) FROM exam_attempts a JOIN exam_sessions s ON s.id=a.exam_session_id WHERE s.room_id=:room AND a.student_id=:student",Map.of("room",id,"student",student))>0)throw conflict("Sinh viên đã có bài làm tại phòng, không được loại khỏi phòng");query("DELETE FROM exam_room_students WHERE room_id=:room AND student_id=:student",Map.of("room",id,"student",student)).executeUpdate();}
            else{if(!"active".equals(user.getStatus()))throw bad("Chỉ thêm sinh viên đang hoạt động");query("INSERT INTO exam_room_students(room_id,student_id,added_by) VALUES(:room,:student,:actor) ON CONFLICT(room_id,student_id) DO NOTHING",args).executeUpdate();}
        }log(actor,remove?"REMOVE_ROOM_STUDENTS":"ADD_ROOM_STUDENTS","ROOM",id,"count="+new HashSet<>(input.ids()).size());
    }
    public void teachers(UserEntity actor,long id,Ids input){
        admin(actor);room(id,true);if(count("SELECT COUNT(*) FROM exam_sessions WHERE room_id=:id AND published_at IS NOT NULL AND status IN ('scheduled','ongoing') AND end_time>:clock",Map.of("id",id,"clock",now()))>0)throw conflict("Chưa đổi phân công khi phòng có ca đã công bố còn hiệu lực");
        for(Long teacher:input.ids()){UserEntity u=em.find(UserEntity.class,teacher);if(u==null||!Set.of("teacher","faculty").contains(u.getRole())||!"active".equals(u.getStatus()))throw bad("Giảng viên không hoạt động");}
        query("DELETE FROM exam_room_teachers WHERE room_id=:id",Map.of("id",id)).executeUpdate();for(Long teacher:new HashSet<>(input.ids()))query("INSERT INTO exam_room_teachers(room_id,teacher_id,assigned_by) VALUES(:id,:teacher,:actor)",Map.of("id",id,"teacher",teacher,"actor",actor.getId())).executeUpdate();log(actor,"ASSIGN_ROOM_TEACHERS","ROOM",id,"count="+input.ids().size());
    }
    public void saveClass(UserEntity actor,Long id,ClassInput input){
        admin(actor);
        String code=clean(input.code());
        if(code.isEmpty())code=id==null?codes.next(AdminCodeGenerator.Kind.CLASS):(String)query("SELECT code FROM student_classes WHERE id=:id FOR UPDATE",Map.of("id",id)).getSingleResult();
        validCatalog(code,input.name(),input.status());Map<String,Object> args=new HashMap<>(Map.of("code",code.toUpperCase(Locale.ROOT),"name",input.name().trim(),"department",clean(input.department()),"status",input.status()));
        if(count("SELECT COUNT(*) FROM student_classes WHERE LOWER(code)=LOWER(:code) AND id<>:id",Map.of("code",args.get("code"),"id",id==null?0:id))>0)throw conflict("Mã lớp đã tồn tại");
        if(id==null)id=((Number)query("INSERT INTO student_classes(code,name,department,status) VALUES(:code,:name,:department,:status) RETURNING id",args).getSingleResult()).longValue();
        else{args.put("id",id);if(query("UPDATE student_classes SET code=:code,name=:name,department=:department,status=:status,updated_at=NOW() WHERE id=:id",args).executeUpdate()==0)throw new ApiException(HttpStatus.NOT_FOUND,"Không tìm thấy lớp");}log(actor,"SAVE_STUDENT_CLASS","CLASS",id,"");
    }
    public void deleteClass(UserEntity actor,long id){admin(actor);if(count("SELECT COUNT(*) FROM users WHERE student_class_id=:id",Map.of("id",id))>0)throw conflict("Lớp có sinh viên, hãy ngưng hoạt động");query("DELETE FROM student_classes WHERE id=:id",Map.of("id",id)).executeUpdate();log(actor,"DELETE_STUDENT_CLASS","CLASS",id,"");}
    public void profile(UserEntity actor,long id,ProfileInput input){
        admin(actor);UserEntity u=em.find(UserEntity.class,id,LockModeType.PESSIMISTIC_WRITE);if(u==null||!"student".equals(u.getRole()))throw bad("Không tìm thấy sinh viên");
        if(input.classId()!=null&&count("SELECT COUNT(*) FROM student_classes WHERE id=:id AND status='active'",Map.of("id",input.classId()))==0)throw bad("Lớp không hoạt động");
        if(!u.getFullName().equals(input.fullName().trim()))throw bad("Sửa họ tên tại Quản lý tài khoản để đồng bộ Keycloak. Màn hình này chỉ cập nhật lớp và khoa.");
        u.setDepartment(clean(input.department()));u.setStudentClassId(input.classId());em.flush();query("UPDATE users SET updated_at=NOW() WHERE id=:id",Map.of("id",id)).executeUpdate();log(actor,"ASSIGN_STUDENT_CLASS","USER",id,"");
    }
    public Map<String,Object> saveSession(UserEntity actor,Long id,SessionInput input){
        requireRoom(actor,input.roomId());requireExam(actor,input.examId());
        Exam exam=em.find(Exam.class,input.examId(),LockModeType.PESSIMISTIC_WRITE);Map<String,Object> room=room(input.roomId(),true);
        if(!"active".equals(room.get("status")))throw conflict("Phòng đã ngưng hoạt động");
        if(!input.endTime().isAfter(input.startTime())||!input.endTime().isAfter(now()))throw bad("Lịch thi phải có giờ kết thúc sau giờ bắt đầu và sau hiện tại");
        if(Set.of("completed","cancelled").contains(exam.getStatus())||count("SELECT COUNT(*) FROM exam_questions WHERE exam_id=:id",Map.of("id",exam.getId()))==0)throw conflict("Đề chưa sẵn sàng tổ chức thi");
        if(id==null){var previous=rows("SELECT id FROM exam_sessions WHERE room_id=:room AND exam_id=:exam AND name=:name AND start_time=:start AND end_time=:end ORDER BY id LIMIT 1","id",Map.of("room",input.roomId(),"exam",input.examId(),"name",input.name().trim(),"start",input.startTime(),"end",input.endTime()));if(!previous.isEmpty())return Map.of("id",previous.get(0).get("id"));}
        ExamSession s=id==null?new ExamSession():session(actor,id,true);
        if(id!=null&&managed(id))throw conflict("Ca tự chia đã chốt danh sách. Hãy hủy ca và chia lại thay vì sửa lịch/phòng/đề");
        checkRoomWindow(input.roomId(),input.startTime(),input.endTime(),id==null?0:id);
        if(id!=null&&(s.getPublishedAt()!=null||count("SELECT COUNT(*) FROM exam_attempts WHERE exam_session_id=:id",Map.of("id",id))>0))throw conflict("Ca đã công bố hoặc có bài làm, không sửa lịch/đề/phòng");
        if(id!=null&&!s.getExam().getId().equals(exam.getId()))throw conflict("Không đổi đề của ca đã tạo; hãy tạo ca mới");
        s.setExam(exam);s.setRoomId(input.roomId());s.setName(input.name().trim());s.setStartTime(input.startTime());s.setEndTime(input.endTime());s.setStatus("scheduled");
        if(id==null){s.setRoomCode("EXAM-"+UUID.randomUUID().toString().substring(0,8).toUpperCase());s.setAccessCode(s.getRoomCode());em.persist(s);}em.flush();log(actor,"SAVE_ASSIGNED_SESSION","SESSION",s.getId(),"roomId="+input.roomId());return Map.of("id",s.getId());
    }
    private boolean managed(long id){return count("SELECT COUNT(*) FROM exam_sessions WHERE id=:id AND ((exam_period_id IS NOT NULL AND EXISTS(SELECT 1 FROM exam_session_students rs WHERE rs.exam_session_id=exam_sessions.id)) OR EXISTS(SELECT 1 FROM exam_sitting_groups g WHERE g.session_id=exam_sessions.id))",Map.of("id",id))>0;}
    private void checkRoomWindow(long roomId,LocalDateTime start,LocalDateTime end,long except){
        var args=Map.of("room",roomId,"id",except,"start",start,"end",end);
        if(count("SELECT COUNT(*) FROM exam_sessions WHERE room_id=:room AND id<>:id AND status<>'cancelled' AND start_time<:end AND end_time>:start",args)>0||count("SELECT COUNT(*) FROM exam_sitting_groups g JOIN exam_sittings s ON s.id=g.sitting_id WHERE g.room_id=:room AND g.status<>'cancelled' AND g.session_id IS NULL AND s.start_time<:end AND s.end_time>:start",Map.of("room",roomId,"start",start,"end",end))>0)throw conflict("Phòng đã có ca hoặc nhóm trùng lịch. Hãy chọn phòng khác.");
    }
    public Map<String,Object> publish(UserEntity actor,long id){
        ExamSession s=session(actor,id,true);if(s.getPublishedAt()!=null)return detail(actor,id);
        if(s.getRoomId()==null)throw bad("Ca cũ chưa gắn phòng. Cần đối chiếu trước khi công bố");
        requireRoom(actor,s.getRoomId());requireExam(actor,s.getExam().getId());Map<String,Object> room=room(s.getRoomId(),true);
        if(!"active".equals(room.get("status"))||!Set.of("scheduled","ongoing").contains(s.getStatus())||!s.getEndTime().isAfter(now()))throw conflict("Phòng hoặc lịch thi không hợp lệ để công bố");
        if(Set.of("completed","cancelled").contains(s.getExam().getStatus())||!"active".equals(s.getExam().getCourse().getStatus()))throw conflict("Đề hoặc học phần không còn hoạt động để công bố");
        if(count("SELECT COUNT(*) FROM exam_questions WHERE exam_id=:id",Map.of("id",s.getExam().getId()))==0)throw conflict("Đề chưa có câu hỏi");
        if(snapshots!=null&&snapshots.usesSnapshots(s.getExam().getId())) {
            for(Object raw:query("SELECT id FROM exam_questions WHERE exam_id=:id",Map.of("id",s.getExam().getId())).getResultList()) {
                var frozen=snapshots.find(((Number)raw).longValue()).orElseThrow(()->conflict("Đề thiếu bản lưu nội dung câu hỏi."));
                if(frozen.options().size()<2||frozen.options().stream().noneMatch(a->a.id()==frozen.correctAnswerId()))throw conflict("Đề có bản lưu đáp án không hợp lệ.");
            }
        }else if(count("SELECT COUNT(*) FROM exam_questions eq LEFT JOIN questions q ON q.id=eq.question_id WHERE eq.exam_id=:id AND (q.id IS NULL OR (SELECT COUNT(*) FROM answers a WHERE a.question_id=q.id)<2 OR (SELECT COUNT(*) FROM answers a WHERE a.question_id=q.id AND a.is_correct=TRUE)<>1)",Map.of("id",s.getExam().getId()))>0)throw conflict("Đề có câu hỏi thiếu đáp án hoặc không có đúng một đáp án đúng. Kiểm tra ngân hàng câu hỏi trước khi công bố.");
        checkRoomWindow(s.getRoomId(),s.getStartTime(),s.getEndTime(),id);
        boolean allocated=managed(id);
        long total;
        if(allocated){
            boolean departmentGroup=count("SELECT COUNT(*) FROM exam_sitting_groups WHERE session_id=:id",Map.of("id",id))>0;
            if(departmentGroup&&count("SELECT COUNT(*) FROM exam_sitting_groups g JOIN users u ON u.id=g.teacher_id WHERE g.session_id=:id AND g.status<>'cancelled' AND u.role IN ('teacher','faculty') AND u.status='active' AND g.exam_id=:exam AND g.room_id=:room",Map.of("id",id,"exam",s.getExam().getId(),"room",s.getRoomId()))!=1)throw conflict("Nhóm chưa có phân công giảng viên hợp lệ");
            total=departmentGroup?count("SELECT COUNT(*) FROM exam_sitting_students rs JOIN exam_sitting_groups g ON g.id=rs.group_id WHERE g.session_id=:id AND rs.released_at IS NULL",Map.of("id",id)):count("SELECT COUNT(*) FROM exam_session_students WHERE exam_session_id=:id",Map.of("id",id));
            if(total==0||total!=count("SELECT COUNT(*) FROM exam_session_students WHERE exam_session_id=:id",Map.of("id",id)))throw conflict("Danh sách tự chia không khớp, cần kiểm tra trước khi công bố");
            if(count("SELECT COUNT(*) FROM exam_session_students rs JOIN users u ON u.id=rs.student_id WHERE rs.exam_session_id=:id AND (u.role<>'student' OR u.status<>'active')",Map.of("id",id))>0)throw conflict("Ca có sinh viên ngưng hoạt động");
        }else{
        if(count("SELECT COUNT(*) FROM exam_attempts WHERE exam_session_id=:id",Map.of("id",id))>0||count("SELECT COUNT(*) FROM exam_session_students WHERE exam_session_id=:id",Map.of("id",id))>0)throw conflict("Ca đã có dữ liệu cũ. Cần đối chiếu danh sách trước khi chuyển đổi; hãy tạo ca mới.");
        total=count("SELECT COUNT(*) FROM exam_room_students WHERE room_id=:id",Map.of("id",s.getRoomId()));if(total==0)throw conflict("Phòng chưa có sinh viên");
        if(count("SELECT COUNT(*) FROM exam_room_students rs JOIN users u ON u.id=rs.student_id WHERE rs.room_id=:id AND (u.role<>'student' OR u.status<>'active')",Map.of("id",s.getRoomId()))>0)throw conflict("Phòng có sinh viên ngưng hoạt động, cần kiểm tra danh sách");
        query("INSERT INTO exam_session_students(exam_session_id,student_id,status) SELECT :session,student_id,'registered' FROM exam_room_students WHERE room_id=:room ON CONFLICT(exam_session_id,student_id) DO NOTHING",Map.of("session",id,"room",s.getRoomId())).executeUpdate();
        }
        if(total>((Number)room.get("capacity")).longValue())throw conflict("Danh sách vượt sức chứa phòng");
        // Lock students in a stable order, including across different exam periods/courses.
        query("SELECT u.id FROM users u JOIN exam_session_students rs ON rs.student_id=u.id WHERE rs.exam_session_id=:id ORDER BY u.id FOR UPDATE OF u",Map.of("id",id)).getResultList();
        if(count("SELECT COUNT(*) FROM exam_session_students a JOIN exam_session_students b ON b.student_id=a.student_id JOIN exam_sessions other ON other.id=b.exam_session_id WHERE a.exam_session_id=:id AND other.id<>:id AND other.status<>'cancelled' AND other.start_time<:end AND other.end_time>:start",Map.of("id",id,"start",s.getStartTime(),"end",s.getEndTime()))>0)throw conflict("Sinh viên có lịch thi trùng ca này");
        if(count("SELECT COUNT(*) FROM exam_session_students rs JOIN exam_sitting_students other ON other.student_id=rs.student_id JOIN exam_sitting_groups g ON g.id=other.group_id JOIN exam_sittings sit ON sit.id=g.sitting_id WHERE rs.exam_session_id=:id AND other.released_at IS NULL AND g.status<>'cancelled' AND (g.session_id IS NULL OR g.session_id<>:id) AND sit.start_time<:end AND sit.end_time>:start",Map.of("id",id,"start",s.getStartTime(),"end",s.getEndTime()))>0)throw conflict("Sinh viên đã được chia nhóm trùng giờ ở ca khác");
        s.setPublishedAt(Instant.now());query("UPDATE exam_sessions SET published_by=:actor WHERE id=:id",Map.of("id",id,"actor",actor.getId())).executeUpdate();
        s.setStatus(s.getStartTime().isAfter(now())?"scheduled":"ongoing");AdminCatalogService.updateExamSchedule(em,s.getExam());log(actor,"PUBLISH_SESSION","SESSION",id,"students="+total);return detail(actor,id);
    }
    public Map<String,Object> detail(UserEntity actor,long id){session(actor,id,false);return sessionDetailData(id);} public Map<String,Object> monitoringDetail(UserEntity actor,long id){requireMonitoring(actor,id);return sessionDetailData(id);} private Map<String,Object> sessionDetailData(long id){Map<String,Object> result=new LinkedHashMap<>(workspace.sessionDetail(id));result.put("aiEnabled",query("SELECT COALESCE(s.ai_enabled,(SELECT p.enabled FROM exam_ai_policies p WHERE p.exam_id=s.exam_id),TRUE) FROM exam_sessions s WHERE s.id=:id",Map.of("id",id)).getSingleResult());if(batchMonitoring!=null){List<Long> ids=rows("SELECT id FROM exam_attempts WHERE exam_session_id=:id","id",Map.of("id",id)).stream().map(row->((Number)row.get("id")).longValue()).toList();result.put("monitoring",batchMonitoring.forAttempts(ids));}result.put("allocationManaged",managed(id));result.put("roster",rows("SELECT u.id,u.username,u.full_name,u.department,cl.name,a.id,CASE WHEN a.status='in_progress' AND s.end_time<=:clock THEN 'expired' ELSE a.status END,a.started_at,a.submitted_at,a.score,(SELECT COUNT(*) FROM anti_cheat_events v WHERE v.attempt_id=a.id AND v.active=TRUE),(SELECT COALESCE((ARRAY_AGG(v.risk_level ORDER BY v.risk_score DESC))[1],'LOW') FROM anti_cheat_events v WHERE v.attempt_id=a.id AND v.active=TRUE) FROM exam_session_students rs JOIN exam_sessions s ON s.id=rs.exam_session_id JOIN exams e ON e.id=s.exam_id JOIN users u ON u.id=rs.student_id LEFT JOIN student_classes cl ON cl.id=u.student_class_id LEFT JOIN exam_attempts a ON a.exam_session_id=rs.exam_session_id AND a.student_id=rs.student_id WHERE rs.exam_session_id=:id ORDER BY (SELECT a.position FROM exam_sitting_students a JOIN exam_sitting_groups g ON g.id=a.group_id WHERE g.session_id=rs.exam_session_id AND a.student_id=u.id),u.username","id,username,name,department,className,attemptId,attemptStatus,startedAt,submittedAt,score,warningCount,riskLevel",Map.of("id",id,"clock",now())));return result;}
    public Map<String,Object> status(UserEntity actor,long id,String status){session(actor,id,true);workspace.updateSessionStatus(actor.getId(),id,status);return detail(actor,id);}
    public Page sessions(UserEntity actor,boolean live,String q,int page,int size){return sessionPage(actor,live,q,page,size,false);} public Page monitoringSessions(UserEntity actor,boolean live,String q,int page,int size){return sessionPage(actor,live,q,page,size,true);} private Page sessionPage(UserEntity actor,boolean live,String q,int page,int size,boolean monitorOnly){
        if(page<0||size<1||size>100)throw bad("Phân trang không hợp lệ");
        Map<String,Object> args=new HashMap<>();String where=" WHERE TRUE";
        if(monitorOnly){where+=" AND s.published_at IS NOT NULL";if(!isAdmin(actor)){where+=" AND "+monitoringAccess();args.put("actor",actor.getId());}}else if(!isAdmin(actor)){where+=" AND e.created_by=:actor AND EXISTS(SELECT 1 FROM exam_room_teachers rt WHERE rt.room_id=s.room_id AND rt.teacher_id=:actor) AND (c.created_by=:actor OR EXISTS(SELECT 1 FROM course_faculties cf WHERE cf.course_id=c.id AND cf.faculty_id=:actor))";args.put("actor",actor.getId());}
        if(live){where+=" AND s.published_at IS NOT NULL AND s.status IN ('scheduled','ongoing') AND s.start_time<=:clock AND s.end_time>:clock";args.put("clock",now());}
        if(!clean(q).isEmpty()){where+=" AND STRPOS(LOWER(CONCAT_WS(' ',s.name,r.code,r.name,e.code,e.title,c.code,(SELECT STRING_AGG(u.full_name,' ') FROM users u WHERE u.id IN (SELECT teacher_id FROM exam_sitting_groups WHERE session_id=s.id UNION SELECT rt.teacher_id FROM exam_room_teachers rt WHERE rt.room_id=r.id AND NOT EXISTS(SELECT 1 FROM exam_sitting_groups g WHERE g.session_id=s.id))))),LOWER(:q))>0";args.put("q",q.trim());}
        String from=" FROM exam_sessions s JOIN exams e ON e.id=s.exam_id JOIN courses c ON c.id=e.course_id LEFT JOIN exam_rooms r ON r.id=s.room_id";
        long total=count("SELECT COUNT(*)"+from+where,args);args.put("clock",now());args.put("size",size);args.put("offset",(long)page*size);
        String roster=" FROM exam_session_students rs LEFT JOIN exam_attempts a ON a.exam_session_id=rs.exam_session_id AND a.student_id=rs.student_id WHERE rs.exam_session_id=s.id";
        String sql="SELECT s.id,s.name,s.room_id,r.code,r.name,e.id,e.code,e.title,c.code,s.start_time,s.end_time,CASE WHEN s.status IN ('completed','cancelled') THEN s.status WHEN s.published_at IS NOT NULL AND s.end_time<=:clock THEN 'completed' WHEN s.published_at IS NOT NULL AND s.start_time<=:clock THEN 'ongoing' ELSE s.status END,s.published_at,COALESCE(s.ai_enabled,(SELECT p.enabled FROM exam_ai_policies p WHERE p.exam_id=e.id),TRUE),((s.exam_period_id IS NOT NULL AND EXISTS(SELECT 1 FROM exam_session_students rs WHERE rs.exam_session_id=s.id)) OR EXISTS(SELECT 1 FROM exam_sitting_groups g WHERE g.session_id=s.id)),"+
          "(SELECT STRING_AGG(u.full_name,', ' ORDER BY u.full_name) FROM users u WHERE u.id IN (SELECT teacher_id FROM exam_sitting_groups WHERE session_id=s.id UNION SELECT rt.teacher_id FROM exam_room_teachers rt WHERE rt.room_id=s.room_id AND NOT EXISTS(SELECT 1 FROM exam_sitting_groups g WHERE g.session_id=s.id))),"+
          "(SELECT COUNT(*) FROM exam_session_students rs WHERE rs.exam_session_id=s.id),"+
          "(SELECT COUNT(*)"+roster+" AND a.id IS NULL),"+
          "(SELECT COUNT(*)"+roster+" AND a.status='in_progress' AND s.end_time>:clock),"+
          "(SELECT COUNT(*)"+roster+" AND a.status IN ('submitted','completed')),"+
          "(SELECT COUNT(*)"+roster+" AND (a.status='expired' OR (a.status='in_progress' AND s.end_time<=:clock))),"+
          "(SELECT COUNT(*)"+roster+" AND EXISTS(SELECT 1 FROM anti_cheat_events v WHERE v.attempt_id=a.id AND v.active=TRUE))"+from+where+" ORDER BY s.start_time DESC,s.id DESC LIMIT :size OFFSET :offset";
        return new Page(rows(sql,"id,name,roomId,roomCode,roomName,examId,examCode,examTitle,courseCode,startTime,endTime,status,publishedAt,aiEnabled,allocationManaged,teachers,totalStudents,notEntered,inProgress,submitted,expired,warnedAttempts",args),total,page,size,now());
    }
}
