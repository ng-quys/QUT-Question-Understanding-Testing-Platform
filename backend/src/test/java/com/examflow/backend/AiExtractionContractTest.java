package com.examflow.backend;

import com.examflow.backend.service.AiCreditsProvider;
import com.examflow.backend.service.*;
import com.examflow.backend.controller.AiCreditsController;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.util.ReflectionTestUtils;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.util.concurrent.atomic.AtomicReference;
import static org.junit.jupiter.api.Assertions.*;
import static org.junit.jupiter.api.Assumptions.assumeTrue;
import static org.mockito.Mockito.*;
import org.springframework.web.server.ResponseStatusException;
import java.util.*;

class AiExtractionContractTest {
    AiCreditsProvider provider(String url) {
        var provider=new AiCreditsProvider(new ObjectMapper());
        ReflectionTestUtils.setField(provider,"url",url);return provider;
    }
    @Test void forwardsFilesWithFilenameAndOriginalBytes() throws Exception {
        var body=new AtomicReference<byte[]>();var type=new AtomicReference<String>();var upgrade=new AtomicReference<String>();
        var server=HttpServer.create(new InetSocketAddress("127.0.0.1",0),0);
        server.createContext("/extract",exchange->{
            type.set(exchange.getRequestHeaders().getFirst("Content-Type"));
            upgrade.set(exchange.getRequestHeaders().getFirst("Upgrade"));
            body.set(exchange.getRequestBody().readAllBytes());
            byte[] response="{\"documents\":[{\"extractedText\":\"synthetic\",\"wordCount\":1}]}".getBytes(StandardCharsets.UTF_8);
            exchange.sendResponseHeaders(200,response.length);exchange.getResponseBody().write(response);exchange.close();
        });
        server.start();
        try {
            var provider=new AiCreditsProvider(new ObjectMapper());
            ReflectionTestUtils.setField(provider,"url","http://127.0.0.1:"+server.getAddress().getPort());
            provider.extract(new MockMultipartFile[]{new MockMultipartFile("files","contract.pdf","application/pdf","%PDF-synthetic-contract".getBytes(StandardCharsets.UTF_8))});
            Path dir=Path.of("target","extract-contract");Files.createDirectories(dir);
            Files.write(dir.resolve("request.bin"),body.get());Files.writeString(dir.resolve("content-type.txt"),type.get());
            String wire=new String(body.get(),StandardCharsets.ISO_8859_1);
            assertTrue(type.get().startsWith("multipart/form-data;boundary="));
            assertNull(upgrade.get(),"Uvicorn upload must use plain HTTP/1.1 without h2c upgrade");
            assertTrue(wire.contains("name=\"files\""),wire);
            assertTrue(wire.contains("filename=\"contract.pdf\""),wire);
            assertTrue(wire.contains("%PDF-synthetic-contract"),wire);
            assertTrue(wire.contains("Content-Type: application/pdf"),wire);
        } finally {server.stop(0);}
    }
    void rejected(int upstream,String detail,int expected,String message) throws Exception {
        var server=HttpServer.create(new InetSocketAddress("127.0.0.1",0),0);
        server.createContext("/extract",exchange->{
            exchange.getRequestBody().readAllBytes();
            byte[] response=detail.getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().set("Content-Type","application/json; charset=utf-8");
            exchange.sendResponseHeaders(upstream,response.length);exchange.getResponseBody().write(response);exchange.close();
        });
        server.start();
        try {
            var provider=provider("http://127.0.0.1:"+server.getAddress().getPort());
            var error=assertThrows(ResponseStatusException.class,()->provider.extract(new MockMultipartFile[]{
                new MockMultipartFile("files","private-name.pdf","application/pdf",new byte[]{1,2,3})}));
            assertEquals(expected,error.getStatusCode().value());
            assertTrue(error.getReason().contains(message));
            assertFalse(error.getReason().contains("private-name"));
            assertFalse(error.getReason().contains("PRIVATE_INPUT"));
        } finally {server.stop(0);}
    }
    @Test void validation422IsNotGeneric500() throws Exception {
        rejected(422,"{\"detail\":[{\"type\":\"missing\",\"loc\":[\"body\",\"files\"],\"input\":\"PRIVATE_INPUT\"}]}",422,"trường files");
    }
    @Test void scan422ExplainsOcr() throws Exception {
        rejected(422,"{\"detail\":\"private-name.pdf: không có văn bản; PDF scan cần OCR\"}",422,"OCR");
    }
    @Test void invalidPdf422DoesNotExposeParserInternals() throws Exception {
        rejected(422,"{\"detail\":\"Không đọc được private-name.pdf: PRIVATE_INPUT\"}",422,"Không đọc được tài liệu");
    }
    @Test void unsupported400AndOversize413ArePreserved() throws Exception {
        rejected(400,"{\"detail\":\"private-name.exe unsupported\"}",400,"PDF/DOCX/TXT");
        rejected(413,"{\"detail\":\"private-name.pdf too large\"}",413,"20 MB");
    }
    @Test void upstreamFailureIs502() throws Exception {
        rejected(500,"{\"detail\":\"PRIVATE_INPUT\"}",502,"Dịch vụ trích xuất");
    }
    @Test void missingAndEmptyFilesAre400WithoutHttp() {
        var provider=provider("http://127.0.0.1:1");
        assertEquals(400,assertThrows(ResponseStatusException.class,()->provider.extract(new MockMultipartFile[0])).getStatusCode().value());
        assertEquals(400,assertThrows(ResponseStatusException.class,()->provider.extract(new MockMultipartFile[]{
            new MockMultipartFile("files","empty.pdf","application/pdf",new byte[0])})).getStatusCode().value());
    }
    @Test void extractionOnlySignsProofAndNeverCallsCreditAccounting() throws Exception {
        var credits=mock(AiCreditsService.class);var provider=mock(AiCreditsProvider.class);
        var users=mock(CurrentUserService.class);var jwt=mock(org.springframework.security.oauth2.jwt.Jwt.class);
        var teacher=new com.examflow.backend.entity.UserEntity();teacher.setId(1L);teacher.setRole("teacher");
        when(users.getCurrentUser(jwt)).thenReturn(teacher);
        var files=new MockMultipartFile[]{new MockMultipartFile("files","doc.txt","text/plain",new byte[]{1})};
        when(provider.extract(files)).thenReturn(new HashMap<>(Map.of("documents",List.of(Map.of("extractedText","test")))));
        when(credits.documentProof(1,"test")).thenReturn("proof");
        var controller=new AiCreditsController(credits,provider,mock(AiCreditsWorker.class),users,mock(AdminIdentityService.class));
        assertEquals("proof",controller.extract(jwt,files).get("sourceProof"));
        verify(credits).documentProof(1,"test");verifyNoMoreInteractions(credits);
    }
    @Test void controllerReturns422AndMissingFiles400EvenWithGlobalHandler() throws Exception {
        var credits=mock(AiCreditsService.class);var provider=mock(AiCreditsProvider.class);
        var users=mock(CurrentUserService.class);
        var teacher=new com.examflow.backend.entity.UserEntity();teacher.setId(1L);teacher.setRole("teacher");
        when(users.getCurrentUser(null)).thenReturn(teacher);
        when(provider.extract(any())).thenThrow(new ResponseStatusException(org.springframework.http.HttpStatus.valueOf(422),"PDF cần OCR"));
        var controller=new AiCreditsController(credits,provider,mock(AiCreditsWorker.class),users,mock(AdminIdentityService.class));
        var mvc=org.springframework.test.web.servlet.setup.MockMvcBuilders.standaloneSetup(controller)
            .setCustomArgumentResolvers(new org.springframework.security.web.method.annotation.AuthenticationPrincipalArgumentResolver())
            .setControllerAdvice(new com.examflow.backend.exception.GlobalExceptionHandler(),new com.examflow.backend.controller.AiCreditsErrors()).build();
        mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart("/api/teacher/ai-credits/extract")
            .file(new MockMultipartFile("files","scan.pdf","application/pdf",new byte[]{1})))
            .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.status().is(422))
            .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.content().string(org.hamcrest.Matchers.containsString("OCR")));
        mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart("/api/teacher/ai-credits/extract"))
            .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.status().isBadRequest());
        verifyNoInteractions(credits);
    }
    @Test void liveFastApiAcceptsValidPdfAndReturnsDocumentErrors() throws Exception {
        String url=System.getProperty("ai.extract.liveUrl");assumeTrue(url!=null);
        assertEquals("http://127.0.0.1:8002",url);
        var provider=provider(url);
        var valid=new MockMultipartFile("files","contract.pdf","application/pdf",Files.readAllBytes(Path.of("target/extract-contract/valid.pdf")));
        assertTrue(provider.extract(new MockMultipartFile[]{valid}).get("documents").toString().contains("ExamFlow upload contract test"));
        var scan=new MockMultipartFile("files","scan.pdf","application/pdf",Files.readAllBytes(Path.of("target/extract-contract/scan.pdf")));
        assertTrue(assertThrows(ResponseStatusException.class,()->provider.extract(new MockMultipartFile[]{scan})).getReason().contains("OCR"));
    }
}
