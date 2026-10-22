package com.examflow.backend.service;

import com.examflow.backend.exception.ApiException;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import org.springframework.http.HttpStatus;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.util.*;

@Service
public class EvidenceReadService {
    @PersistenceContext private EntityManager em;
    private final EvidenceAccessService access;
    private final EvidenceSchema schema;
    private final SupabaseEvidenceStorage storage;
    private final AdminEvidenceService local;
    public EvidenceReadService(EvidenceAccessService access,EvidenceSchema schema,SupabaseEvidenceStorage storage,AdminEvidenceService local) { this.access=access; this.schema=schema; this.storage=storage; this.local=local; }
    public record Event(Long id,String event,boolean active,Object occurredAt,String module,double duration,int riskScore,String riskLevel,String provider,String evidenceStatus,boolean hasEvidence,String evidenceError) {}
    public record EventPage(List<Event> items,long total,int page,int size,String attemptStatus) {}
    private static String SELECT = "SELECT id,event,active,occurred_at,module,duration_seconds,risk_score,risk_level,evidence_provider,evidence_status,evidence_path,evidence_error FROM anti_cheat_events WHERE attempt_id=:id";
    @Transactional
    public EventPage events(Jwt jwt,Long id,int page,int size) {
        var attempt=access.require(jwt,id); schema.ensure();
        if (page<0 || size<1 || size>100 || (long)page*size>Integer.MAX_VALUE) throw new ApiException(HttpStatus.BAD_REQUEST,"Phân trang không hợp lệ");
        long total=((Number)em.createNativeQuery("SELECT COUNT(*) FROM anti_cheat_events WHERE attempt_id=:id").setParameter("id",id).getSingleResult()).longValue();
        List<?> rows=em.createNativeQuery(SELECT + " ORDER BY occurred_at,id").setParameter("id",id).setFirstResult(page*size).setMaxResults(size).getResultList();
        return new EventPage(rows.stream().map(row -> event((Object[])row)).toList(),total,page,size,attempt.getStatus());
    }
    private Event event(Object[] row) {
        boolean legacy = "local".equals(row[8]) && row[10]!=null && !row[10].toString().isBlank();
        return new Event(((Number)row[0]).longValue(),(String)row[1],Boolean.TRUE.equals(row[2]),row[3] instanceof java.sql.Timestamp t?t.toLocalDateTime():row[3],(String)row[4],row[5]==null?0:((Number)row[5]).doubleValue(),row[6]==null?0:((Number)row[6]).intValue(),row[7]==null?"LOW":row[7].toString(),(String)row[8],legacy?"local":(String)row[9],legacy || !"none".equals(row[9]),(String)row[11]);
    }
    @Transactional
    public SupabaseEvidenceStorage.SignedLink link(Jwt jwt,Long id,Long eventId) {
        Object[] row=location(jwt,id,eventId);
        if ("local".equals(row[0])) {
            if (row[4]==null || row[4].toString().isBlank()) throw new ApiException(HttpStatus.NOT_FOUND,"Sự kiện chưa có ảnh bằng chứng");
            return new SupabaseEvidenceStorage.SignedLink(null,null,"local");
        }
        if ("pending".equals(row[3])) throw new ApiException(HttpStatus.CONFLICT,"Ảnh đang chờ tải lên. Vui lòng thử lại sau.");
        if ("failed".equals(row[3])) throw new ApiException(HttpStatus.CONFLICT,"Ảnh tải lên thất bại. Vui lòng nhờ quản trị viên kiểm tra bản local và thử gửi lại.");
        if (!"uploaded".equals(row[3])) throw new ApiException(HttpStatus.NOT_FOUND,"Sự kiện chưa có ảnh bằng chứng");
        return storage.sign(id,(String)row[1],(String)row[2]);
    }
    @Transactional
    public java.nio.file.Path local(Jwt jwt,Long id,Long eventId) {
        Object[] row=location(jwt,id,eventId);
        if (!"local".equals(row[0]) || row[4]==null) throw new ApiException(HttpStatus.NOT_FOUND,"Không có bằng chứng local cũ");
        return local.resolve(id,row[4].toString());
    }
    private Object[] location(Jwt jwt,Long id,Long eventId) {
        access.require(jwt,id); schema.ensure();
        List<?> rows=em.createNativeQuery("SELECT evidence_provider,evidence_bucket,evidence_key,evidence_status,evidence_path FROM anti_cheat_events WHERE id=:event AND attempt_id=:attempt")
                .setParameter("event",eventId).setParameter("attempt",id).getResultList();
        if (rows.isEmpty()) throw new ApiException(HttpStatus.NOT_FOUND,"Sự kiện không thuộc lượt thi này");
        return (Object[])rows.get(0);
    }
    @Transactional
    public Map<String,Object> teacherHistory(Jwt jwt,Long sessionId,String query,int page,int size) {
        var viewer=access.actor(jwt);
        if (page<0 || size<1 || size>100 || (long)page*size>Integer.MAX_VALUE) throw new ApiException(HttpStatus.BAD_REQUEST,"Phân trang không hợp lệ");
        String from=" FROM exam_attempts a JOIN exams e ON e.id=a.exam_id JOIN courses c ON c.id=e.course_id JOIN users u ON u.id=a.student_id LEFT JOIN exam_sessions es ON es.id=a.exam_session_id WHERE (:admin=TRUE OR (es.published_at IS NOT NULL AND (EXISTS(SELECT 1 FROM exam_sitting_groups g WHERE g.session_id=es.id AND g.teacher_id=:teacher) OR (NOT EXISTS(SELECT 1 FROM exam_sitting_groups g WHERE g.session_id=es.id) AND EXISTS(SELECT 1 FROM exam_room_teachers rt WHERE rt.room_id=es.room_id AND rt.teacher_id=:teacher))))) AND (:session=0 OR a.exam_session_id=:session) AND LOWER(CONCAT_WS(' ',u.full_name,u.username,e.title,c.code)) LIKE :q";
        var count=em.createNativeQuery("SELECT COUNT(*)"+from);
        var rows=em.createNativeQuery("SELECT a.id,u.full_name,u.username,e.title,c.code,a.exam_session_id,a.status,a.score,e.total_points,a.started_at,a.submitted_at"+from+" ORDER BY a.id DESC");
        for(var statement:List.of(count,rows)) statement.setParameter("admin","admin".equals(viewer.getRole())).setParameter("teacher",viewer.getId()).setParameter("session",sessionId==null?0L:sessionId).setParameter("q","%"+(query==null?"":query.trim().toLowerCase(Locale.ROOT))+"%");
        String[] columns={"id","studentName","studentUsername","examTitle","courseCode","sessionId","status","score","totalPoints","startedAt","submittedAt"};
        List<?> result=rows.setFirstResult(page*size).setMaxResults(size).getResultList();
        return Map.of("total",count.getSingleResult(),"page",page,"size",size,"items",result.stream().map(item->{Object[] values=(Object[])item;Map<String,Object> mapped=new LinkedHashMap<>();for(int i=0;i<columns.length;i++)mapped.put(columns[i],values[i] instanceof java.sql.Timestamp t?t.toLocalDateTime():values[i]);return mapped;}).toList());
    }
}
