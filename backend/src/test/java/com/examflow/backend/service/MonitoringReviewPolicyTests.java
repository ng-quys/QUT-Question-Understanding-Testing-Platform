package com.examflow.backend.service;

import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

class MonitoringReviewPolicyTests {
    @Test void technicalFailuresAndRepeatedAuditEndRowsDoNotAddReviewPoints(){
        for(String reason:new String[]{"connection_lost","device_unavailable","no_face","identity_mismatch","liveness_failed","multiple_people"})
            assertEquals(0,MonitoringReviewPolicy.interruptionScore(reason,true));
        assertEquals(30,MonitoringReviewPolicy.interruptionScore("permission_denied",true));
        assertEquals(0,MonitoringReviewPolicy.interruptionScore("permission_denied",false));
    }
    @Test void briefAccidentalFullscreenExitIsDifferentFromProlongedOrRepeatedExit(){
        assertEquals(0,MonitoringReviewPolicy.fullscreenScore(9.99,1));
        assertEquals(20,MonitoringReviewPolicy.fullscreenScore(10,1));
        assertEquals(30,MonitoringReviewPolicy.fullscreenScore(0,3));
        assertEquals(30,MonitoringReviewPolicy.fullscreenScore(30,3));
    }
}
