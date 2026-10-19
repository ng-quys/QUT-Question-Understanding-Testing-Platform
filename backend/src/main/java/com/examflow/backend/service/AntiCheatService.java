package com.examflow.backend.service;

import com.examflow.backend.dto.AntiCheatEventRequest;
import com.examflow.backend.entity.ExamAttempt;
import com.examflow.backend.exception.ApiException;
import com.examflow.backend.repository.ExamAttemptRepository;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.util.Map;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.time.LocalDateTime;
import java.util.Set;

@Service
public class AntiCheatService {
    private static final Set<String> ALLOWED_EVENTS = Set.of(
            "TAB_HIDDEN", "FULLSCREEN_EXIT", "WINDOW_BLUR", "COPY", "PASTE", "RIGHT_CLICK"
    );

    @PersistenceContext private EntityManager entityManager;
    @org.springframework.beans.factory.annotation.Autowired private BatchMonitoringService batchMonitoring;
    @org.springframework.beans.factory.annotation.Autowired private AiEvidenceIngest evidenceIngest;
    @org.springframework.beans.factory.annotation.Autowired private StudentProfileService studentProfiles;
    private final ExamAttemptRepository attemptRepository;
    private final HttpClient httpClient;
    private final JsonMapper objectMapper = JsonMapper.builder().build();
    private final String pythonUrl;
    private final String internalSecret;

