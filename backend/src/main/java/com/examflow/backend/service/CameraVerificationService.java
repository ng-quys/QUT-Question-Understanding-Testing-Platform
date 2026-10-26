package com.examflow.backend.service;

import com.examflow.backend.exception.ApiException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import tools.jackson.databind.JsonNode;
import java.time.Clock;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;

/** Short-lived, server-owned proofs. No image, token or biometric is written to disk here. */
@Service
public class CameraVerificationService {
    private static final long PROOF_TTL_MS=15000;
    private final BatchMonitoringService monitoring;
    private final StudentProfileService photos;
    private final Clock clock;
    private record Key(long student,long session) {}
    private static class Check {byte[] reference;String version,token;volatile long expires;long lastStarted,lastGood,goodSince,versionCheckedAt;int goodFrames;}
    private static class Health {
        long student,session,end,lastSeen,blockedAt,validUntil,proofAt,missingSince,incidentSince;
        boolean verified;String reason="checking",missingReason="device_unavailable",incidentReason="device_unavailable";
        final List<Interruption> pending=new ArrayList<>();
    }
    public record Interruption(String key,long since,long until,String reason) {
        public Interruption(String key,long since,long until){this(key,since,until,"device_unavailable");}
    }
    public record Proof(long student,long session) {}
    public record Result(boolean required,boolean verified,String reason,String message,String verificationToken,long expiresAt) {}
    public record CameraHealth(boolean cameraVerified,String cameraReason,String cameraMessage) {}
    private final Map<Key,Check> checks=new ConcurrentHashMap<>();
    private final Map<Long,Health> health=new ConcurrentHashMap<>();
    @org.springframework.beans.factory.annotation.Autowired
    public CameraVerificationService(BatchMonitoringService monitoring,StudentProfileService photos){this(monitoring,photos,Clock.systemUTC());}
    CameraVerificationService(BatchMonitoringService monitoring,StudentProfileService photos,Clock clock){this.monitoring=monitoring;this.photos=photos;this.clock=clock;}
    private long now(){return clock.millis();}
    public static String message(String reason){return switch(reason){
        case "verified" -> "Camera và khuôn mặt đã được xác minh.";
        case "no_face" -> "Chưa thấy khuôn mặt. Hãy bật camera, mở nắp che và nhìn thẳng vào camera.";
        case "multiple_people" -> "Phát hiện nhiều người trong khung hình. Cảnh báo được ghi nhận để giảng viên xem xét.";
        case "identity_mismatch" -> "Khuôn mặt chưa khớp ảnh hồ sơ. Hãy nhìn thẳng và kiểm tra ánh sáng.";
        case "liveness_failed" -> "Chưa xác nhận được người thật. Không dùng ảnh hoặc màn hình thay khuôn mặt.";
        case "reference_invalid" -> "Ảnh hồ sơ phải có đúng một khuôn mặt rõ ràng. Vui lòng liên hệ đơn vị quản lý.";
        case "face_unclear", "invalid_image" -> "Hình ảnh chưa rõ. Hãy điều chỉnh ánh sáng và khoảng cách camera.";
        case "permission_denied" -> "Quyền truy cập camera bị chặn. Hãy cấp lại quyền camera để tiếp tục thi.";
        case "device_unavailable" -> "Camera không có hình hoặc gặp lỗi thiết bị. Hãy kiểm tra camera để tiếp tục thi.";
        case "connection_lost" -> "Chưa xác nhận được kết nối giám sát. Hãy kiểm tra mạng và kết nối lại.";
        case "busy", "ai_unavailable" -> "Dịch vụ xác minh đang bận hoặc chưa sẵn sàng. Vui lòng thử lại.";
        default -> "Đang xác minh camera và khuôn mặt. Vui lòng giữ khuôn mặt trong khung hình.";
    };}
    private Result result(Check state,boolean verified,String reason){return new Result(true,verified,reason,message(reason),verified?state.token:null,verified?state.lastGood+PROOF_TTL_MS:0);}
    public Result check(long student,long session,String jpeg){
        if(jpeg==null||jpeg.length()<8||jpeg.length()>334000)throw new ApiException(HttpStatus.BAD_REQUEST,"Ảnh camera không hợp lệ hoặc vượt giới hạn dung lượng.");
        long now=now();checks.entrySet().removeIf(e->e.getValue().expires<now);
        Key key=new Key(student,session);
        if(!checks.containsKey(key)&&checks.size()>=1000)throw new ApiException(HttpStatus.TOO_MANY_REQUESTS,"Có nhiều yêu cầu xác minh. Vui lòng thử lại.");
        Check state=checks.computeIfAbsent(key,k->{Check created=new Check();created.expires=now+120000;return created;});
        synchronized(state){
            if(state.lastStarted>0&&now-state.lastStarted<500)return result(state,false,"checking");
            state.lastStarted=now;state.expires=now+120000;
            // The final one-use proof always rechecks and locks the current photo version.
            // Avoid an extra database photo lookup on each frame of the same short check.
            if(state.reference==null||now-state.versionCheckedAt>=5000){
                String version=photos.referenceVersion(student);
                if(!version.equals(state.version)){
                    state.reference=photos.getFacePhoto(student);state.version=version;state.goodFrames=0;state.token=null;
                }
                state.versionCheckedAt=now;
            }
            JsonNode value;
            try{value=monitoring.verifyIdentity(jpeg,state.reference);}
            catch(RuntimeException error){state.goodFrames=0;state.token=null;throw error;}
            long received=now();
            if(!value.path("verified").asBoolean(false)){
                state.goodFrames=0;state.token=null;
                return result(state,false,value.path("reason").asString("ai_unavailable"));
            }
            // Measure the idle gap before this request, not time spent waiting for the model.
            if(now-state.lastGood>4000||state.goodFrames==0){state.goodFrames=0;state.goodSince=received;}
            state.lastGood=received;state.goodFrames++;
            if(state.goodFrames<3||received-state.goodSince<1500)return result(state,false,"checking");
            if(state.token==null)state.token=UUID.randomUUID().toString();
            return result(state,true,"verified");
        }
    }
    public Proof consume(long student,long session,String token){
        Check state=checks.get(new Key(student,session));
        if(state==null)throw denied();
        synchronized(state){
            if(token==null||!token.equals(state.token)||state.goodFrames<3||now()-state.lastGood>PROOF_TTL_MS||!Objects.equals(state.version,photos.lockReferenceVersion(student)))throw denied();
            state.token=null;state.goodFrames=0;
            return new Proof(student,session);
        }
    }
    public void bind(long attempt,Proof proof,long end){
        health.compute(attempt,(id,previous)->{
            Health state=new Health();state.student=proof.student();state.session=proof.session();state.end=end;
            state.lastSeen=state.proofAt=now();state.validUntil=now()+15000;state.verified=true;state.reason="verified";
            if(previous!=null)synchronized(previous){finish(previous);state.pending.addAll(previous.pending);}
            return state;
        });
    }
    public boolean device(long attempt,long student,boolean available){
        return device(attempt,student,available,"device_unavailable");
    }
    public boolean device(long attempt,long student,boolean available,String reason){
        Health state=health.get(attempt);if(state==null||state.student!=student)return false;
        synchronized(state){
            state.lastSeen=now();
            if(available)state.missingSince=0;
            else {
                String cause="permission_denied".equals(reason)?"permission_denied":"device_unavailable";
                if(state.missingSince==0||!cause.equals(state.missingReason))state.missingSince=now();
                state.missingReason=cause;
            }
            boolean wasVerified=state.verified;expire(state);
            return wasVerified&&!state.verified;
        }
    }
    private void block(Health state,String reason,long since){
        if(state.incidentSince!=0&&!reason.equals(state.incidentReason)){
            finish(state);since=now();
        }
        if(state.incidentSince==0){
            state.blockedAt=now();state.incidentSince=Math.max(state.proofAt,Math.min(since,now()));
            state.incidentReason=reason;
            state.pending.add(new Interruption(UUID.randomUUID().toString(),state.incidentSince,0,reason));
        }
        state.verified=false;state.reason=reason;
    }
    private void finish(Health state){
        if(state.incidentSince!=0){
            state.pending.add(new Interruption(UUID.randomUUID().toString(),state.incidentSince,Math.max(state.incidentSince,Math.min(now(),state.end)),state.incidentReason));
            state.incidentSince=0;
        }
    }
    private void expire(Health state){
        if(state.end<=now()){state.verified=false;return;}
        if(now()-state.lastSeen>30000)block(state,"connection_lost",state.lastSeen);
        else if(state.missingSince!=0&&now()-state.missingSince>=5000)block(state,state.missingReason,state.missingSince);
    }
    public void observe(long attempt,JsonNode status){
        Health state=health.get(attempt);if(state==null)return;
        synchronized(state){
            long processed=(long)(status.path("lastProcessedAt").asDouble(0)*1000);
            if("waiting".equals(status.path("status").asString())&&state.verified)state.validUntil=now()+15000;
            if(state.missingSince==0&&now()-state.lastSeen<=30000&&"blocked".equals(status.path("cameraState").asString())&&!"multiple_people".equals(status.path("cameraReason").asString())&&processed>=state.proofAt&&processed>=state.blockedAt&&now()-processed<15000){
                long since=(long)(status.path("cameraBadSince").asDouble(processed/1000.0)*1000);
                block(state,status.path("cameraReason").asString("no_face"),since);
            }else if(state.missingSince==0&&"verified".equals(status.path("cameraState").asString())&&processed>=state.proofAt&&processed>state.blockedAt&&now()-processed<15000){
                finish(state);state.verified=true;state.reason="verified";state.validUntil=processed+15000;
            }
            expire(state);
        }
    }
    public CameraHealth status(long attempt,long student){
        Health state=health.get(attempt);
        if(state==null||state.student!=student)return new CameraHealth(false,"checking",message("checking"));
        synchronized(state){expire(state);return new CameraHealth(state.verified,state.reason,message(state.reason));}
    }
    public List<Interruption> interruptions(long attempt){
        Health state=health.get(attempt);if(state==null)return List.of();
        synchronized(state){return List.copyOf(state.pending);}
    }
    public void acknowledge(long attempt,String key){
        Health state=health.get(attempt);if(state!=null)synchronized(state){state.pending.removeIf(event->event.key().equals(key));}
    }
    public void finish(long attempt){Health state=health.get(attempt);if(state!=null)synchronized(state){expire(state);finish(state);}}
    public void requireHealthy(long attempt,long student){var value=status(attempt,student);if(!value.cameraVerified()&&!"connection_lost".equals(value.cameraReason()))throw denied();}
    public Set<Long> attemptIds(){return Set.copyOf(health.keySet());}
    public boolean maintain(long attempt){
        Health state=health.get(attempt);if(state==null)return false;
        synchronized(state){expire(state);if(now()>=state.end){finish(state);return true;}return false;}
    }
    public void clear(long attempt){health.remove(attempt);}
    private ApiException denied(){return new ApiException(HttpStatus.CONFLICT,"Cần xác minh lại camera và khuôn mặt trước khi tiếp tục làm bài.");}
}
