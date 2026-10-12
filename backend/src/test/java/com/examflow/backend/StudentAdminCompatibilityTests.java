package com.examflow.backend;

import com.examflow.backend.dto.AdminDto;
import com.examflow.backend.exception.ApiException;
import com.examflow.backend.service.AdminService;
import com.examflow.backend.service.AntiCheatService;
import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import tools.jackson.databind.json.JsonMapper;

import java.lang.reflect.InvocationTargetException;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.time.LocalDateTime;
import java.util.concurrent.atomic.AtomicReference;

import static org.junit.jupiter.api.Assertions.*;

class StudentAdminCompatibilityTests {
    @Test
    void adminTimelineMapsStringFieldsAndNulls() throws Exception {
        var mapping = AdminService.class.getDeclaredMethod("browserEventRow", Object.class);
        mapping.setAccessible(true);
        Object[] row = {1L, "SPEECH", true, LocalDateTime.now(), "M6", 1.5, 30, "MEDIUM", "audio", "evidence/test.jpg"};
        var event = (AdminDto.BrowserEvent) mapping.invoke(new AdminService(), (Object) row);
        assertEquals("audio", event.sourceModule());
        assertEquals("evidence/test.jpg", event.evidencePath());
        var mapper = JsonMapper.builder().build();
        var json = mapper.readTree(mapper.writeValueAsString(event));
        assertEquals("audio", json.path("sourceModule").asString());
        row[5] = row[6] = row[7] = row[8] = row[9] = null;
        event = (AdminDto.BrowserEvent) mapping.invoke(new AdminService(), (Object) row);
        assertNull(event.sourceModule());
        assertNull(event.evidencePath());
        assertEquals(0, event.riskScore());
        assertEquals(0.0, event.duration());
        assertEquals("LOW", event.riskLevel());
    }

    @Test
    void pythonStartRequiresReadyAndPreservesErrorMessage() throws Exception {
        var response = new AtomicReference<>("{\"ok\":true,\"ready\":true}");
        var responseCode = new AtomicReference<>(200);
        var observedSecret = new AtomicReference<String>();
        var server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/session/start", exchange -> {
            observedSecret.set(exchange.getRequestHeaders().getFirst("X-AntiCheat-Secret"));
            exchange.getRequestBody().readAllBytes();
            byte[] bytes = response.get().getBytes(StandardCharsets.UTF_8);
            exchange.sendResponseHeaders(responseCode.get(), bytes.length);
            exchange.getResponseBody().write(bytes);
            exchange.close();
        });
        server.start();
        try {
            var service = new AntiCheatService(null, "http://127.0.0.1:" + server.getAddress().getPort(), "test-secret");
            var call = AntiCheatService.class.getDeclaredMethod("callPython", String.class, String.class, HttpStatus.class);
            call.setAccessible(true);
            call.invoke(service, "/session/start", "{}", HttpStatus.BAD_GATEWAY);
            assertEquals("test-secret", observedSecret.get());
            response.set("{\"ok\":true,\"ready\":false}");
            var notReady = assertThrows(InvocationTargetException.class, () -> call.invoke(service, "/session/start", "{}", HttpStatus.BAD_GATEWAY));
            assertInstanceOf(ApiException.class, notReady.getCause());
            responseCode.set(409);
            response.set("{\"ok\":false,\"message\":\"Thiếu model det_10g.onnx\"}");
            var missingModel = assertThrows(InvocationTargetException.class, () -> call.invoke(service, "/session/start", "{}", HttpStatus.BAD_GATEWAY));
            assertEquals("Thiếu model det_10g.onnx", missingModel.getCause().getMessage());
        } finally {
            server.stop(0);
        }
    }

    @Test
    void runtimeHealthUsesJacksonThreeAndHandlesServiceDown() throws Exception {
        var server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/health", exchange -> {
            byte[] bytes = "{\"ok\":true,\"running\":true,\"ready\":true,\"attemptId\":32}".getBytes(StandardCharsets.UTF_8);
            exchange.sendResponseHeaders(200, bytes.length);
            exchange.getResponseBody().write(bytes);
            exchange.close();
        });
        server.start();
        var service = new AntiCheatService(null, "http://127.0.0.1:" + server.getAddress().getPort(), "test-secret");
        try {
            var state = service.runtimeStatus();
            assertTrue(state.path("ready").asBoolean());
            assertEquals(32L, state.path("attemptId").asLong());
        } finally {
            server.stop(0);
        }
        var offline = service.runtimeStatus();
        assertFalse(offline.path("ready").asBoolean());
        assertEquals("offline", offline.path("status").asString());
    }
}
