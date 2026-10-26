package com.examflow.backend.service;

import com.examflow.backend.entity.*;
import com.examflow.backend.exception.ApiException;
import jakarta.persistence.*;
import jakarta.validation.constraints.*;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.math.BigDecimal;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.LocalDateTime;
import java.util.*;

@Service
public class TeacherAssignedExamService {
    private final JdbcTemplate jdbc;
    private final AdminCatalogService catalog;
    private final ExamSnapshotReadService snapshots;
    private final AdminService audit;
    @PersistenceContext private EntityManager em;
    public TeacherAssignedExamService(JdbcTemplate jdbc,AdminCatalogService catalog,ExamSnapshotReadService snapshots,AdminService audit) {
        this.jdbc=jdbc;this.catalog=catalog;this.snapshots=snapshots;this.audit=audit;
    }
    public record Group(long id,long sittingId,int number,String name,long courseId,String courseCode,String courseName,
        String roomCode,String roomName,LocalDateTime startTime,LocalDateTime endTime,int studentCount,
        Long examId,String examCode,String examTitle,boolean published,String status,boolean canChangeExam,String lockReason,
        Long sessionId,int attempts) {}
    public record Choice(long id,String code,String title,int questions,BigDecimal totalPoints) {}
    public record Choices(Group group,List<Choice> exams) {}
    public record Selection(@NotNull @Positive Long examId,Long expectedExamId,@NotBlank String expectedToken) {}
    private static final String GROUP_SQL="""
        SELECT g.id,g.sitting_id,g.group_number,s.name,s.course_id,c.code AS course_code,c.name AS course_name,
            r.code AS room_code,r.name AS room_name,s.start_time,s.end_time,g.exam_id,e.code AS exam_code,e.title AS exam_title,
            g.session_id,es.published_at,g.status AS group_status,es.status AS session_status,
            (SELECT COUNT(*) FROM exam_sitting_students ss WHERE ss.group_id=g.id) AS students,
            (SELECT COUNT(*) FROM exam_attempts a WHERE a.exam_session_id=g.session_id) AS attempts
        FROM exam_sitting_groups g JOIN exam_sittings s ON s.id=g.sitting_id JOIN courses c ON c.id=s.course_id
        LEFT JOIN exam_rooms r ON r.id=g.room_id LEFT JOIN exams e ON e.id=g.exam_id LEFT JOIN exam_sessions es ON es.id=g.session_id
        WHERE g.teacher_id=?
        """;
    private static void teacher(UserEntity actor) {
        if(!Set.of("teacher","faculty").contains(actor.getRole())||!"active".equals(actor.getStatus()))
            throw new ApiException(HttpStatus.FORBIDDEN,"Chỉ giảng viên đang hoạt động mới được chọn đề cho nhóm được phân công.");
    }
    private static ApiException conflict(String text){return new ApiException(HttpStatus.CONFLICT,text);}
    private static Long nullableId(ResultSet rs,String name)throws SQLException{long id=rs.getLong(name);return rs.wasNull()?null:id;}
    private Group map(ResultSet rs,int row)throws SQLException {
        var start=rs.getTimestamp("start_time").toLocalDateTime();var end=rs.getTimestamp("end_time").toLocalDateTime();
        Long session=nullableId(rs,"session_id");int attempts=rs.getInt("attempts");boolean published=rs.getTimestamp("published_at")!=null;
        String status="cancelled".equals(rs.getString("group_status"))||"cancelled".equals(rs.getString("session_status"))?"cancelled":
            "completed".equals(rs.getString("session_status"))||!end.isAfter(ExamOrganizationService.now())?"completed":
            !start.isAfter(ExamOrganizationService.now())?"ongoing":"scheduled";
        String reason=changeRestriction(status,start,published,session,attempts,ExamOrganizationService.now());
        return new Group(rs.getLong("id"),rs.getLong("sitting_id"),rs.getInt("group_number"),rs.getString("name"),rs.getLong("course_id"),
            rs.getString("course_code"),rs.getString("course_name"),rs.getString("room_code"),rs.getString("room_name"),start,end,rs.getInt("students"),
            nullableId(rs,"exam_id"),rs.getString("exam_code"),rs.getString("exam_title"),published,status,reason.isEmpty(),reason,session,attempts);
    }
    static String changeRestriction(String status,LocalDateTime start,boolean published,Long session,int attempts,LocalDateTime now) {
        if("cancelled".equals(status))return "Ca/nhóm đã hủy, không thể chọn hoặc đổi đề.";
        if(attempts>0)return "Ca đã có bài làm, không thể thay đổi đề.";
        if("completed".equals(status))return "Ca đã kết thúc, không thể thay đổi đề.";
        if(!start.isAfter(now))return "Ca đã đến giờ bắt đầu, không thể thay đổi đề.";
        if(published||session!=null)return "Ca đã công bố hoặc đã được chốt, không thể thay đổi đề.";
        return "";
    }
    @Transactional(readOnly=true)
    public List<Group> list(UserEntity actor) { teacher(actor);return jdbc.query(GROUP_SQL+" ORDER BY s.start_time DESC,g.id DESC",this::map,actor.getId()); }
    private Group group(UserEntity actor,long id,boolean lock) {
        teacher(actor);
        // Same lock order as admin scheduling/publishing: sitting -> group -> exam.
        if(lock) {
            var sitting=jdbc.query("SELECT sitting_id FROM exam_sitting_groups WHERE id=? AND teacher_id=?",(rs,n)->rs.getLong(1),id,actor.getId());
            if(sitting.isEmpty())throw new ApiException(HttpStatus.FORBIDDEN,"Bạn không được phân công nhóm dự thi này.");
            jdbc.queryForObject("SELECT id FROM exam_sittings WHERE id=? FOR UPDATE",Long.class,sitting.get(0));
        }
        var rows=jdbc.query(GROUP_SQL+" AND g.id=?"+(lock?" FOR UPDATE OF g":""),this::map,actor.getId(),id);
        if(rows.isEmpty())throw new ApiException(HttpStatus.FORBIDDEN,"Bạn không còn được phân công nhóm dự thi này.");
        return rows.get(0);
    }
    @Transactional(readOnly=true)
    public Choices choices(UserEntity actor,long groupId,String search) {
        var group=group(actor,groupId,false);
        if(!group.canChangeExam())return new Choices(group,List.of());
        String text=search==null?"":search.trim();
        var choices=jdbc.query("""
            SELECT e.id,e.code,e.title,e.total_questions,e.total_points FROM exams e
            WHERE e.created_by=? AND e.course_id=? AND e.status NOT IN ('cancelled','completed') AND e.total_questions>0 AND e.total_points>0
            AND e.total_questions=(SELECT COUNT(*) FROM exam_questions eq WHERE eq.exam_id=e.id)
            AND STRPOS(LOWER(CONCAT_WS(' ',e.code,e.title)),LOWER(?))>0 ORDER BY e.created_at DESC,e.id DESC
            """,(rs,n)->new Choice(rs.getLong(1),rs.getString(2),rs.getString(3),rs.getInt(4),rs.getBigDecimal(5)),actor.getId(),group.courseId(),text);
        return new Choices(group,choices);
    }
    private Exam eligible(UserEntity actor,Group group,long examId,boolean lock) {
        Exam exam=lock?em.find(Exam.class,examId,LockModeType.PESSIMISTIC_WRITE):em.find(Exam.class,examId);
        if(exam==null)throw new ApiException(HttpStatus.NOT_FOUND,"Không tìm thấy đề thi.");
        if(!Objects.equals(exam.getCreatedBy(),actor.getId())||exam.getCourse().getId()!=group.courseId())
            throw new ApiException(HttpStatus.FORBIDDEN,"Chỉ chọn đề do bạn tạo và đúng môn học của ca được phân công.");
        if(Set.of("cancelled","completed").contains(exam.getStatus()))throw conflict("Đề thi đã ngừng sử dụng.");
        return exam;
    }
    private Map<String,Object> content(long examId) {
        var review=catalog.reviewExam(examId);
        var questionRows=jdbc.query("SELECT id FROM exam_questions WHERE exam_id=? ORDER BY position,id",(rs,n)->rs.getLong(1),examId);
        if(questionRows.isEmpty())throw conflict("Đề thi chưa có câu hỏi.");
        for(long link:questionRows) {
            var snapshot=snapshots.find(link).orElseThrow(()->conflict("Đề thiếu nội dung câu hỏi đã lưu."));
            if(snapshot.content()==null||snapshot.content().isBlank()||snapshot.options().size()<2||
                snapshot.options().stream().anyMatch(a->a.content()==null||a.content().isBlank())||
                snapshot.options().stream().filter(a->a.id()==snapshot.correctAnswerId()).count()!=1)
                throw conflict("Đề có nội dung hoặc đáp án không hợp lệ.");
        }
        var safe=new LinkedHashMap<String,Object>();
        for(String key:List.of("id","code","title","courseName","totalPoints","questions","revisionToken"))safe.put(key,review.get(key));
        return safe;
    }
    @Transactional(readOnly=true)
    public Map<String,Object> preview(UserEntity actor,long groupId,long examId) {
        var group=group(actor,groupId,false);
        // An assigned teacher can still review the exam actually used by their own ended/cancelled group.
        if(!Objects.equals(group.examId(),examId))eligible(actor,group,examId,false);
        return content(examId);
    }
    @Transactional
    public Group select(UserEntity actor,long groupId,Selection input) {
        var group=group(actor,groupId,true);
        if(!group.canChangeExam())throw conflict(group.lockReason());
        if(!Objects.equals(group.examId(),input.expectedExamId())) {
            if(Objects.equals(group.examId(),input.examId()))return group; // Retry after a successful save whose response was lost.
            throw conflict("Đề của nhóm đã thay đổi ở phiên khác. Hãy tải lại trước khi chọn đề.");
        }
        Exam exam=eligible(actor,group,input.examId(),true);
        if(exam.getTotalQuestions()==null||exam.getTotalQuestions()<=0||exam.getTotalPoints()==null||exam.getTotalPoints().signum()<=0)
            throw conflict("Đề chưa đủ số câu hoặc tổng điểm hợp lệ.");
        var review=content(exam.getId());
        if(!Objects.equals(review.get("revisionToken"),input.expectedToken()))throw conflict("Nội dung đề đã thay đổi sau khi xem trước. Hãy xem lại trước khi xác nhận.");
        var links=jdbc.query("SELECT id FROM exam_questions WHERE exam_id=? ORDER BY position,id",(rs,n)->rs.getLong(1),exam.getId());
        if(links.size()!=exam.getTotalQuestions())throw conflict("Số câu đã lưu không khớp cấu hình đề.");
        for(long link:links)snapshots.freezeLegacy(link,exam.getId(),group.courseId());
        if(!Objects.equals(group.examId(),exam.getId())) {
            jdbc.update("UPDATE exam_sitting_groups SET exam_id=? WHERE id=? AND teacher_id=?",exam.getId(),groupId,actor.getId());
            audit.audit(actor.getId(),"SELECT_SITTING_EXAM","EXAM_SITTING_GROUP",groupId,"examId="+exam.getId());
        }
        return group(actor,groupId,false);
    }
}