    public AntiCheatService(
            ExamAttemptRepository attemptRepository,
            @Value("${app.anticheat.url:http://127.0.0.1:8000}") String pythonUrl,
            @Value("${app.anticheat.secret:change-me}") String internalSecret) {
        this.attemptRepository = attemptRepository;
        this.pythonUrl = pythonUrl.replaceAll("/$", "");
        this.internalSecret = internalSecret;
        this.httpClient = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(3)).build();
    }

    private static volatile boolean tableEnsured = false;
    private static volatile boolean policyEnsured = false;
    private static final Object DDL_LOCK = new Object();

    private void ensurePolicyTable() {
        if (policyEnsured) return;
        synchronized (DDL_LOCK) {
            if (policyEnsured) return;
            try {
                entityManager.createNativeQuery("CREATE TABLE IF NOT EXISTS exam_ai_policies (exam_id BIGINT PRIMARY KEY REFERENCES exams(id) ON DELETE CASCADE, enabled BOOLEAN NOT NULL DEFAULT TRUE)").executeUpdate();
                policyEnsured = true;
            } catch (Exception e) {
                policyEnsured = true;
            }
        }
    }

    public void lockPolicy(Long examId) {
        entityManager.createNativeQuery("SELECT id FROM exams WHERE id=:id FOR UPDATE")
                .setParameter("id", examId).getResultList();
    }

    public boolean isRequired(Long examId) {
        ensurePolicyTable();
        var values = entityManager.createNativeQuery("SELECT enabled FROM exam_ai_policies WHERE exam_id=:id").setParameter("id", examId).getResultList();
        return values.isEmpty() || Boolean.TRUE.equals(values.get(0));
    }
    public boolean isRequired(Long examId,com.examflow.backend.entity.ExamSession session){
        return session!=null&&session.getAiEnabled()!=null?session.getAiEnabled():isRequired(examId);
    }
    @Transactional
    public void updateSessionPolicy(Long sessionId,boolean enabled){
        var session=entityManager.find(com.examflow.backend.entity.ExamSession.class,sessionId);
        if(session==null)throw new ApiException(HttpStatus.NOT_FOUND,"Không tìm thấy ca thi");
        lockPolicy(session.getExam().getId());entityManager.refresh(session,jakarta.persistence.LockModeType.PESSIMISTIC_WRITE);
        if(Set.of("cancelled","completed").contains(session.getStatus()))throw new ApiException(HttpStatus.CONFLICT,"Ca đã đóng, không đổi giám sát AI");
        session.setAiEnabled(enabled);entityManager.flush();
        for(Object raw:entityManager.createNativeQuery("SELECT id,student_id FROM exam_attempts WHERE exam_session_id=:id AND status='in_progress'").setParameter("id",sessionId).getResultList()){
            Object[] row=(Object[])raw;long attempt=((Number)row[0]).longValue(),student=((Number)row[1]).longValue();
            if(enabled)batchMonitoring.queue(attempt,student);else batchMonitoring.stop(attempt);
        }
    }

    @Transactional
    public Map<String, Object> updatePolicy(Long examId, boolean enabled) {
        ensurePolicyTable();
        lockPolicy(examId);
        if (((Number) entityManager.createNativeQuery("SELECT COUNT(*) FROM exams WHERE id=:id").setParameter("id", examId).getSingleResult()).longValue() == 0)
            throw new ApiException(HttpStatus.NOT_FOUND, "Không tìm thấy cuộc thi");
        if (((Number) entityManager.createNativeQuery("SELECT COUNT(*) FROM exam_attempts WHERE exam_id=:id AND status='in_progress'").setParameter("id", examId).getSingleResult()).longValue() > 0)
            throw new ApiException(HttpStatus.CONFLICT, "Không đổi cấu hình AI khi có sinh viên đang làm bài");
        entityManager.createNativeQuery("INSERT INTO exam_ai_policies(exam_id,enabled) VALUES (:id,:enabled) ON CONFLICT(exam_id) DO UPDATE SET enabled=EXCLUDED.enabled")
                .setParameter("id", examId).setParameter("enabled", enabled).executeUpdate();
        return Map.of("examId", examId, "enabled", enabled);
    }

    public JsonNode runtimeStatus() {
        try {
            JsonNode current=batchMonitoring.runtimeStatus();
            var result=objectMapper.createObjectNode();
            current.properties().forEach(entry->result.set(entry.getKey(),entry.getValue()));
            String state=current.path("modelStatus").asString("starting");
            result.put("running",state.equals("ready")).put("ready",state.equals("ready"));
            result.put("status",state).put("message",state.equals("ready")?"AI dùng chung đang sẵn sàng; giám sát theo nhóm":"AI dùng chung chưa sẵn sàng");
            return result;
        } catch (Exception e) {
            return objectMapper.valueToTree(Map.of("ok", false, "running", false, "ready", false,
                    "status", "offline", "message", "Không kết nối được dịch vụ AI. Hãy kiểm tra dịch vụ AI trên server."));
        }
    }

    @Transactional
    public JsonNode studentRuntimeStatus(Long attemptId, Long studentId) {
        ExamAttempt attempt = attemptRepository.findOwnedAttempt(attemptId, studentId)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Không tìm thấy bài làm"));
        var result = objectMapper.createObjectNode();
        boolean required = isRequired(attempt.getExam().getId(),attempt.getExamSession());
        result.put("required", required);
        if (!required) {
            result.put("ready", false).put("status", "disabled").put("message", "Admin đã tắt AI cho cuộc thi này");
        } else {
            JsonNode current = batchMonitoring.status(attemptId, studentId);
            current.properties().forEach(entry -> result.set(entry.getKey(), entry.getValue()));
        }
        return result;
    }

    public void queueSession(Long attemptId, Long studentId) { batchMonitoring.queue(attemptId,studentId); }

    public JsonNode cameraFrame(Long attemptId,Long studentId,BatchMonitoringService.Frame frame){
        ExamAttempt attempt=attemptRepository.findOwnedAttempt(attemptId,studentId).orElseThrow(()->new ApiException(HttpStatus.NOT_FOUND,"Không tìm thấy bài làm"));
        if(!isRequired(attempt.getExam().getId(),attempt.getExamSession()))throw new ApiException(HttpStatus.CONFLICT,"Ca thi không bật giám sát AI");
        return batchMonitoring.frame(attemptId,studentId,frame);
    }
    public void reconnect(Long attemptId,Long studentId){
        ExamAttempt attempt=attemptRepository.findOwnedAttempt(attemptId,studentId).orElseThrow(()->new ApiException(HttpStatus.NOT_FOUND,"Không tìm thấy bài làm"));
        if(!BatchMonitoringService.active(attempt)||!isRequired(attempt.getExam().getId(),attempt.getExamSession()))throw new ApiException(HttpStatus.CONFLICT,"Bài thi không nhận kết nối AI");
        batchMonitoring.queue(attemptId,studentId);
    }

    public void startSession(Long attemptId, Long studentId) {
        startSession(attemptId, studentId, false);
    }

    public void startSession(Long attemptId, Long studentId, boolean clockStartsOnReady) {
        ExamAttempt attempt = attemptRepository.findOwnedAttempt(attemptId, studentId)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Không tìm thấy bài làm"));
        ensureTable();
        long remaining = Math.max(0, Duration.between(java.time.LocalDateTime.now(java.time.ZoneId.of("Asia/Ho_Chi_Minh")),
                SessionTiming.deadline(attempt)).toSeconds());
        // Transfer the authenticated student's current photo, not a server disk path or cloud credential.
        String json = objectMapper.writeValueAsString(Map.of(
                "attemptId", attemptId, "studentId", studentId,
                "clockStartsOnReady", clockStartsOnReady, "remainingSeconds", remaining,
                "sessionEnd", attempt.getExamSession().getEndTime().atZone(java.time.ZoneId.of("Asia/Ho_Chi_Minh")).toInstant().toString(),
                "referencePhotoBase64", java.util.Base64.getEncoder().encodeToString(studentProfiles.getFacePhotoForExam(studentId))));
        callPython("/session/start", json, HttpStatus.BAD_GATEWAY);
        if (org.springframework.transaction.support.TransactionSynchronizationManager.isSynchronizationActive()) {
            org.springframework.transaction.support.TransactionSynchronizationManager.registerSynchronization(
                    new org.springframework.transaction.support.TransactionSynchronization() {
                        @Override public void afterCompletion(int status) {
                            if (status != STATUS_COMMITTED) stopSession(attemptId);
                        }
                    });
        }
    }

    public void stopSession(Long attemptId) {
        if(batchMonitoring!=null) batchMonitoring.stop(attemptId);
    }

    @Transactional
    public void recordBrowserEvent(Long studentId, Long attemptId, AntiCheatEventRequest request) {
        if (request == null || request.event() == null) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Thiếu browser event");
        }
        String event = request.event().trim().toUpperCase();
        if (!ALLOWED_EVENTS.contains(event)) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Browser event không được hỗ trợ: " + event);
        }
        ExamAttempt attempt = attemptRepository.findOwnedAttempt(attemptId, studentId)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Không tìm thấy bài làm"));
        if (!"in_progress".equalsIgnoreCase(attempt.getStatus())) {
            throw new ApiException(HttpStatus.CONFLICT, "Bài thi không còn ở trạng thái đang làm");
        }
        ensureTable();
        entityManager.createNativeQuery("INSERT INTO anti_cheat_events(attempt_id,event,module,active,occurred_at) VALUES (:attemptId,:event,'M7',:active,:occurredAt)")
                .setParameter("attemptId", attemptId).setParameter("event", event).setParameter("active", request.active())
                .setParameter("occurredAt", LocalDateTime.now()).executeUpdate();

        // Browser monitoring remains continuous; no local webcam bridge is required.\n
    }

    @Transactional
    public void receiveAiEvent(JsonNode data) {
        long attemptId = data.path("attemptId").asLong(0);
        if (attemptId <= 0) throw new ApiException(HttpStatus.BAD_REQUEST, "attemptId không hợp lệ");
        if (!attemptRepository.existsById(attemptId)) throw new ApiException(HttpStatus.NOT_FOUND, "Attempt không tồn tại");
        ensureTable();
        if (data.hasNonNull("eventUuid")) { evidenceIngest.receive(data); return; }
        String event = data.path("event").asString("").trim().toUpperCase();
        if (event.isBlank()) throw new ApiException(HttpStatus.BAD_REQUEST, "Thiếu event AI");
        String module = data.path("module").asString("M10");
        boolean active = data.path("active").asBoolean(true);
        double duration = data.path("duration").asDouble(0);
        int riskScore = Math.max(0, Math.min(100, data.path("riskScore").asInt(0)));
        String riskLevel = data.path("riskLevel").asString("LOW");
        String source = data.path("sourceModule").asString("ai");
        String evidence = data.path("evidencePath").isNull() ? null : data.path("evidencePath").asString(null);
        LocalDateTime occurredAt = LocalDateTime.now();
        entityManager.createNativeQuery("""
                INSERT INTO anti_cheat_events(attempt_id,event,module,active,occurred_at,duration_seconds,risk_score,risk_level,source_module,evidence_path)
                VALUES (:attemptId,:event,:module,:active,:occurredAt,:duration,:riskScore,:riskLevel,:source,:evidence)
                """)
                .setParameter("attemptId", attemptId).setParameter("event", event).setParameter("module", module)
                .setParameter("active", active).setParameter("occurredAt", occurredAt).setParameter("duration", duration)
                .setParameter("riskScore", riskScore).setParameter("riskLevel", riskLevel).setParameter("source", source)
                .setParameter("evidence", evidence).executeUpdate();
    }

    private void ensureTable() {
        if (tableEnsured) return;
        synchronized (DDL_LOCK) {
            if (tableEnsured) return;
            try {
                entityManager.createNativeQuery("""
                    CREATE TABLE IF NOT EXISTS anti_cheat_events (
                        id BIGSERIAL PRIMARY KEY,
                        attempt_id BIGINT NOT NULL REFERENCES exam_attempts(id) ON DELETE CASCADE,
                        event VARCHAR(80) NOT NULL,
                        module VARCHAR(20) NOT NULL DEFAULT 'M7',
                        active BOOLEAN NOT NULL DEFAULT TRUE,
                        occurred_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                        duration_seconds DOUBLE PRECISION DEFAULT 0,
                        risk_score INTEGER DEFAULT 0,
                        risk_level VARCHAR(20) DEFAULT 'LOW',
                        source_module VARCHAR(100),
                        evidence_path TEXT
                    )
                    """).executeUpdate();
                entityManager.createNativeQuery("ALTER TABLE anti_cheat_events ADD COLUMN IF NOT EXISTS module VARCHAR(20) NOT NULL DEFAULT 'M7'").executeUpdate();
                entityManager.createNativeQuery("ALTER TABLE anti_cheat_events ADD COLUMN IF NOT EXISTS duration_seconds DOUBLE PRECISION DEFAULT 0").executeUpdate();
                entityManager.createNativeQuery("ALTER TABLE anti_cheat_events ADD COLUMN IF NOT EXISTS risk_score INTEGER DEFAULT 0").executeUpdate();
                entityManager.createNativeQuery("ALTER TABLE anti_cheat_events ADD COLUMN IF NOT EXISTS risk_level VARCHAR(20) DEFAULT 'LOW'").executeUpdate();
                entityManager.createNativeQuery("ALTER TABLE anti_cheat_events ADD COLUMN IF NOT EXISTS source_module VARCHAR(100)").executeUpdate();
                entityManager.createNativeQuery("ALTER TABLE anti_cheat_events ADD COLUMN IF NOT EXISTS evidence_path TEXT").executeUpdate();
                entityManager.createNativeQuery("CREATE INDEX IF NOT EXISTS idx_anti_cheat_events_attempt_time ON anti_cheat_events(attempt_id, occurred_at)").executeUpdate();
                tableEnsured = true;
            } catch (Exception e) {
                tableEnsured = true;
            }
        }
    }

    private void callPython(String path, String json, HttpStatus errorStatus) { callPython(path, json, errorStatus, false); }
    private void callPython(String path, String json, HttpStatus errorStatus, boolean throwOnFailure) {
        HttpRequest req = HttpRequest.newBuilder().uri(URI.create(pythonUrl + path)).timeout(Duration.ofSeconds(path.equals("/session/start") ? 100 : 8))
                .header("Content-Type", "application/json").header("X-AntiCheat-Secret", internalSecret)
                .POST(HttpRequest.BodyPublishers.ofString(json)).build();
        try {
            HttpResponse<String> response = httpClient.send(req, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() < 200 || response.statusCode() >= 300) {
                String message = objectMapper.readTree(response.body()).path("message").asString("AI không sẵn sàng");
                throw new ApiException(errorStatus, message);
            }
            if (path.equals("/session/start") && !objectMapper.readTree(response.body()).path("ready").asBoolean(false))
                throw new ApiException(errorStatus, "Dịch vụ AI chưa xác nhận sẵn sàng. Hãy cập nhật run_service.py.");
        } catch (ApiException e) { throw e; }
        catch (Exception e) { throw new ApiException(errorStatus, "Không thể kết nối Anti-Cheating Python: " + e.getMessage()); }
    }

    private String escape(String value) { return value.replace("\\", "\\\\").replace("\"", "\\\""); }
}
