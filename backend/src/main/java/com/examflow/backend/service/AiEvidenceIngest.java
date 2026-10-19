package com.examflow.backend.service;

import com.examflow.backend.exception.ApiException;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.JsonNode;
import java.time.*;
import java.util.Set;
import java.util.UUID;

@Service
public class AiEvidenceIngest {
    @PersistenceContext private EntityManager em;
    private final EvidenceSchema schema;
    private final SupabaseEvidenceStorage storage;
    public AiEvidenceIngest(EvidenceSchema schema, SupabaseEvidenceStorage storage) { this.schema = schema; this.storage = storage; }
    @Transactional
    public void receive(JsonNode data) {
        schema.ensure();
        long attempt = data.path("attemptId").asLong();
        String uuid;
        try { uuid = UUID.fromString(data.path("eventUuid").asString("")).toString(); }
        catch (IllegalArgumentException ex) { throw new ApiException(HttpStatus.BAD_REQUEST,"eventUuid không hợp lệ"); }
        String status = data.path("evidenceStatus").asString("none");
        if (!Set.of("none","pending","uploaded","failed").contains(status)) throw new ApiException(HttpStatus.BAD_REQUEST,"Trạng thái ảnh không hợp lệ");
        String bucket = data.path("evidenceBucket").asString(null), key = data.path("evidenceKey").asString(null);
        if (status.equals("uploaded")) storage.validateObject(attempt,bucket,key);
        else { bucket = null; key = null; }
        String event = data.path("event").asString("").trim().toUpperCase();
        if (!event.matches("[A-Z0-9_]{1,80}")) throw new ApiException(HttpStatus.BAD_REQUEST,"Loại sự kiện không hợp lệ");
        String failure = data.path("evidenceError").asString(null);
        if (failure != null && !failure.matches("[A-Z0-9_]{1,80}")) throw new ApiException(HttpStatus.BAD_REQUEST,"Mã lỗi ảnh không hợp lệ");
        LocalDateTime timestamp;
        try { timestamp = Instant.parse(data.path("timestamp").asString()).atZone(ZoneId.of("Asia/Ho_Chi_Minh")).toLocalDateTime(); }
        catch (DateTimeException ex) { throw new ApiException(HttpStatus.BAD_REQUEST,"Thời điểm sự kiện không hợp lệ"); }
        double duration = data.path("duration").asDouble(0);
        if (!Double.isFinite(duration) || duration < 0) throw new ApiException(HttpStatus.BAD_REQUEST,"Thời lượng không hợp lệ");
        String level = data.path("riskLevel").asString("LOW");
        if (!Set.of("LOW","MEDIUM","HIGH","CRITICAL").contains(level)) throw new ApiException(HttpStatus.BAD_REQUEST,"Mức rủi ro không hợp lệ");
        em.createNativeQuery("""
            INSERT INTO anti_cheat_events(attempt_id,event,module,active,occurred_at,duration_seconds,risk_score,risk_level,source_module,evidence_path,
                event_uuid,evidence_provider,evidence_bucket,evidence_key,evidence_status,evidence_error)
            VALUES (:attempt,:event,'M10',:active,:time,:duration,:risk,:level,'full_pipeline_voting',:local,
                :uuid,'supabase',:bucket,:key,:status,:failure)
            ON CONFLICT(attempt_id,event_uuid) DO UPDATE SET
                evidence_status=CASE WHEN anti_cheat_events.evidence_status='uploaded' THEN 'uploaded' ELSE EXCLUDED.evidence_status END,
                evidence_bucket=COALESCE(anti_cheat_events.evidence_bucket,EXCLUDED.evidence_bucket),
                evidence_key=COALESCE(anti_cheat_events.evidence_key,EXCLUDED.evidence_key),
                evidence_error=CASE WHEN anti_cheat_events.evidence_status='uploaded' THEN NULL ELSE EXCLUDED.evidence_error END
            """).setParameter("attempt",attempt).setParameter("event",event).setParameter("active",data.path("active").asBoolean(true))
                .setParameter("time",timestamp).setParameter("duration",duration).setParameter("risk",Math.max(0,Math.min(100,data.path("riskScore").asInt(0))))
                .setParameter("level",level).setParameter("local",data.path("evidencePath").asString(null)).setParameter("uuid",uuid)
                .setParameter("bucket",bucket).setParameter("key",key).setParameter("status",status).setParameter("failure",failure).executeUpdate();
    }
}
