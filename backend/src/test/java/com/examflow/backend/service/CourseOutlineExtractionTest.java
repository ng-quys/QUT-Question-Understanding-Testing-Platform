package com.examflow.backend.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.examflow.backend.exception.ApiException;
import org.junit.jupiter.api.*;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.util.ReflectionTestUtils;
import java.nio.file.*;
import static org.junit.jupiter.api.Assertions.*;

class CourseOutlineExtractionTest {
    final CourseOutlineExtractionService reader=new CourseOutlineExtractionService(new ObjectMapper());
    @Test void unsupportedOrEmptyFileIsRejectedBeforeStartingProcess() {
        for(var file:new MockMultipartFile[]{new MockMultipartFile("file","x.exe","application/pdf",new byte[]{1}),new MockMultipartFile("file","x.pdf","application/pdf",new byte[]{})})
            assertThrows(ApiException.class,()->reader.extract(file));
    }
    @Test void missingParserIsAnActionableError() {
        ReflectionTestUtils.setField(reader,"python","python");ReflectionTestUtils.setField(reader,"script","nonexistent-outline.py");
        var error=assertThrows(ApiException.class,()->reader.extract(new MockMultipartFile("file","x.pdf","application/pdf",new byte[]{1})));
        assertTrue(error.getMessage().contains("Không tìm thấy bộ đọc"));
    }
    @Test void realPythonProcessReturnsFullSampleWithoutDatabase()throws Exception {
        var folder=Path.of("../scripts/course-outline").toAbsolutePath().normalize();
        var python=folder.resolve(System.getProperty("os.name").startsWith("Windows")?".venv/Scripts/python.exe":".venv/bin/python");
        var sample=Path.of("../ĐỀ CƯƠNG HỌC PHẦN THỨ 52(ATTT).pdf");
        Assumptions.assumeTrue(Files.exists(python)&&Files.exists(sample),"Optional local parser venv and sample PDF required");
        ReflectionTestUtils.setField(reader,"python",python.toString());ReflectionTestUtils.setField(reader,"script",folder.resolve("extract.py").toString());
        var draft=reader.extract(new MockMultipartFile("file",sample.getFileName().toString(),"application/pdf",Files.readAllBytes(sample)));
        assertEquals("0101101973",draft.course().code());assertEquals(8,draft.chapters().size());
        assertEquals(59,draft.chapters().stream().mapToInt(c->c.topics().size()).sum());assertEquals(7,draft.clos().size());
        assertTrue(draft.clos().get(5).description().endsWith("biết đã đạt được."));
        assertDoesNotThrow(()->CourseOutlineImportService.validate(draft));
    }
}
