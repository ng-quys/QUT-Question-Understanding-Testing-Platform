package com.examflow.backend.service;

import com.examflow.backend.dto.OfflineSubmissionRequest;
import com.examflow.backend.entity.ExamAttempt;
import com.examflow.backend.exception.ApiException;
import jakarta.persistence.*;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import java.time.*;
import java.util.*;

/** Durable, attempt-bound permission for one immutable deferred submission. Client times are claims, not proof. */
@Service
public class OfflineSubmissionService {
    @PersistenceContext private EntityManager em;
    @org.springframework.beans.factory.annotation.Autowired private OfflineEvidenceService offlineEvidence;
    private volatile boolean ready;
    public record Grant(String token,Instant deadline,Instant serverTime,boolean cameraRequired,boolean offlineEvidenceEnabled) {
        public Grant(String token,Instant deadline,Instant serverTime,boolean cameraRequired){this(token,deadline,serverTime,cameraRequired,false);}
    }
    private void ensure(){
        if(ready)return;
        em.createNativeQuery("""
            CREATE TABLE IF NOT EXISTS offline_exam_submissions (
              attempt_id BIGINT PRIMARY KEY REFERENCES exam_attempts(id) ON DELETE CASCADE,
              token UUID NOT NULL, deadline TIMESTAMP NOT NULL, issued_at TIMESTAMP NOT NULL,
              received_at TIMESTAMP, frozen_at_client TIMESTAMP, offline_since_client TIMESTAMP,
              submission_id UUID, snapshot_hash VARCHAR(64), late BOOLEAN NOT NULL DEFAULT FALSE)
            """).executeUpdate();
        em.createNativeQuery("ALTER TABLE offline_exam_submissions ENABLE ROW LEVEL SECURITY").executeUpdate();
        // IF NOT EXISTS remains safe after rollback; never cache uncommitted DDL.
        if(org.springframework.transaction.support.TransactionSynchronizationManager.isSynchronizationActive())
            org.springframework.transaction.support.TransactionSynchronizationManager.registerSynchronization(new org.springframework.transaction.support.TransactionSynchronization(){@Override public void afterCommit(){ready=true;}});
    }
    public Grant issue(ExamAttempt attempt,boolean cameraRequired){
        ensure();
        var now=LocalDateTime.now(ZoneId.of("Asia/Ho_Chi_Minh"));
        var deadline=SessionTiming.deadline(attempt);
        if(!deadline.isAfter(now))throw denied("Đã hết giờ, không thể cấp quyền nộp ngoại tuyến mới.");
        em.createNativeQuery("INSERT INTO offline_exam_submissions(attempt_id,token,deadline,issued_at) VALUES (:id,CAST(:token AS uuid),:deadline,:now) ON CONFLICT(attempt_id) DO NOTHING")
            .setParameter("id",attempt.getId()).setParameter("token",UUID.randomUUID().toString()).setParameter("deadline",deadline).setParameter("now",now).executeUpdate();
        Object[] row=(Object[])em.createNativeQuery("SELECT token,deadline FROM offline_exam_submissions WHERE attempt_id=:id").setParameter("id",attempt.getId()).getSingleResult();
        if(!date(row[1]).equals(deadline))throw denied("Lịch thi đã thay đổi. Hãy tải lại lượt thi trước khi tiếp tục.");
        if(cameraRequired && offlineEvidence!=null)offlineEvidence.prepare(attempt);
        return new Grant(row[0].toString(),deadline.atZone(ZoneId.of("Asia/Ho_Chi_Minh")).toInstant(),Instant.now(),cameraRequired,cameraRequired && offlineEvidence!=null);
    }
    /** Caller owns the attempt row lock and checks assignment; true means an identical committed retry. */
    public boolean accept(ExamAttempt attempt,OfflineSubmissionRequest request){
        ensure();
        String token=uuid(request.token()),submission=uuid(request.submissionId());
        var rows=em.createNativeQuery("SELECT token,deadline,received_at,submission_id,snapshot_hash FROM offline_exam_submissions WHERE attempt_id=:id FOR UPDATE").setParameter("id",attempt.getId()).getResultList();
        if(rows.isEmpty())throw denied("Lượt thi chưa có quyền nộp bản lưu ngoại tuyến.");
        Object[] row=(Object[])rows.get(0);
        if(!row[0].toString().equals(token)||!date(row[1]).equals(SessionTiming.deadline(attempt)))throw denied("Quyền nộp bài không hợp lệ hoặc lịch thi đã thay đổi.");
        var deadline=SessionTiming.deadline(attempt).atZone(ZoneId.of("Asia/Ho_Chi_Minh")).toInstant();
        if(request.frozenAt()==null||request.frozenAt().isAfter(deadline)||request.frozenAt().isBefore(attempt.getStartedAt().atZone(ZoneId.of("Asia/Ho_Chi_Minh")).toInstant())||request.frozenAt().isAfter(Instant.now().plusSeconds(5)))throw denied("Thời điểm khóa bản bài làm không hợp lệ.");
        if(request.offlineSince()!=null&&(request.offlineSince().isAfter(request.frozenAt())||request.offlineSince().isBefore(attempt.getStartedAt().atZone(ZoneId.of("Asia/Ho_Chi_Minh")).toInstant())))throw denied("Thời điểm mất kết nối không hợp lệ.");
        String hash=fingerprint(request);
        if(row[2]!=null){
            if(!submission.equals(String.valueOf(row[3]))||!hash.equals(row[4]))throw denied("Bản bài làm đã nộp không thể thay đổi.");
            return true;
        }
        if(!"in_progress".equals(attempt.getStatus())||"cancelled".equals(attempt.getExamSession().getStatus()))throw denied("Lượt thi đã nộp hoặc bị hủy, không nhận bản bài làm mới.");
        boolean late=Instant.now().isAfter(deadline);
        em.createNativeQuery("UPDATE offline_exam_submissions SET received_at=:now,frozen_at_client=:frozen,offline_since_client=:offline,submission_id=CAST(:submission AS uuid),snapshot_hash=:hash,late=:late WHERE attempt_id=:id")
            .setParameter("id",attempt.getId()).setParameter("now",local(Instant.now())).setParameter("frozen",local(request.frozenAt())).setParameter("offline",request.offlineSince()==null?null:local(request.offlineSince()))
            .setParameter("submission",submission).setParameter("hash",hash).setParameter("late",late).executeUpdate();
        return false;
    }
    private String fingerprint(OfflineSubmissionRequest request){
        if(request.answers()==null||request.answers().size()>2000)throw denied("Danh sách đáp án không hợp lệ.");
        var sorted=new TreeMap<Long,Long>();
        for(var answer:request.answers())if(answer==null||answer.questionId()==null||answer.answerId()==null||sorted.putIfAbsent(answer.questionId(),answer.answerId())!=null)throw denied("Danh sách đáp án bị trùng hoặc không hợp lệ.");
        try{
            String canonical=request.frozenAt()+"|"+request.offlineSince()+"|"+sorted;
            return java.util.HexFormat.of().formatHex(java.security.MessageDigest.getInstance("SHA-256").digest(canonical.getBytes(java.nio.charset.StandardCharsets.UTF_8)));
        }catch(java.security.NoSuchAlgorithmException impossible){throw new IllegalStateException(impossible);}
    }
    private static LocalDateTime date(Object value){return value instanceof java.sql.Timestamp timestamp?timestamp.toLocalDateTime():(LocalDateTime)value;}
    private static LocalDateTime local(Instant value){return value.atZone(ZoneId.of("Asia/Ho_Chi_Minh")).toLocalDateTime();}
    private static String uuid(String raw){try{return UUID.fromString(raw).toString();}catch(RuntimeException error){throw denied("Mã bản nộp không hợp lệ.");}}
    private static ApiException denied(String message){return new ApiException(HttpStatus.CONFLICT,message);}
}
