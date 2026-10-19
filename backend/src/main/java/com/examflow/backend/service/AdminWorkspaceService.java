package com.examflow.backend.service;

import com.examflow.backend.exception.ApiException;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import jakarta.persistence.Query;
import jakarta.transaction.Transactional;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.*;

/** Paged administrative reads. All SQL identifiers come from the resource whitelist. */
@Service
public class AdminWorkspaceService {
    @PersistenceContext private EntityManager em;
    private final AdminService admin;

    public AdminWorkspaceService(AdminService admin) { this.admin = admin; }
    public record Page(List<Map<String, Object>> items, long total, int page, int size) {}
    public record Filters(String q, String status, String role, String course, Long sessionId, LocalDate from, LocalDate to, String sessionCode) {
        public Filters(String q,String status,String role,String course,Long sessionId,LocalDate from,LocalDate to) {
            this(q,status,role,course,sessionId,from,to,"");
        }
        public Filters {
            q = clean(q); status = clean(status); role = clean(role); course = clean(course); sessionCode=clean(sessionCode);
            if (from != null && to != null && from.isAfter(to))
                throw new ApiException(HttpStatus.BAD_REQUEST, "Ngày bắt đầu phải trước hoặc bằng ngày kết thúc");
        }
    }
    private record Dataset(String select, String from, String order, String[] columns) {}
    private record Where(String sql, Map<String, Object> parameters) {}

    private Dataset dataset(String resource) {
        return switch (resource) {
            case "users", "students", "teachers" -> new Dataset(
                    "u.id,u.username,u.email,u.full_name,u.role,u.department,u.status,u.created_at,u.student_class_id,sc.code,sc.name",
                    "users u LEFT JOIN student_classes sc ON sc.id=u.student_class_id", "u.created_at DESC,u.id DESC",
                    fields("id,username,email,fullName,role,department,status,createdAt,studentClassId,classCode,className"));
            case "courses" -> new Dataset("c.id,c.code,c.name,c.department,c.status,"
                    + "(SELECT COUNT(*) FROM questions q WHERE q.course_id=c.id),"
                    + "(SELECT COUNT(*) FROM exams e WHERE e.course_id=c.id),"
                    + "(SELECT COUNT(*) FROM exam_sessions s JOIN exams e ON e.id=s.exam_id WHERE e.course_id=c.id),c.credits,c.description,c.created_by,COALESCE((SELECT u.full_name FROM users u WHERE u.id=c.created_by),'')",
                    "courses c", "c.id DESC", fields("id,code,name,department,status,questionCount,examCount,sessionCount,credits,description,teacherId,teacherName"));
            case "exams" -> new Dataset("e.id,e.code,e.title,c.code,c.name,e.total_questions,e.total_points,e.status,e.exam_date,"
                    + "COALESCE(p.enabled,TRUE),(SELECT COUNT(*) FROM exam_sessions s WHERE s.exam_id=e.id),"
                    + "(SELECT COUNT(*) FROM exam_attempts a WHERE a.exam_id=e.id),"
                    + "COALESCE((SELECT ROUND(AVG(a.score),2) FROM exam_attempts a WHERE a.exam_id=e.id AND a.status IN ('submitted','completed')),0)",
                    "exams e JOIN courses c ON c.id=e.course_id LEFT JOIN exam_ai_policies p ON p.exam_id=e.id",
                    "e.id DESC", fields("id,code,title,courseCode,courseName,totalQuestions,totalPoints,status,examDate,antiCheatMode,sessionCount,attemptCount,averageScore"));
            case "sessions" -> new Dataset("s.id,s.exam_id,e.code,e.title,COALESCE(cl.name,''),s.room_code,s.access_code,s.start_time,s.end_time,s.status,"
                    + "(SELECT COUNT(*) FROM exam_session_students r WHERE r.exam_session_id=s.id),"
                    + "(SELECT COUNT(*) FROM exam_attempts a WHERE a.exam_session_id=s.id),s.name",
                    "exam_sessions s JOIN exams e ON e.id=s.exam_id JOIN courses c ON c.id=e.course_id LEFT JOIN classes cl ON cl.id=s.class_id",
                    "s.start_time DESC,s.id DESC", fields("id,examId,examCode,examTitle,className,roomCode,accessCode,startTime,endTime,status,registeredCount,attemptCount,name"));
            case "warning-sessions" -> new Dataset(
                    "s.id,s.name,s.room_code,e.code,e.title,c.code,c.name,s.start_time,s.end_time,s.status,w.students,w.attempts,w.browser,w.ai,w.last_warning",
                    "exam_sessions s JOIN exams e ON e.id=s.exam_id JOIN courses c ON c.id=e.course_id JOIN LATERAL (SELECT COUNT(DISTINCT a.student_id) AS students,COUNT(DISTINCT a.id) AS attempts,COUNT(*) FILTER (WHERE v.module='M7') AS browser,COUNT(*) FILTER (WHERE v.module<>'M7') AS ai,MAX(v.occurred_at) AS last_warning FROM exam_attempts a JOIN anti_cheat_events v ON v.attempt_id=a.id AND v.active=TRUE WHERE a.exam_session_id=s.id) w ON w.attempts>0",
                    "w.last_warning DESC NULLS LAST,s.id DESC",
                    fields("id,name,sessionCode,examCode,examTitle,courseCode,courseName,startTime,endTime,status,warnedStudents,warnedAttempts,browserEvents,aiEvents,lastWarningAt"));
            case "attempts", "anti", "reports" -> new Dataset("a.id,a.exam_session_id,u.username,u.full_name,e.code,e.title,a.started_at,a.submitted_at,a.score,e.total_points,a.status,"
                    + "(SELECT COUNT(*) FROM anti_cheat_events v WHERE v.attempt_id=a.id AND v.module='M7' AND v.active=TRUE),"
                    + "(SELECT COUNT(*) FROM anti_cheat_events v WHERE v.attempt_id=a.id AND v.module<>'M7' AND v.active=TRUE),"
                    + "COALESCE(r.outcome,'unreviewed'),c.code,c.name,"
                    + "COALESCE((SELECT MAX(v.risk_score) FROM anti_cheat_events v WHERE v.attempt_id=a.id AND v.active=TRUE),0),"
                    + "(SELECT s.room_code FROM exam_sessions s WHERE s.id=a.exam_session_id)",
                    attemptsFrom(), "a.id DESC", fields("id,sessionId,studentUsername,studentName,examCode,examTitle,startedAt,submittedAt,score,totalPoints,status,browserEvents,aiEvents,reviewOutcome,courseCode,courseName,riskScore,sessionCode"));
            case "audit" -> new Dataset("l.id,l.actor_id,COALESCE(u.username,''),l.action,l.target_type,l.target_id,l.detail,l.created_at",
                    "audit_logs l LEFT JOIN users u ON u.id=l.actor_id", "l.created_at DESC,l.id DESC",
                    fields("id,actorId,actorUsername,action,targetType,targetId,detail,createdAt"));
            default -> throw new ApiException(HttpStatus.NOT_FOUND, "Không có danh mục quản trị này");
        };
    }

