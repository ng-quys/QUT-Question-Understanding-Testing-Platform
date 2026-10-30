package com.examflow.backend.service;

import com.examflow.backend.exception.ApiException;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;
import javax.sql.DataSource;
import java.sql.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class AiDocumentServiceTest {
    @Test void featureFlagFailsClosed() {
        var service=new AiDocumentService(mock(javax.sql.DataSource.class),mock(javax.sql.DataSource.class),
            mock(SupabaseAiDocumentStorage.class),mock(AiCreditsProvider.class));
        ReflectionTestUtils.setField(service,"enabled",false);
        assertThrows(ApiException.class,()->service.list(1,2));
    }

    @Test void courseAuthorizationRunsBeforeQuestionBankRead() throws Exception {
        var main=countDataSource(0);
        var bank=mock(javax.sql.DataSource.class);
        var service=new AiDocumentService(main,bank,mock(SupabaseAiDocumentStorage.class),mock(AiCreditsProvider.class));
        ReflectionTestUtils.setField(service,"enabled",true);
        assertThrows(ApiException.class,()->service.list(8,12));
        verifyNoInteractions(bank);
    }

    @Test void invalidRefCountIsRejectedBeforeBankLookup() throws Exception {
        var main=countDataSource(1);
        var bank=mock(javax.sql.DataSource.class);
        var service=new AiDocumentService(main,bank,mock(SupabaseAiDocumentStorage.class),mock(AiCreditsProvider.class));
        ReflectionTestUtils.setField(service,"enabled",true);
        assertThrows(ApiException.class,()->service.validateRefs(7,12,java.util.List.of()));
        verifyNoInteractions(bank);
    }

    private static DataSource countDataSource(long count) throws Exception {
        var source=mock(DataSource.class);var connection=mock(Connection.class);
        var statement=mock(PreparedStatement.class);var result=mock(ResultSet.class);var metadata=mock(ResultSetMetaData.class);
        when(source.getConnection()).thenReturn(connection);when(connection.prepareStatement(anyString())).thenReturn(statement);
        when(statement.executeQuery()).thenReturn(result);when(result.next()).thenReturn(true,false);when(result.getLong(1)).thenReturn(count);
        when(result.getMetaData()).thenReturn(metadata);when(metadata.getColumnCount()).thenReturn(1);when(metadata.getColumnClassName(1)).thenReturn(Long.class.getName());
        return source;
    }
}
