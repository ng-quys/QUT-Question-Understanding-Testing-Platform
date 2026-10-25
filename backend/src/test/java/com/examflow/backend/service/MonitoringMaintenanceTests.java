package com.examflow.backend.service;

import org.junit.jupiter.api.Test;
import java.util.Set;
import static org.mockito.Mockito.*;

class MonitoringMaintenanceTests {
    @Test void fullscreenReviewStillRunsWhenNoCameraOrAiSessionIsRegistered(){
        var camera=mock(CameraVerificationService.class);var audit=mock(AntiCheatService.class);
        when(camera.attemptIds()).thenReturn(Set.of());
        new CameraInterruptionMaintenance(camera,audit).maintain();
        verify(audit).updateOpenFullscreenReviews();verify(audit,never()).maintainCamera(anyLong());
    }
    @Test void failedFullscreenUpdateDoesNotPreventCameraAuditMaintenance(){
        var camera=mock(CameraVerificationService.class);var audit=mock(AntiCheatService.class);
        when(camera.attemptIds()).thenReturn(Set.of(12L));
        doThrow(new IllegalStateException("synthetic database failure")).when(audit).updateOpenFullscreenReviews();
        new CameraInterruptionMaintenance(camera,audit).maintain();
        verify(audit).maintainCamera(12L);
    }
}