    private static String attemptsFrom() {
        return "exam_attempts a JOIN users u ON u.id=a.student_id JOIN exams e ON e.id=a.exam_id "
                + "JOIN courses c ON c.id=e.course_id LEFT JOIN attempt_reviews r ON r.attempt_id=a.id";
    }

    private Where where(String resource, Filters f) {
        Map<String, Object> parameters = new LinkedHashMap<>();
        List<String> clauses = new ArrayList<>();
        String search, state, clock;
        switch (resource) {
            case "users", "students", "teachers" -> {
                search = "u.username,u.email,u.full_name,u.department,sc.code,sc.name"; state = "u.status"; clock = "u.created_at";
                if (resource.equals("students")) clauses.add("u.role='student'");
                else if (resource.equals("teachers")) clauses.add("u.role IN ('faculty','teacher')");
                else if (!f.role.isEmpty()) {
                    if (f.role.equals("teacher")) clauses.add("u.role IN ('faculty','teacher')");
                    else { clauses.add("u.role=:role"); parameters.put("role", f.role); }
                }
            }
            case "courses" -> { search = "c.code,c.name,c.department"; state = "c.status"; clock = null; }
            case "exams" -> { search = "e.code,e.title,c.code,c.name"; state = "e.status"; clock = "e.exam_date"; }
            case "sessions" -> { search = "e.code,e.title,s.room_code,s.name,cl.name,c.code"; state = "s.status"; clock = "s.start_time"; }
            case "warning-sessions" -> {
                search="s.name,s.room_code,e.code,e.title,c.code,c.name";state="s.status";clock="s.start_time";
                if(f.sessionId!=null){clauses.add("s.id=:sessionId");parameters.put("sessionId",f.sessionId);}
                if(!f.sessionCode.isEmpty()){clauses.add("LOWER(s.room_code)=LOWER(:sessionCode)");parameters.put("sessionCode",f.sessionCode);}
            }
            case "audit" -> { search = "u.username,l.action,l.detail,l.target_type,l.target_id"; state = null; clock = "l.created_at"; }
            default -> {
                search = "u.username,u.full_name,e.code,e.title,c.code,c.name"; state = "a.status"; clock = "a.started_at";
                if (resource.equals("anti")) clauses.add("EXISTS (SELECT 1 FROM anti_cheat_events v WHERE v.attempt_id=a.id AND v.active=TRUE)");
                if (resource.equals("reports")) { clauses.add("a.status IN ('submitted','completed')"); clock = "a.submitted_at"; }
                if (f.sessionId != null) { clauses.add("a.exam_session_id=:sessionId"); parameters.put("sessionId", f.sessionId); }
                if (!f.sessionCode.isEmpty()) {
                    clauses.add("EXISTS (SELECT 1 FROM exam_sessions fs WHERE fs.id=a.exam_session_id AND LOWER(fs.room_code)=LOWER(:sessionCode))");
                    parameters.put("sessionCode",f.sessionCode);
                }
            }
        }
        if (!f.q.isEmpty()) {
            clauses.add("LOWER(CONCAT_WS(' '," + search + ")) LIKE :q ESCAPE '\\'");
            parameters.put("q", "%" + f.q.toLowerCase(Locale.ROOT).replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%");
        }
        if (state != null && !f.status.isEmpty()) { clauses.add(state + "=:status"); parameters.put("status", f.status); }
        if (!f.course.isEmpty() && Set.of("courses", "exams", "sessions", "warning-sessions", "attempts", "anti", "reports").contains(resource)) {
            clauses.add("LOWER(c.code)=LOWER(:course)"); parameters.put("course", f.course);
        }
        if (clock != null && f.from != null) { clauses.add(clock + ">=:from"); parameters.put("from", f.from.atStartOfDay()); }
        if (clock != null && f.to != null) { clauses.add(clock + "<:to"); parameters.put("to", f.to.plusDays(1).atStartOfDay()); }
        return new Where(clauses.isEmpty() ? "" : " WHERE " + String.join(" AND ", clauses), parameters);
    }

    @Transactional
    public Page list(String resource, Filters filters, int page, int size) {
        if (page < 0 || size < 1 || size > 100 || (long) page * size > Integer.MAX_VALUE)
            throw new ApiException(HttpStatus.BAD_REQUEST, "Phân trang không hợp lệ (tối đa 100 dòng/trang)");
        prepare();
        Dataset d = dataset(resource);
        Where w = where(resource, filters);
        long total = ((Number) bind("SELECT COUNT(*) FROM " + d.from + w.sql, w).getSingleResult()).longValue();
        List<?> rows = bind("SELECT " + d.select + " FROM " + d.from + w.sql + " ORDER BY " + d.order, w)
                .setFirstResult(page * size).setMaxResults(size).getResultList();
        return new Page(rows.stream().map(row -> map(d.columns, (Object[]) row)).toList(), total, page, size);
    }

    @Transactional
    public Map<String, Object> report(Filters filters) {
        prepare();
        Where w = where("reports", filters);
        String base = " FROM " + attemptsFrom() + w.sql;
        String valid="a.score IS NOT NULL AND e.total_points>0 AND a.score>=0 AND a.score<=e.total_points";
        Object[] totals = (Object[]) bind("SELECT COUNT(*),COALESCE(ROUND(AVG(100.0*a.score/NULLIF(e.total_points,0)) FILTER(WHERE "+valid+"),2),0),"
                + "COUNT(*) FILTER(WHERE "+valid+" AND 100.0*a.score/NULLIF(e.total_points,0)>=50),MAX(a.submitted_at),COUNT(*) FILTER(WHERE "+valid+")" + base, w).getSingleResult();
        List<?> bins = bind("SELECT LEAST(4,FLOOR(5.0*a.score/NULLIF(e.total_points,0))) AS bucket,COUNT(*)" + base
                + " AND "+valid+" GROUP BY bucket ORDER BY bucket", w).getResultList();
        List<?> courses = bind("SELECT c.code,c.name,COUNT(*),COALESCE(ROUND(AVG(100.0*a.score/NULLIF(e.total_points,0)) FILTER(WHERE "+valid+"),2),0),COUNT(*) FILTER(WHERE "+valid+")" + base
                + " GROUP BY c.code,c.name ORDER BY COUNT(*) DESC,c.code", w).getResultList();
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("completed", totals[0]); result.put("averagePercent", totals[1]);
        result.put("atLeastHalf", totals[2]); result.put("latestSubmission", timeValue(totals[3]));
        result.put("graded",totals[4]);result.put("ungraded",((Number)totals[0]).longValue()-((Number)totals[4]).longValue());
        result.put("distribution", bins.stream().map(row -> map(fields("bucket,count"), (Object[]) row)).toList());
        result.put("courses", courses.stream().map(row -> map(fields("code,name,count,averagePercent,graded"), (Object[]) row)).toList());
        return result;
    }

    @Transactional
    public Map<String, Object> review(Long attemptId) {
        prepare(); requireAttempt(attemptId);
        List<?> rows = em.createNativeQuery("SELECT r.outcome,r.note,r.revision,r.updated_at,u.full_name FROM attempt_reviews r LEFT JOIN users u ON u.id=r.reviewer_id WHERE r.attempt_id=:id")
                .setParameter("id", attemptId).getResultList();
        return rows.isEmpty() ? Map.of("outcome", "unreviewed", "note", "", "revision", 0)
                : map(fields("outcome,note,revision,updatedAt,reviewerName"), (Object[]) rows.get(0));
    }

    @Transactional
    public Map<String, Object> review(Long actorId, Long attemptId, String outcome, String note, long revision) {
        prepare(); requireAttempt(attemptId);
        if (!Set.of("unreviewed", "needs_review", "cleared", "flagged").contains(outcome) || note == null || note.length() > 4000 || revision < 0)
            throw new ApiException(HttpStatus.BAD_REQUEST, "Kết luận hoặc ghi chú không hợp lệ (tối đa 4000 ký tự)");
        int changed = em.createNativeQuery("INSERT INTO attempt_reviews(attempt_id,outcome,note,reviewer_id,revision) SELECT :id,:outcome,:note,:actor,1 WHERE :revision=0 "
                + "ON CONFLICT(attempt_id) DO UPDATE SET outcome=:outcome,note=:note,reviewer_id=:actor,revision=attempt_reviews.revision+1,updated_at=CURRENT_TIMESTAMP WHERE attempt_reviews.revision=:revision")
                .setParameter("id", attemptId).setParameter("outcome", outcome).setParameter("note", note.trim()).setParameter("actor", actorId).setParameter("revision", revision).executeUpdate();
        if (changed == 0) throw new ApiException(HttpStatus.CONFLICT, "Đánh giá đã được cập nhật ở phiên khác. Hãy đóng và mở lại chi tiết.");
        admin.audit(actorId, "REVIEW_ATTEMPT", "ATTEMPT", attemptId, "outcome=" + outcome);
        return review(attemptId);
    }

    @Transactional
    public String evidence(Long attemptId, Long eventId) {
        List<?> paths = em.createNativeQuery("SELECT evidence_path FROM anti_cheat_events WHERE id=:event AND attempt_id=:attempt")
                .setParameter("event", eventId).setParameter("attempt", attemptId).getResultList();
        if (paths.isEmpty() || paths.get(0) == null || paths.get(0).toString().isBlank())
            throw new ApiException(HttpStatus.NOT_FOUND, "Sự kiện này chưa có tệp bằng chứng");
        return paths.get(0).toString();
    }

    @Transactional
    public Map<String, Object> sessionDetail(Long sessionId) {
        prepare();
        List<?> sessionRows = em.createNativeQuery("""
            SELECT s.id, s.exam_id, e.code, e.title, c.code, c.name, COALESCE(cl.name,''),
                   s.room_code, s.access_code, s.start_time, s.end_time, s.status,
                   (SELECT COUNT(*) FROM exam_session_students r WHERE r.exam_session_id=s.id),
                   (SELECT COUNT(*) FROM exam_attempts a WHERE a.exam_session_id=s.id),s.name
            FROM exam_sessions s
            JOIN exams e ON e.id=s.exam_id
            JOIN courses c ON c.id=e.course_id
            LEFT JOIN classes cl ON cl.id=s.class_id
            WHERE s.id=:id
            """).setParameter("id", sessionId).getResultList();
        if (sessionRows.isEmpty()) {
            throw new ApiException(HttpStatus.NOT_FOUND, "Không tìm thấy ca thi");
        }
        Map<String, Object> sessionInfo = map(fields("id,examId,examCode,examTitle,courseCode,courseName,className,roomCode,accessCode,startTime,endTime,status,registeredCount,attemptCount,name"), (Object[]) sessionRows.get(0));

        List<?> students = em.createNativeQuery("""
            SELECT u.id, u.username, u.full_name, u.email, u.department, u.status
            FROM exam_session_students ess
            JOIN users u ON u.id=ess.student_id
            WHERE ess.exam_session_id=:id
            ORDER BY u.full_name ASC
            """).setParameter("id", sessionId).getResultList();

        List<?> attempts = em.createNativeQuery("""
            SELECT a.id, u.username, u.full_name, a.started_at, a.submitted_at, a.score, e.total_points, a.status,
                   (SELECT COUNT(*) FROM anti_cheat_events ace WHERE ace.attempt_id=a.id AND ace.active=TRUE),
                   COALESCE((SELECT MAX(ace.risk_score) FROM anti_cheat_events ace WHERE ace.attempt_id=a.id AND ace.active=TRUE), 0)
            FROM exam_attempts a
            JOIN users u ON u.id=a.student_id
            JOIN exams e ON e.id=a.exam_id
            WHERE a.exam_session_id=:id
            ORDER BY a.started_at DESC, a.id DESC
            """).setParameter("id", sessionId).getResultList();

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("session", sessionInfo);
        result.put("students", students.stream().map(r -> map(fields("id,username,fullName,email,department,status"), (Object[]) r)).toList());
        result.put("attempts", attempts.stream().map(r -> map(fields("id,username,studentName,startedAt,submittedAt,score,totalPoints,status,eventCount,riskScore"), (Object[]) r)).toList());
        return result;
    }

    @Transactional
    public Map<String, Object> updateSessionStatus(Long actorId, Long sessionId, String status) {
        prepare();
        String normalized = clean(status).toLowerCase(Locale.ROOT);
        if (!Set.of("scheduled", "ongoing", "completed", "cancelled").contains(normalized)) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Trạng thái ca thi không hợp lệ");
        }
        var preview=em.find(com.examflow.backend.entity.ExamSession.class,sessionId);
        if(preview==null)throw new ApiException(HttpStatus.NOT_FOUND,"Không tìm thấy ca thi");
        // Use the same parent lock as exam entry and admin catalog mutations.
        em.find(com.examflow.backend.entity.Exam.class,preview.getExam().getId(),jakarta.persistence.LockModeType.PESSIMISTIC_WRITE);
        em.refresh(preview,jakarta.persistence.LockModeType.PESSIMISTIC_WRITE);
        String before=preview.getStatus();
        if(before.equals(normalized))return sessionDetail(sessionId);
        if(Set.of("completed","cancelled").contains(before))
            throw new ApiException(HttpStatus.CONFLICT,"Ca đã đóng, không thể mở lại hoặc đổi trạng thái. Hãy tạo ca mới nếu cần.");
        if(!Set.of("completed","cancelled").contains(normalized))
            throw new ApiException(HttpStatus.CONFLICT,"Dùng sửa lịch cho ca chưa bắt đầu; không đổi trực tiếp sang trạng thái này.");
        long active=((Number)em.createNativeQuery("SELECT COUNT(*) FROM exam_attempts WHERE exam_session_id=:id AND status='in_progress'")
                .setParameter("id",sessionId).getSingleResult()).longValue();
        if(active>0)throw new ApiException(HttpStatus.CONFLICT,"Ca còn "+active+" bài đang làm. Chờ các bài được nộp trước khi hủy hoặc kết thúc ca.");
        LocalDateTime clock=LocalDateTime.now(java.time.ZoneId.of("Asia/Ho_Chi_Minh"));
        if("completed".equals(normalized)&&preview.getStartTime().isAfter(clock))
            throw new ApiException(HttpStatus.CONFLICT,"Ca chưa bắt đầu. Chọn hủy ca nếu không tổ chức thi.");
        preview.setStatus(normalized);
        AdminCatalogService.updateExamSchedule(em,preview.getExam());
        em.flush();
        admin.audit(actorId, "UPDATE_SESSION_STATUS", "SESSION", sessionId, "status=" + normalized);
        return sessionDetail(sessionId);
    }

    private void requireAttempt(Long id) {
        if (((Number) em.createNativeQuery("SELECT COUNT(*) FROM exam_attempts WHERE id=:id").setParameter("id", id).getSingleResult()).longValue() == 0)
            throw new ApiException(HttpStatus.NOT_FOUND, "Không tìm thấy lượt thi");
    }
    private void prepare() { admin.ensureAdminTables(); }
    private Query bind(String sql, Where where) { Query query = em.createNativeQuery(sql); where.parameters.forEach(query::setParameter); return query; }
    private static String clean(String value) { return value == null ? "" : value.trim(); }
    private static String[] fields(String value) { return value.split(","); }
    private static Object timeValue(Object value) { return value instanceof java.sql.Timestamp t ? t.toLocalDateTime() : value; }
    private static Map<String, Object> map(String[] columns, Object[] row) {
        Map<String, Object> result = new LinkedHashMap<>();
        for (int i = 0; i < columns.length; i++) result.put(columns[i], timeValue(row[i]));
        return result;
    }
}
