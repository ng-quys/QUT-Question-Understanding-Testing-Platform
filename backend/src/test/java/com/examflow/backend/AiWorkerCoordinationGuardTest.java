package com.examflow.backend;

import com.examflow.backend.service.*;
import com.examflow.backend.controller.AiCreditsController;
import com.fasterxml.jackson.databind.ObjectMapper;
import javax.sql.DataSource;
import java.sql.*;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.http.HttpStatus;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class AiWorkerCoordinationGuardTest {
    @Test void clusterUpgradeMustBeConfirmedBeforeAnyDatabaseOrCreditOperation() {
        var source=mock(DataSource.class);var coordination=new AiWorkerCoordinator(source,new ObjectMapper());
        assertEquals(503,assertThrows(ResponseStatusException.class,coordination::requireReady).getStatusCode().value());
        assertThrows(IllegalStateException.class,()->coordination.requireAuthority(8));
        verifyNoInteractions(source);
    }
    @Test void transactionPoolEndpointIsRejectedAndConnectionClosed()throws Exception {
        var source=mock(DataSource.class);var connection=mock(Connection.class);var metadata=mock(DatabaseMetaData.class);
        when(source.getConnection()).thenReturn(connection);when(connection.getMetaData()).thenReturn(metadata);
        when(metadata.getURL()).thenReturn("jdbc:postgresql://pooler.fixture:6543/postgres");
        var coordination=new AiWorkerCoordinator(source,new ObjectMapper());
        assertThrows(IllegalStateException.class,()->coordination.run(8,UUID.randomUUID(),"fixture",row->fail("must not run")));
        verify(connection).close();verify(connection,never()).prepareStatement(anyString());
    }
    @Test void unsafeClusterBlocksCreateBeforeReservation() {
        var credits=mock(AiCreditsService.class);var coordination=mock(AiWorkerCoordinator.class);
        var users=mock(CurrentUserService.class);var teacher=new com.examflow.backend.entity.UserEntity();
        teacher.setId(1L);teacher.setRole("teacher");when(users.getCurrentUser(null)).thenReturn(teacher);
        doThrow(new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,"Legacy worker remains")).when(coordination).requireReady();
        var controller=new AiCreditsController(credits,mock(AiCreditsProvider.class),mock(AiCreditsWorker.class),users,mock(AdminIdentityService.class),coordination);
        assertThrows(ResponseStatusException.class,()->controller.create(null,UUID.randomUUID(),null));
        assertEquals(false,controller.readiness(null).get("ready"));verifyNoInteractions(credits);
    }
}
