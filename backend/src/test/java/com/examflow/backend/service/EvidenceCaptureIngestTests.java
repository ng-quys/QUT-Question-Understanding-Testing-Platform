package com.examflow.backend.service;

import com.examflow.backend.exception.ApiException;
import jakarta.persistence.*;
import org.junit.jupiter.api.*;
import org.springframework.test.util.ReflectionTestUtils;
import tools.jackson.databind.json.JsonMapper;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class EvidenceCaptureIngestTests {
    final EntityManager em=mock(EntityManager.class);
    final Query query=mock(Query.class,RETURNS_SELF);
    final AiEvidenceIngest service=new AiEvidenceIngest(mock(EvidenceSchema.class),mock(SupabaseEvidenceStorage.class));
    final String capture=UUID.randomUUID().toString();
    @BeforeEach void setup(){ReflectionTestUtils.setField(service,"em",em);when(em.createNativeQuery(anyString())).thenReturn(query);}
    Map<String,Object> payload(){return new HashMap<>(Map.of("attemptId",125,"eventUuid",UUID.randomUUID().toString(),"captureUuid",capture,"event","SPEECH","timestamp","2026-10-23T03:00:00Z","evidenceStatus","pending"));}
    @Test void captureIdIsBoundWithItsEventAndAttempt(){
        service.receive(JsonMapper.builder().build().valueToTree(payload()));verify(query).setParameter("capture",capture);verify(query).setParameter("attempt",125L);
    }
    @Test void malformedCaptureOrMismatchedPhotoCannotBeAttached(){
        var data=payload();data.put("captureUuid","invalid");final var invalid=data;assertThrows(ApiException.class,()->service.receive(JsonMapper.builder().build().valueToTree(invalid)));
        data=payload();data.put("evidenceStatus","uploaded");data.put("evidenceKey","attempt-125/"+UUID.randomUUID()+".jpg");data.put("evidenceBucket","exam-evidence");
        final var wrong=data;assertThrows(ApiException.class,()->service.receive(JsonMapper.builder().build().valueToTree(wrong)));verifyNoInteractions(em);
    }
}
