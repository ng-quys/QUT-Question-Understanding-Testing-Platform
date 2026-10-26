package com.examflow.backend.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowCallbackHandler;
import java.sql.ResultSet;
import java.util.List;
import java.util.Map;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class ResultCloMetadataTests {
    final JdbcTemplate jdbc=mock(JdbcTemplate.class);
    final ExamSnapshotReadService service=new ExamSnapshotReadService(jdbc,new ObjectMapper());

    void rows(String sql, long[][] data) {
        doAnswer(call->{
            RowCallbackHandler callback=call.getArgument(1);
            for(long[] row:data){
                ResultSet rs=mock(ResultSet.class);
                when(rs.getLong(1)).thenReturn(row[0]);
                when(rs.getObject(2)).thenReturn(row[1]==0?null:Long.valueOf(row[1]));
                callback.processRow(rs);
            }
            return null;
        }).when(jdbc).query(contains(sql),any(RowCallbackHandler.class),any(Object[].class));
    }

    @Test void frozenNullCloDoesNotFallBackToChangedLiveQuestion() {
        when(jdbc.queryForObject(anyString(),eq(Boolean.class))).thenReturn(true);
        rows("public.exam_question_snapshots where",new long[][]{{1,0},{2,8}});
        assertEquals(Map.of(2L,8L),service.findCloIds(List.of(1L,2L)));
        verify(jdbc,never()).query(contains("join questions"),any(RowCallbackHandler.class),any(Object[].class));
    }

    @Test void mixedLegacyAndFrozenExamsUseBulkMetadataForMissingSnapshots() {
        when(jdbc.queryForObject(anyString(),eq(Boolean.class))).thenReturn(true);
        rows("public.exam_question_snapshots where",new long[][]{{1,8}});
        rows("join questions",new long[][]{{2,9}});
        assertEquals(Map.of(1L,8L,2L,9L),service.findCloIds(List.of(1L,2L)));
        verify(jdbc).query(contains("join questions"),any(RowCallbackHandler.class),eq(2L));
    }

    @Test void emptyExamDoesNotQueryTheDatabase() {
        assertTrue(service.findCloIds(List.of()).isEmpty());
        verifyNoInteractions(jdbc);
    }
}
