package com.examflow.backend.service;

import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/** Finalize camera audit periods even when the student closes the browser. No model inference here. */
@Component
@EnableScheduling
public class CameraInterruptionMaintenance {
    private static final org.slf4j.Logger LOG=org.slf4j.LoggerFactory.getLogger(CameraInterruptionMaintenance.class);
    private final CameraVerificationService camera;
    private final AntiCheatService audit;
    public CameraInterruptionMaintenance(CameraVerificationService camera,AntiCheatService audit){this.camera=camera;this.audit=audit;}
    @Scheduled(fixedDelay=5000)
    public void maintain(){
        try{audit.updateOpenFullscreenReviews();}
        catch(RuntimeException error){LOG.warn("Chưa cập nhật được mức độ cần xem xét khi thoát toàn màn hình; sẽ thử lại.");}
        for(long attempt:camera.attemptIds()){
            try{audit.maintainCamera(attempt);}
            catch(RuntimeException error){LOG.warn("Chưa cập nhật được thời lượng gián đoạn camera; sẽ thử lại.");}
        }
    }
}
