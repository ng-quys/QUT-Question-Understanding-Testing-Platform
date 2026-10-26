package com.examflow.backend.service;

import com.examflow.backend.entity.ExamAttempt;
import com.examflow.backend.exception.ApiException;
import com.examflow.backend.repository.ExamAttemptRepository;
import jakarta.persistence.*;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.JsonNode;
import java.time.*;
import java.util.*;

/** Separate evidence intake: accepts old captures after submission, never changes answers or camera gates. */
@Service
public class OfflineEvidenceService {
    static final long MAX_BYTES=100L*1024*1024;
    @PersistenceContext private EntityManager em;
    private final ExamAttemptRepository attempts;
    private final StudentProfileService photos;
    private final EvidenceSchema evidence;
    private final SupabaseEvidenceStorage storage;
    public OfflineEvidenceService(ExamAttemptRepository attempts,StudentProfileService photos,EvidenceSchema evidence,SupabaseEvidenceStorage storage){this.attempts=attempts;this.photos=photos;this.evidence=evidence;this.storage=storage;}
    public record Capture(String token,String captureId,Instant capturedAt,long sequence,String jpeg) {}
    public record Finish(String token,int capturedCount,boolean truncated) {}
    public record Receipt(String captureId,boolean received) {}
    public record Summary(long received,long pending,long analyzed,long retrying,boolean intakeComplete,boolean truncated) {}
    public record Job(long attempt,String capture,String lease,byte[] reference) {}
    private static final ZoneId ZONE=ZoneId.of("Asia/Ho_Chi_Minh");
    private static LocalDateTime now(){return LocalDateTime.now(ZONE);}
    private volatile boolean ready;
    void ensure(){
        if(ready)return;
        em.createNativeQuery("""
          CREATE TABLE IF NOT EXISTS offline_evidence_attempts (
            attempt_id BIGINT PRIMARY KEY REFERENCES exam_attempts(id) ON DELETE CASCADE,
            reference_photo BYTEA NOT NULL,intake_complete BOOLEAN NOT NULL DEFAULT FALSE,
            declared_count INTEGER NOT NULL DEFAULT 0,truncated BOOLEAN NOT NULL DEFAULT FALSE)
          """).executeUpdate();
        em.createNativeQuery("""
          CREATE TABLE IF NOT EXISTS offline_evidence_frames (
            attempt_id BIGINT NOT NULL REFERENCES offline_evidence_attempts(attempt_id) ON DELETE CASCADE,
            capture_uuid VARCHAR(36) NOT NULL,captured_at TIMESTAMP NOT NULL,received_at TIMESTAMP,
            sequence_number BIGINT NOT NULL,image_bytes INTEGER NOT NULL,image_hash VARCHAR(64) NOT NULL,
            status VARCHAR(24) NOT NULL DEFAULT 'receiving',tries INTEGER NOT NULL DEFAULT 0,
            next_attempt_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,lease VARCHAR(36),lease_until TIMESTAMP,
            PRIMARY KEY(attempt_id,capture_uuid))
          """).executeUpdate();
        em.createNativeQuery("CREATE INDEX IF NOT EXISTS idx_offline_evidence_work ON offline_evidence_frames(status,next_attempt_at)").executeUpdate();
        em.createNativeQuery("ALTER TABLE offline_evidence_attempts ENABLE ROW LEVEL SECURITY").executeUpdate();
        em.createNativeQuery("ALTER TABLE offline_evidence_frames ENABLE ROW LEVEL SECURITY").executeUpdate();
        if(org.springframework.transaction.support.TransactionSynchronizationManager.isSynchronizationActive())
            org.springframework.transaction.support.TransactionSynchronizationManager.registerSynchronization(new org.springframework.transaction.support.TransactionSynchronization(){@Override public void afterCommit(){ready=true;}});
    }
    public void prepare(ExamAttempt attempt){
        ensure();
        if(em.createNativeQuery("SELECT attempt_id FROM offline_evidence_attempts WHERE attempt_id=:id").setParameter("id",attempt.getId()).getResultList().isEmpty())
            em.createNativeQuery("INSERT INTO offline_evidence_attempts(attempt_id,reference_photo) VALUES (:id,:photo) ON CONFLICT(attempt_id) DO NOTHING")
                .setParameter("id",attempt.getId()).setParameter("photo",photos.getFacePhotoForExam(attempt.getStudent().getId())).executeUpdate();
    }
    private ExamAttempt owned(long student,long attempt,String token){
        ExamAttempt value=attempts.findOwnedAttempt(attempt,student).orElseThrow(()->bad("Không tìm thấy lượt thi của bạn."));
        em.refresh(value,LockModeType.PESSIMISTIC_WRITE);
        if(!Set.of("in_progress","completed","submitted").contains(value.getStatus())||"cancelled".equals(value.getExamSession().getStatus()))throw bad("Lượt thi đã bị hủy, không nhận ảnh mới.");
        var grants=em.createNativeQuery("SELECT token,deadline FROM offline_exam_submissions WHERE attempt_id=:id").setParameter("id",attempt).getResultList();
        if(grants.isEmpty()||!String.valueOf(((Object[])grants.get(0))[0]).equals(uuid(token))||!date(((Object[])grants.get(0))[1]).equals(SessionTiming.deadline(value)))throw bad("Quyền gửi ảnh ngoại tuyến không hợp lệ.");
        if(em.createNativeQuery("SELECT attempt_id FROM offline_evidence_attempts WHERE attempt_id=:id").setParameter("id",attempt).getResultList().isEmpty())throw bad("Lượt thi này chưa bật lưu ảnh ngoại tuyến. Áp dụng từ lượt thi mới.");
        return value;
    }
    static byte[] image(String encoded){
        try{
            if(encoded==null||encoded.length()>334000)throw new IllegalArgumentException();
            byte[] bytes=Base64.getDecoder().decode(encoded);
            if(bytes.length<4||bytes.length>250000||bytes[0]!=(byte)255||bytes[1]!=(byte)216)throw new IllegalArgumentException();
            try(var stream=javax.imageio.ImageIO.createImageInputStream(new java.io.ByteArrayInputStream(bytes))){
                var readers=javax.imageio.ImageIO.getImageReaders(stream);if(!readers.hasNext())throw new IllegalArgumentException();
                var reader=readers.next();try{reader.setInput(stream);int w=reader.getWidth(0),h=reader.getHeight(0);if(!"JPEG".equalsIgnoreCase(reader.getFormatName())||Math.min(w,h)<16||(long)w*h>1280L*720)throw new IllegalArgumentException();}finally{reader.dispose();}
            }
            return bytes;
        }catch(Exception ex){throw bad("Ảnh ngoại tuyến không hợp lệ hoặc quá lớn.");}
    }
    static String hash(byte[] bytes){try{return HexFormat.of().formatHex(java.security.MessageDigest.getInstance("SHA-256").digest(bytes));}catch(Exception ex){throw new IllegalStateException(ex);}}
    @Transactional
    public boolean reserve(long student,long attempt,Capture frame,byte[] bytes){
        ensure();var value=owned(student,attempt,frame.token());
        String capture=uuid(frame.captureId());
        if(frame.capturedAt()==null||frame.sequence()<1||frame.capturedAt().isBefore(value.getStartedAt().atZone(ZONE).toInstant())||frame.capturedAt().isAfter(SessionTiming.deadline(value).atZone(ZONE).toInstant())||frame.capturedAt().isAfter(Instant.now().plusSeconds(5)))throw bad("Thời điểm hoặc thứ tự ảnh không hợp lệ.");
        var previous=em.createNativeQuery("SELECT image_hash,status,captured_at,sequence_number FROM offline_evidence_frames WHERE attempt_id=:id AND capture_uuid=:capture").setParameter("id",attempt).setParameter("capture",capture).getResultList();
        if(!previous.isEmpty()){
            Object[] row=(Object[])previous.get(0);if(!hash(bytes).equals(row[0])||!date(row[2]).equals(frame.capturedAt().atZone(ZONE).toLocalDateTime())||((Number)row[3]).longValue()!=frame.sequence())throw bad("Mã ảnh đã được dùng cho nội dung khác.");
            return !"receiving".equals(row[1]);
        }
        long samples=((Number)em.createNativeQuery("SELECT COUNT(*) FROM offline_evidence_frames WHERE attempt_id=:id").setParameter("id",attempt).getSingleResult()).longValue();
        if(samples>=17280)throw bad("Lượt thi đã đạt giới hạn số ảnh ngoại tuyến.");
        long used=((Number)em.createNativeQuery("SELECT COALESCE(SUM(image_bytes),0) FROM offline_evidence_frames WHERE attempt_id=:id").setParameter("id",attempt).getSingleResult()).longValue();
        if(used+bytes.length>MAX_BYTES)throw bad("Ảnh ngoại tuyến của lượt thi đã đạt giới hạn 100 MB.");
        em.createNativeQuery("INSERT INTO offline_evidence_frames(attempt_id,capture_uuid,captured_at,sequence_number,image_bytes,image_hash) VALUES (:id,:capture,:time,:sequence,:bytes,:hash)")
            .setParameter("id",attempt).setParameter("capture",capture).setParameter("time",frame.capturedAt().atZone(ZONE).toLocalDateTime()).setParameter("sequence",frame.sequence()).setParameter("bytes",bytes.length).setParameter("hash",hash(bytes)).executeUpdate();
        em.createNativeQuery("UPDATE offline_evidence_attempts SET intake_complete=FALSE WHERE attempt_id=:id").setParameter("id",attempt).executeUpdate();
        return false;
    }
    @Transactional
    public Receipt confirm(long attempt,Capture frame){
        evidence.ensure();
        String capture=uuid(frame.captureId());
        em.createNativeQuery("UPDATE offline_evidence_frames SET status='pending',received_at=:now WHERE attempt_id=:id AND capture_uuid=:capture AND status='receiving'")
            .setParameter("now",now()).setParameter("id",attempt).setParameter("capture",capture).executeUpdate();
        Object captured=em.createNativeQuery("SELECT captured_at FROM offline_evidence_frames WHERE attempt_id=:id AND capture_uuid=:capture").setParameter("id",attempt).setParameter("capture",capture).getSingleResult();
        insertEvent(attempt,capture,"OFFLINE_CAPTURE",0,date(captured));
        return new Receipt(capture,true);
    }
    private void insertEvent(long attempt,String capture,String event,int score,LocalDateTime captured){
        String eventId=UUID.nameUUIDFromBytes((attempt+":"+capture+":"+event).getBytes(java.nio.charset.StandardCharsets.UTF_8)).toString();
        em.createNativeQuery("""
          INSERT INTO anti_cheat_events(attempt_id,event,module,active,occurred_at,duration_seconds,risk_score,risk_level,source_module,event_uuid,capture_uuid,evidence_provider,evidence_bucket,evidence_key,evidence_status)
          VALUES (:id,:event,'OFFLINE',:active,:clock,0,:score,:level,'offline_snapshot_client_time_unverified',:uuid,:capture,'supabase',:bucket,:key,'uploaded')
          ON CONFLICT(attempt_id,event_uuid) DO NOTHING
          """).setParameter("id",attempt).setParameter("event",event).setParameter("clock",captured).setParameter("score",score).setParameter("level",MonitoringReviewPolicy.level(score))
            .setParameter("active",!"OFFLINE_CAPTURE".equals(event)).setParameter("uuid",eventId).setParameter("capture",capture).setParameter("bucket",storage.bucket()).setParameter("key","attempt-"+attempt+"/"+capture+".jpg").executeUpdate();
    }
    @Transactional
    public void finish(long student,long attempt,Finish finish){
        ensure();var value=owned(student,attempt,finish.token());
        long count=((Number)em.createNativeQuery("SELECT COUNT(*) FROM offline_evidence_frames WHERE attempt_id=:id AND received_at IS NOT NULL").setParameter("id",attempt).getSingleResult()).longValue();
        if(finish.capturedCount()<0||count<finish.capturedCount())throw bad("Máy chủ chưa nhận đủ ảnh được thiết bị báo cáo.");
        em.createNativeQuery("UPDATE offline_evidence_attempts SET intake_complete=TRUE,declared_count=GREATEST(declared_count,:count),truncated=(truncated OR :truncated) WHERE attempt_id=:id")
            .setParameter("id",attempt).setParameter("count",finish.capturedCount()).setParameter("truncated",finish.truncated()).executeUpdate();
    }
    @Transactional
    public Summary summary(long attempt){
        ensure();
        var metadata=em.createNativeQuery("SELECT intake_complete,truncated FROM offline_evidence_attempts WHERE attempt_id=:id").setParameter("id",attempt).getResultList();
        if(metadata.isEmpty())return null;
        Object[] counts=(Object[])em.createNativeQuery("SELECT COUNT(*) FILTER(WHERE received_at IS NOT NULL),COUNT(*) FILTER(WHERE status IN ('pending','analyzing')),COUNT(*) FILTER(WHERE status='analyzed'),COUNT(*) FILTER(WHERE status='retry') FROM offline_evidence_frames WHERE attempt_id=:id")
            .setParameter("id",attempt).getSingleResult();Object[] state=(Object[])metadata.get(0);
        return new Summary(((Number)counts[0]).longValue(),((Number)counts[1]).longValue(),((Number)counts[2]).longValue(),((Number)counts[3]).longValue(),Boolean.TRUE.equals(state[0]),Boolean.TRUE.equals(state[1]));
    }
    @Transactional
    public Job claim(){
        ensure();
        var rows=em.createNativeQuery("SELECT f.attempt_id,f.capture_uuid,a.reference_photo FROM offline_evidence_frames f JOIN offline_evidence_attempts a ON a.attempt_id=f.attempt_id WHERE (f.status IN ('pending','retry') AND f.next_attempt_at<=:now) OR (f.status='analyzing' AND f.lease_until<:now) ORDER BY f.received_at LIMIT 1 FOR UPDATE OF f SKIP LOCKED")
            .setParameter("now",now()).getResultList();
        if(rows.isEmpty())return null;Object[] row=(Object[])rows.get(0);String lease=UUID.randomUUID().toString();
        long id=((Number)row[0]).longValue();String capture=(String)row[1];
        em.createNativeQuery("UPDATE offline_evidence_frames SET status='analyzing',lease=:lease,lease_until=:until,tries=tries+1 WHERE attempt_id=:id AND capture_uuid=:capture")
            .setParameter("lease",lease).setParameter("until",now().plusSeconds(60)).setParameter("id",id).setParameter("capture",capture).executeUpdate();
        return new Job(id,capture,lease,(byte[])row[2]);
    }
    @Transactional
    public void analyzed(Job job,JsonNode result){
        var rows=em.createNativeQuery("SELECT captured_at FROM offline_evidence_frames WHERE attempt_id=:id AND capture_uuid=:capture AND lease=:lease AND status='analyzing' FOR UPDATE")
            .setParameter("id",job.attempt()).setParameter("capture",job.capture()).setParameter("lease",job.lease()).getResultList();
        if(rows.isEmpty())return;
        if(!result.path("ok").asBoolean(false)||!result.path("findings").isArray()||result.path("findings").size()>30)throw new IllegalStateException("INVALID_OFFLINE_RESULT");
        evidence.ensure();LocalDateTime captured=rows.get(0) instanceof java.sql.Timestamp t?t.toLocalDateTime():(LocalDateTime)rows.get(0);
        Set<String> allowed=Set.of("NO_FACE","IDENTITY_MISMATCH","SPOOF_FACE","MULTIPLE_PEOPLE","HEAD_LEFT","HEAD_RIGHT","HEAD_UP","HEAD_DOWN","PHONE_VISIBLE","TABLET_VISIBLE","MATERIAL_VISIBLE");
        for(var finding:result.path("findings")){
            String event=finding.path("event").asString("");if(!allowed.contains(event))throw new IllegalStateException("INVALID_OFFLINE_FINDING");
            insertEvent(job.attempt(),job.capture(),event,Math.max(0,Math.min(100,finding.path("score").asInt(0))),captured);
        }
        em.createNativeQuery("UPDATE offline_evidence_frames SET status='analyzed',lease=NULL,lease_until=NULL WHERE attempt_id=:id AND capture_uuid=:capture AND lease=:lease")
            .setParameter("id",job.attempt()).setParameter("capture",job.capture()).setParameter("lease",job.lease()).executeUpdate();
    }
    @Transactional
    public void retry(Job job){
        em.createNativeQuery("UPDATE offline_evidence_frames SET status='retry',next_attempt_at=:next,lease=NULL,lease_until=NULL WHERE attempt_id=:id AND capture_uuid=:capture AND lease=:lease")
            .setParameter("next",now().plusSeconds(60)).setParameter("id",job.attempt()).setParameter("capture",job.capture()).setParameter("lease",job.lease()).executeUpdate();
    }
    private static LocalDateTime date(Object value){return value instanceof java.sql.Timestamp t?t.toLocalDateTime():(LocalDateTime)value;}
    private static String uuid(String value){try{return UUID.fromString(value).toString();}catch(Exception ex){throw bad("Mã ảnh hoặc quyền gửi ảnh không hợp lệ.");}}
    private static ApiException bad(String message){return new ApiException(HttpStatus.CONFLICT,message);}
}
