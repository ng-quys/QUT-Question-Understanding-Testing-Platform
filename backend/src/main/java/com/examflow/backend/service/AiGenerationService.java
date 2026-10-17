package com.examflow.backend.service;

import com.examflow.backend.dto.*;
import com.fasterxml.jackson.databind.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;
import java.net.URI;
import java.net.http.*;
import java.time.Duration;
import java.util.*;

@Service
public class AiGenerationService {
    private final ObjectMapper json;
private final HttpClient http = HttpClient.newBuilder()
    .version(HttpClient.Version.HTTP_1_1)
    .proxy(java.net.ProxySelector.of(null))
    .connectTimeout(Duration.ofSeconds(10))
    .build();
    
    @Value("${ai.openai.key:}") private String openaiKey;
    @Value("${ai.openai.model:gpt-4.1-mini}") private String openaiModel;
    @Value("${ai.rag.url:http://127.0.0.1:8002}") private String ragUrl;

    public AiGenerationService(ObjectMapper json) { this.json = json; }

    public List<AiQuestionDto> generate(AiGenerateRequest request) {
        if (!List.of("openai", "qwen").contains(request.provider()))
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Provider không hợp lệ");
        int total = request.units().stream().mapToInt(u -> u.nb()+u.th()+u.vd()).sum();
        if (total < 1 || total > 30)
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Mỗi lượt hỗ trợ 1-30 câu hỏi");
        if (request.sourceText() == null || request.sourceText().isBlank())
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Cần nội dung tài liệu thực tế");
        if ("qwen".equals(request.provider())) return generateViaRag(request);
        return generateViaOpenAi(request);
    }

private List<AiQuestionDto> generateViaRag(AiGenerateRequest request) {
    try {
        // 1. Tạo JSON gửi sang FastAPI
        String requestJson = json.writeValueAsString(Map.of(
    "courseId", request.courseId(),
    "sourceText", request.sourceText(),
    "instruction", Objects.toString(request.instruction(), ""),
    "units", request.units()
));

System.out.println("RAG JSON LENGTH: " + requestJson.length());

HttpRequest req = HttpRequest.newBuilder(
        URI.create(ragUrl.replaceAll("/+$", "") + "/generate"))
    .timeout(Duration.ofMinutes(25))
    .header("Content-Type", "application/json; charset=utf-8")
    .POST(HttpRequest.BodyPublishers.ofString(
        requestJson,
        java.nio.charset.StandardCharsets.UTF_8
    ))
    .build();

HttpResponse<String> res = http.send(
    req,
    HttpResponse.BodyHandlers.ofString()
);

System.out.println("RAG HTTP STATUS: " + res.statusCode());
System.out.println("RAG RESPONSE: " + res.body());

        // Giữ nguyên phần xử lý từ đây trở xuống
        if (res.statusCode() != 200) {
                String detail = res.body();
                try { detail = json.readTree(res.body()).path("detail").asText(res.body()); }
                catch (Exception ignored) {}
                throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "RAG service HTTP " + res.statusCode() + ": " + detail);
            }
            JsonNode arr = json.readTree(res.body());
            if (!arr.isArray()) throw new IllegalArgumentException("RAG service không trả danh sách câu hỏi");
            List<AiQuestionDto> questions = new ArrayList<>();
            for (JsonNode q : arr) {
                JsonNode opts = q.path("options");
                if (!opts.isArray() || opts.size() != 4 || q.path("content").asText().isBlank())
                    throw new IllegalArgumentException("Câu hỏi RAG sai định dạng");
                List<String> options = new ArrayList<>();
                for (JsonNode opt : opts) options.add(opt.asText());
                int correct = q.path("correctIndex").asInt(-1);
                if (correct < 0 || correct > 3) throw new IllegalArgumentException("Đáp án đúng không hợp lệ");
                questions.add(new AiQuestionDto(q.path("content").asText(), options, correct,
                    q.path("explanation").asText(), q.path("bloom").asText(),
                    q.path("chapterId").isNull() ? null : q.path("chapterId").asLong(),
                    q.path("cloId").isNull() ? null : q.path("cloId").asLong()));
            }
            int expected = request.units().stream().mapToInt(u -> u.nb()+u.th()+u.vd()).sum();
            if (questions.size() != expected) throw new IllegalArgumentException("RAG trả thiếu câu hỏi");
            return questions;
        } catch (ResponseStatusException e) { throw e; }
        catch (java.net.ConnectException e) {
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,
                "FastAPI RAG chưa chạy ở " + ragUrl, e);
        } catch (Exception e) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "Lỗi kết nối RAG: " + e.getMessage(), e);
        }
    }

    private List<AiQuestionDto> generateViaOpenAi(AiGenerateRequest request) {
        if (openaiKey.isBlank()) throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "Thiếu OpenAI API key");
        List<AiQuestionDto> result = new ArrayList<>();
        for (var unit : request.units()) {
            for (var pair : List.of(Map.entry("remember", unit.nb()), Map.entry("understand", unit.th()), Map.entry("apply", unit.vd()))) {
                for (int i = 0; i < pair.getValue(); i++) {
                    String prompt = "Chỉ dựa vào tài liệu, sinh đúng 1 câu trắc nghiệm tiếng Việt mức Bloom " + pair.getKey() +
                        ", chủ đề " + unit.name() + ". Yêu cầu: " + Objects.toString(request.instruction(), "") +
                        ". Trả JSON {\"questions\":[{\"content\":\"...\",\"options\":[\"...\",\"...\",\"...\",\"...\"],\"correctIndex\":0,\"explanation\":\"...\"}]}" +
                        ". Tài liệu: " + request.sourceText().substring(0, Math.min(12000, request.sourceText().length()));
                    try {
                        Map<String,Object> payload = Map.of("model",openaiModel,"messages",List.of(Map.of("role","user","content",prompt)),"response_format",Map.of("type","json_object"));
                        HttpRequest httpRequest = HttpRequest.newBuilder(URI.create("https://api.openai.com/v1/chat/completions"))
                            .timeout(Duration.ofMinutes(3)).header("Content-Type","application/json")
                            .header("Authorization","Bearer " + openaiKey)
                            .POST(HttpRequest.BodyPublishers.ofString(json.writeValueAsString(payload))).build();
                        HttpResponse<String> response = http.send(httpRequest, HttpResponse.BodyHandlers.ofString());
                        if (response.statusCode() != 200) throw new IllegalArgumentException("OpenAI HTTP " + response.statusCode());
                        String answer = json.readTree(response.body()).path("choices").path(0).path("message").path("content").asText();
                        JsonNode arr = json.readTree(answer).path("questions");
                        if (!arr.isArray() || arr.size() != 1) throw new IllegalArgumentException("OpenAI trả sai số câu");
                        JsonNode q = arr.get(0), opts = q.path("options");
                        if (!opts.isArray() || opts.size()!=4) throw new IllegalArgumentException("OpenAI trả sai đáp án");
                        List<String> options = new ArrayList<>();
                        opts.forEach(o -> options.add(o.asText()));
                        int correct = q.path("correctIndex").asInt(-1);
                        if (correct < 0 || correct > 3) throw new IllegalArgumentException("OpenAI trả sai đáp án đúng");
                        result.add(new AiQuestionDto(q.path("content").asText(),options,correct,q.path("explanation").asText(),pair.getKey(),unit.chapterId(),unit.cloId()));
                    } catch (Exception e) { throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "Lỗi OpenAI: " + e.getMessage(), e); }
                }
            }
        }
        return result;
    }
}
