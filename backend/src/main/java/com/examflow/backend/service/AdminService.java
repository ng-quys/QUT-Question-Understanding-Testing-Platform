package com.examflow.backend.service;

import com.examflow.backend.dto.AdminDto;
import com.examflow.backend.exception.ApiException;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import jakarta.transaction.Transactional;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Locale;

@Service
public class AdminService {
    @PersistenceContext
    private EntityManager em;

    private void ensureAdminTables() {
        em.createNativeQuery("""
            CREATE TABLE IF NOT EXISTS audit_logs (
                id BIGSERIAL PRIMARY KEY,
                actor_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
                action VARCHAR(80) NOT NULL,
                target_type VARCHAR(80),
                target_id VARCHAR(120),
                detail TEXT,
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
            """).executeUpdate();
        em.createNativeQuery("CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC)").executeUpdate();
        em.createNativeQuery("""
            CREATE TABLE IF NOT EXISTS anti_cheat_events (
                id BIGSERIAL PRIMARY KEY,
                attempt_id BIGINT NOT NULL REFERENCES exam_attempts(id) ON DELETE CASCADE,
                event VARCHAR(80) NOT NULL,
                active BOOLEAN NOT NULL DEFAULT TRUE,
                occurred_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
            """).executeUpdate();
        em.createNativeQuery("CREATE INDEX IF NOT EXISTS idx_anti_cheat_events_attempt ON anti_cheat_events(attempt_id, occurred_at)").executeUpdate();
        em.createNativeQuery("ALTER TABLE anti_cheat_events ADD COLUMN IF NOT EXISTS module VARCHAR(20) NOT NULL DEFAULT 'M7'").executeUpdate();
        em.createNativeQuery("ALTER TABLE anti_cheat_events ADD COLUMN IF NOT EXISTS duration_seconds DOUBLE PRECISION DEFAULT 0").executeUpdate();
        em.createNativeQuery("ALTER TABLE anti_cheat_events ADD COLUMN IF NOT EXISTS risk_score INTEGER DEFAULT 0").executeUpdate();
        em.createNativeQuery("ALTER TABLE anti_cheat_events ADD COLUMN IF NOT EXISTS risk_level VARCHAR(20) DEFAULT 'LOW'").executeUpdate();
        em.createNativeQuery("ALTER TABLE anti_cheat_events ADD COLUMN IF NOT EXISTS source_module VARCHAR(100)").executeUpdate();
        em.createNativeQuery("ALTER TABLE anti_cheat_events ADD COLUMN IF NOT EXISTS evidence_path TEXT").executeUpdate();
    }

    @Transactional
    public AdminDto.Dashboard dashboard() {
        ensureAdminTables();
        Number total = one("SELECT COUNT(*) FROM users");
        Number active = one("SELECT COUNT(*) FROM users WHERE status = 'active'");
        Number students = one("SELECT COUNT(*) FROM users WHERE role = 'student'");
        Number teachers = one("SELECT COUNT(*) FROM users WHERE role IN ('faculty','teacher')");
        Number admins = one("SELECT COUNT(*) FROM users WHERE role = 'admin'");
        Number courses = one("SELECT COUNT(*) FROM courses");
        Number exams = one("SELECT COUNT(*) FROM exams");
        Number sessions = one("SELECT COUNT(*) FROM exam_sessions");
        Number attempts = one("SELECT COUNT(*) FROM exam_attempts");
        Number inProgress = one("SELECT COUNT(*) FROM exam_attempts WHERE status = 'in_progress'");
        Number completed = one("SELECT COUNT(*) FROM exam_attempts WHERE status IN ('completed','submitted')");
        BigDecimal avg = decimal("SELECT COALESCE(ROUND(AVG(score),2),0) FROM exam_attempts WHERE status IN ('completed','submitted')");
        Number recent = one("SELECT COUNT(*) FROM exam_attempts WHERE status IN ('completed','submitted') AND submitted_at >= CURRENT_TIMESTAMP - INTERVAL '7 days'");
        Number highRisk = one("SELECT COUNT(*) FROM (SELECT attempt_id FROM anti_cheat_events WHERE event IN ('TAB_HIDDEN','FULLSCREEN_EXIT','WINDOW_BLUR') GROUP BY attempt_id HAVING COUNT(*) >= 3) x");
        long highRiskCount = highRisk == null ? 0 : highRisk.longValue();
        return new AdminDto.Dashboard(total.longValue(), active.longValue(), students.longValue(), teachers.longValue(), admins.longValue(),
                courses.longValue(), exams.longValue(), sessions.longValue(), attempts.longValue(), inProgress.longValue(),
                completed.longValue(), avg, recent.longValue(), highRiskCount);
    }

