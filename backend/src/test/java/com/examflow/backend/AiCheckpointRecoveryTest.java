package com.examflow.backend;

import com.examflow.backend.service.*;
import org.junit.jupiter.api.*;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.mockito.ArgumentMatchers.*;

class AiCheckpointRecoveryTest {
    AiCreditsService credits=mock(AiCreditsService.class);
    AiCreditsProvider provider=mock(AiCreditsProvider.class);
    AiWorkerCoordinator coordination=mock(AiWorkerCoordinator.class);
    AiCheckpointRecovery recovery=new AiCheckpointRecovery(credits,provider,coordination);
    UUID token=UUID.randomUUID();
    @BeforeEach void setup() throws Exception {
        when(credits.raw(15)).thenReturn(Map.of("execution_token",token,"accepted_count",2,"reserved_monthly",10,"reserved_extra",0));
        when(credits.recoveryFingerprint(anyMap())).thenReturn("checkpoint");when(credits.results(anyMap())).thenReturn(List.of());
        when(coordination.binding(anyMap())).thenReturn("old");when(provider.registryId()).thenReturn("new");
        when(provider.status(token,"new")).thenThrow(new AiCreditsProvider.ProviderException(404,"UPSTREAM_JOB_NOT_FOUND"));
    }
    @Test void previewOnlyReadsAndReportsTwoAndEight(){
        var proof=recovery.preview(15);assertEquals(2,proof.get("accepted"));assertEquals(8,proof.get("release"));
        verify(credits,never()).recoverCancelledCheckpoint(anyLong(),anyLong(),anyString(),anyString());
    }
    @Test void sameRegistryAndRunningExecutionAreBlocked() throws Exception {
        when(provider.registryId()).thenReturn("old");assertThrows(Exception.class,()->recovery.preview(15));
        when(provider.registryId()).thenReturn("new");doReturn(new com.fasterxml.jackson.databind.ObjectMapper().readTree("{\"status\":\"running\"}")).when(provider).status(token,"new");
        assertThrows(Exception.class,()->recovery.preview(15));
    }
    @Test void networkOrRegistryErrorCannotReleaseCredits() throws Exception {
        doThrow(new java.io.IOException()).when(provider).status(token,"new");assertThrows(Exception.class,()->recovery.preview(15));
        doThrow(new AiCreditsProvider.ProviderException(409,"UPSTREAM_REGISTRY_MISMATCH")).when(provider).status(token,"new");assertThrows(Exception.class,()->recovery.preview(15));
    }
    @Test void changedSnapshotRegistryAndMissingAttestationCannotWrite(){
        assertThrows(Exception.class,()->recovery.recover(52,15,false,"checkpoint","new","reason"));
        assertThrows(Exception.class,()->recovery.recover(52,15,true,"changed","new","reason"));
        assertThrows(Exception.class,()->recovery.recover(52,15,true,"checkpoint","changed","reason"));
        verify(credits,never()).recoverCancelledCheckpoint(anyLong(),anyLong(),anyString(),anyString());
    }
    @Test void approvedRecoveryUsesExistingSettlement(){
        recovery.recover(52,15,true,"checkpoint","new","reason");verify(credits).recoverCancelledCheckpoint(52,15,"checkpoint","reason");
    }
}
