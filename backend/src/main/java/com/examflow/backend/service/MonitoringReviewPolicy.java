package com.examflow.backend.service;

/** Review priorities only. These values never change the student's exam grade. */
public final class MonitoringReviewPolicy {
    private MonitoringReviewPolicy() {}
    public static String interruptionEvent(String reason){return switch(reason){
        case "permission_denied" -> "CAMERA_PERMISSION_DENIED";
        case "connection_lost" -> "MONITORING_CONNECTION_LOST";
        case "identity_mismatch" -> "CAMERA_IDENTITY_PAUSE";
        case "no_face" -> "CAMERA_NO_FACE_PAUSE";
        case "liveness_failed" -> "CAMERA_LIVENESS_PAUSE";
        case "multiple_people" -> "CAMERA_MULTIPLE_PEOPLE_PAUSE";
        default -> "CAMERA_DEVICE_UNAVAILABLE";
    };}
    public static int interruptionScore(String reason,boolean active){
        return active&&"permission_denied".equals(reason)?30:0;
    }
    public static int fullscreenScore(double seconds,long occurrences){
        return occurrences>=3?30:seconds>=10?20:0;
    }
    public static String level(int score){return score>=75?"CRITICAL":score>=50?"HIGH":score>=25?"MEDIUM":"LOW";}
}