    @Transactional
    public List<AdminDto.UserRow> users(String q, String role, String status) {
        ensureAdminTables() ;
        String sql = """
            SELECT id, username, email, full_name, role, department, status, created_at
            FROM users
            WHERE (:q = '' OR LOWER(username) LIKE LOWER(CONCAT('%',:q,'%')) OR LOWER(email) LIKE LOWER(CONCAT('%',:q,'%')) OR LOWER(full_name) LIKE LOWER(CONCAT('%',:q,'%')))
              AND (:role = '' OR role = :role)
              AND (:status = '' OR status = :status)
            ORDER BY created_at DESC, id DESC
            LIMIT 500
            """;
        return em.createNativeQuery(sql).setParameter("q", safe(q)).setParameter("role", safe(role)).setParameter("status", safe(status))
                .getResultList().stream().map(r -> {
                    Object[] x = (Object[]) r;
                    return new AdminDto.UserRow(((Number)x[0]).longValue(), (String)x[1], (String)x[2], (String)x[3], (String)x[4], (String)x[5], (String)x[6], toDateTime(x[7]));
                }).toList();
    }

    public List<AdminDto.UserRow> students(String q, String status) { return users(q, "student", status); }
    public List<AdminDto.UserRow> teachers(String q, String status) {
        ensureAdminTables();
        String sql = "SELECT id, username, email, full_name, role, department, status, created_at FROM users WHERE role IN ('faculty','teacher') AND (:q='' OR LOWER(username) LIKE LOWER(CONCAT('%',:q,'%')) OR LOWER(email) LIKE LOWER(CONCAT('%',:q,'%')) OR LOWER(full_name) LIKE LOWER(CONCAT('%',:q,'%'))) AND (:status='' OR status=:status) ORDER BY created_at DESC,id DESC LIMIT 500";
        return em.createNativeQuery(sql).setParameter("q",safe(q)).setParameter("status",safe(status)).getResultList().stream().map(r->{Object[]x=(Object[])r;return new AdminDto.UserRow(((Number)x[0]).longValue(),(String)x[1],(String)x[2],(String)x[3],(String)x[4],(String)x[5],(String)x[6],toDateTime(x[7]));}).toList();
    }

    @Transactional
    public List<AdminDto.CourseRow> courses(String q) {
        ensureAdminTables() ;
        String sql = """
            SELECT c.id,c.code,c.name,c.department,c.status,
                   (SELECT COUNT(*) FROM questions q WHERE q.course_id=c.id),
                   (SELECT COUNT(*) FROM exams e WHERE e.course_id=c.id),
                   (SELECT COUNT(*) FROM exam_sessions s JOIN exams e ON e.id=s.exam_id WHERE e.course_id=c.id)
            FROM courses c
            WHERE (:q='' OR LOWER(c.code) LIKE LOWER(CONCAT('%',:q,'%')) OR LOWER(c.name) LIKE LOWER(CONCAT('%',:q,'%')))
            ORDER BY c.id DESC LIMIT 500
            """;
        return em.createNativeQuery(sql).setParameter("q", safe(q)).getResultList().stream().map(r -> {
            Object[] x=(Object[])r;
            return new AdminDto.CourseRow(((Number)x[0]).longValue(),(String)x[1],(String)x[2],(String)x[3],(String)x[4],((Number)x[5]).longValue(),((Number)x[6]).longValue(),((Number)x[7]).longValue());
        }).toList();
    }

    @Transactional
    public List<AdminDto.ExamRow> exams(String q, String status) {
        ensureAdminTables() ;
        em.createNativeQuery("CREATE TABLE IF NOT EXISTS exam_ai_policies (exam_id BIGINT PRIMARY KEY REFERENCES exams(id) ON DELETE CASCADE, enabled BOOLEAN NOT NULL DEFAULT TRUE)").executeUpdate();
        String sql="""
            SELECT e.id,e.code,e.title,c.code,c.name,e.duration_minutes,e.total_questions,e.total_points,e.status,e.exam_date,COALESCE((SELECT p.enabled FROM exam_ai_policies p WHERE p.exam_id=e.id), TRUE),
                   (SELECT COUNT(*) FROM exam_sessions s WHERE s.exam_id=e.id),
                   (SELECT COUNT(*) FROM exam_attempts a WHERE a.exam_id=e.id),
                   COALESCE((SELECT ROUND(AVG(a.score),2) FROM exam_attempts a WHERE a.exam_id=e.id AND a.status IN ('completed','submitted')),0)
            FROM exams e JOIN courses c ON c.id=e.course_id
            WHERE (:q='' OR LOWER(e.code) LIKE LOWER(CONCAT('%',:q,'%')) OR LOWER(e.title) LIKE LOWER(CONCAT('%',:q,'%')))
              AND (:status='' OR e.status=:status)
            ORDER BY e.id DESC LIMIT 500
            """;
        return em.createNativeQuery(sql).setParameter("q",safe(q)).setParameter("status",safe(status)).getResultList().stream().map(r->{
            Object[] x=(Object[])r;
            return new AdminDto.ExamRow(((Number)x[0]).longValue(),(String)x[1],(String)x[2],(String)x[3],(String)x[4],((Number)x[5]).intValue(),((Number)x[6]).intValue(),(BigDecimal)x[7],(String)x[8],toDateTime(x[9]),(Boolean)x[10],((Number)x[11]).longValue(),((Number)x[12]).longValue(),(BigDecimal)x[13]);
        }).toList();
    }

    @Transactional
    public List<AdminDto.SessionRow> sessions(String q, String status) {
        ensureAdminTables() ;
        String sql="""
            SELECT s.id,s.exam_id,e.code,e.title,COALESCE(c.name,''),s.room_code,e.code,s.start_time,s.end_time,s.status,
                   (SELECT COUNT(*) FROM exam_session_students ess WHERE ess.exam_session_id=s.id),
                   (SELECT COUNT(*) FROM exam_attempts a WHERE a.exam_session_id=s.id)
            FROM exam_sessions s JOIN exams e ON e.id=s.exam_id LEFT JOIN classes c ON c.id=s.class_id
            WHERE (:q='' OR LOWER(e.code) LIKE LOWER(CONCAT('%',:q,'%')) OR LOWER(e.title) LIKE LOWER(CONCAT('%',:q,'%')) OR LOWER(s.room_code) LIKE LOWER(CONCAT('%',:q,'%')) OR LOWER(COALESCE(e.code,'')) LIKE LOWER(CONCAT('%',:q,'%')))
              AND (:status='' OR s.status=:status)
            ORDER BY s.start_time DESC,s.id DESC LIMIT 500
            """;
        return em.createNativeQuery(sql).setParameter("q",safe(q)).setParameter("status",safe(status)).getResultList().stream().map(r->{Object[]x=(Object[])r;return new AdminDto.SessionRow(((Number)x[0]).longValue(),((Number)x[1]).longValue(),(String)x[2],(String)x[3],(String)x[4],(String)x[5],(String)x[6],toDateTime(x[7]),toDateTime(x[8]),(String)x[9],((Number)x[10]).longValue(),((Number)x[11]).longValue());}).toList();
    }

    @Transactional
    public List<AdminDto.AttemptRow> attempts(String q, String status) {
        ensureAdminTables() ;
        String sql="""
            SELECT a.id,a.exam_session_id,u.username,u.full_name,e.code,e.title,a.started_at,a.submitted_at,a.score,e.total_points,a.status,
                   (SELECT COUNT(*) FROM anti_cheat_events ace WHERE ace.attempt_id=a.id)
            FROM exam_attempts a JOIN users u ON u.id=a.student_id JOIN exams e ON e.id=a.exam_id
            WHERE (:q='' OR LOWER(u.username) LIKE LOWER(CONCAT('%',:q,'%')) OR LOWER(u.full_name) LIKE LOWER(CONCAT('%',:q,'%')) OR LOWER(e.code) LIKE LOWER(CONCAT('%',:q,'%')))
              AND (:status='' OR a.status=:status)
            ORDER BY a.id DESC LIMIT 500
            """;
        return em.createNativeQuery(sql).setParameter("q",safe(q)).setParameter("status",safe(status)).getResultList().stream().map(this::attemptRow).toList();
    }

    @Transactional
    public AdminDto.AttemptDetail attemptDetail(Long id) {
        ensureAdminTables() ;
        AdminDto.AttemptRow row = ((List<AdminDto.AttemptRow>) attemptsById(id)).stream().findFirst().orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND,"Không tìm thấy lượt thi"));
        String sql="SELECT id,event,active,occurred_at,module,duration_seconds,risk_score,risk_level,source_module,evidence_path FROM anti_cheat_events WHERE attempt_id=:id ORDER BY occurred_at ASC,id ASC";
        List<?> eventRows = em.createNativeQuery(sql).setParameter("id", id).getResultList();
        List<AdminDto.BrowserEvent> events = eventRows.stream().map(this::browserEventRow).toList();
        return new AdminDto.AttemptDetail(row,events);
    }

    private AdminDto.BrowserEvent browserEventRow(Object row) {
        Object[] x = (Object[]) row;
        return new AdminDto.BrowserEvent(
                ((Number) x[0]).longValue(), (String) x[1], Boolean.TRUE.equals(x[2]),
                toDateTime(x[3]), (String) x[4],
                x[5] == null ? 0.0 : ((Number) x[5]).doubleValue(),
                x[6] == null ? 0 : ((Number) x[6]).intValue(),
                x[7] == null ? "LOW" : (String) x[7],
                (String) x[8], (String) x[9]);
    }

    private List<AdminDto.AttemptRow> attemptsById(Long id){
        String sql="SELECT a.id,a.exam_session_id,u.username,u.full_name,e.code,e.title,a.started_at,a.submitted_at,a.score,e.total_points,a.status,(SELECT COUNT(*) FROM anti_cheat_events ace WHERE ace.attempt_id=a.id) FROM exam_attempts a JOIN users u ON u.id=a.student_id JOIN exams e ON e.id=a.exam_id WHERE a.id=:id";
        return em.createNativeQuery(sql).setParameter("id",id).getResultList().stream().map(this::attemptRow).toList();
    }

    @Transactional
    public AdminDto.AntiCheatSummary antiCheat(Long attemptId) {
        ensureAdminTables() ;
        String sql="""
          SELECT COUNT(*),COUNT(*) FILTER(WHERE event='TAB_HIDDEN'),COUNT(*) FILTER(WHERE event='FULLSCREEN_EXIT'),COUNT(*) FILTER(WHERE event='WINDOW_BLUR'),COUNT(*) FILTER(WHERE event='COPY'),COUNT(*) FILTER(WHERE event='PASTE'),COUNT(*) FILTER(WHERE event='RIGHT_CLICK'),COUNT(*) FILTER(WHERE module <> 'M7'),COALESCE(MAX(risk_score),0),COALESCE((ARRAY_AGG(risk_level ORDER BY risk_score DESC))[1],'LOW') FROM anti_cheat_events WHERE attempt_id=:id
          """;
        Object[] x=(Object[])em.createNativeQuery(sql).setParameter("id",attemptId).getSingleResult();
        long total=((Number)x[0]).longValue(); long tab=((Number)x[1]).longValue(); long fs=((Number)x[2]).longValue(); long blur=((Number)x[3]).longValue(); long copy=((Number)x[4]).longValue(); long paste=((Number)x[5]).longValue(); long right=((Number)x[6]).longValue();
        long ai=((Number)x[7]).longValue(); int risk=((Number)x[8]).intValue(); String level=String.valueOf(x[9]); return new AdminDto.AntiCheatSummary(attemptId,total,tab,fs,blur,copy,paste,right,tab+fs+blur,ai,risk,level);
    }

    @Transactional
    public List<AdminDto.AuditRow> auditLogs() {
        ensureAdminTables() ;
        String sql="SELECT l.id,l.actor_id,COALESCE(u.username,''),l.action,l.target_type,l.target_id,l.detail,l.created_at FROM audit_logs l LEFT JOIN users u ON u.id=l.actor_id ORDER BY l.created_at DESC,l.id DESC LIMIT 500";
        return em.createNativeQuery(sql).getResultList().stream().map(r->{Object[]x=(Object[])r;return new AdminDto.AuditRow(((Number)x[0]).longValue(),x[1]==null?null:((Number)x[1]).longValue(),(String)x[2],(String)x[3],(String)x[4],(String)x[5],(String)x[6],toDateTime(x[7]));}).toList();
    }

    @Transactional
    public AdminDto.UserRow updateUserStatus(Long adminId, Long userId, String status) {
        ensureAdminTables() ;
        String normalized=safe(status).toLowerCase(Locale.ROOT);
        if(!List.of("active","inactive","locked").contains(normalized)) throw new ApiException(HttpStatus.BAD_REQUEST,"Trạng thái không hợp lệ");
        if(adminId.equals(userId) && !"active".equals(normalized)) throw new ApiException(HttpStatus.BAD_REQUEST,"Không thể khóa chính tài khoản Admin đang đăng nhập");
        int changed=em.createNativeQuery("UPDATE users SET status=:status, updated_at=CURRENT_TIMESTAMP WHERE id=:id").setParameter("status",normalized).setParameter("id",userId).executeUpdate();
        if(changed==0) throw new ApiException(HttpStatus.NOT_FOUND,"Không tìm thấy tài khoản");
        em.createNativeQuery("INSERT INTO audit_logs(actor_id,action,target_type,target_id,detail) VALUES (:a,'UPDATE_USER_STATUS','USER',:t,:d)").setParameter("a",adminId).setParameter("t",String.valueOf(userId)).setParameter("d","status="+normalized).executeUpdate();
        Object[] x=(Object[])em.createNativeQuery("SELECT id,username,email,full_name,role,department,status,created_at FROM users WHERE id=:id").setParameter("id",userId).getSingleResult();
        return new AdminDto.UserRow(((Number)x[0]).longValue(),(String)x[1],(String)x[2],(String)x[3],(String)x[4],(String)x[5],(String)x[6],toDateTime(x[7]));
    }

    private AdminDto.AttemptRow attemptRow(Object r){Object[]x=(Object[])r;return new AdminDto.AttemptRow(((Number)x[0]).longValue(),((Number)x[1]).longValue(),(String)x[2],(String)x[3],(String)x[4],(String)x[5],toDateTime(x[6]),toDateTime(x[7]),(BigDecimal)x[8],(BigDecimal)x[9],(String)x[10],((Number)x[11]).longValue());}
    private Number one(String sql){return (Number)em.createNativeQuery(sql).getSingleResult();}
    private BigDecimal decimal(String sql){Object v=em.createNativeQuery(sql).getSingleResult();return v instanceof BigDecimal b?b:new BigDecimal(String.valueOf(v));}
    private String safe(String s){return s==null?"":s.trim();}
    private LocalDateTime toDateTime(Object v){return v instanceof java.sql.Timestamp t?t.toLocalDateTime():v instanceof LocalDateTime l?l:null;}
}
