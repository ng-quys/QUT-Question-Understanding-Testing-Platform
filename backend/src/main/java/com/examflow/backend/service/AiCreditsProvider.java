package com.examflow.backend.service;

import com.examflow.backend.dto.*;
import com.fasterxml.jackson.databind.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.http.MediaType;
import org.springframework.http.HttpStatus;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.web.multipart.MultipartFile;
import java.net.URI;
import java.net.http.*;
import java.time.Duration;
import java.util.*;

/** Internal transport only. No changes to prompts, retrieval or model selection. */
@Service
public class AiCreditsProvider {
    private static final Logger log=LoggerFactory.getLogger(AiCreditsProvider.class);
    private final ObjectMapper json;
    private final HttpClient http=HttpClient.newBuilder().version(HttpClient.Version.HTTP_1_1)
        .proxy(java.net.ProxySelector.of(null)).connectTimeout(Duration.ofSeconds(5)).build();
    // Uvicorn's HTTP/1.1 endpoint must not receive the JDK client's h2c upgrade.
    private final RestClient extractionHttp=RestClient.builder().requestFactory(new JdkClientHttpRequestFactory(
        HttpClient.newBuilder().version(HttpClient.Version.HTTP_1_1).proxy(java.net.ProxySelector.of(null))
            .connectTimeout(Duration.ofSeconds(5)).build())).build();
    @Value("${ai.rag.url:http://127.0.0.1:8002}") private String url;
    @Value("${ai.internal.key:}") private String key;
    public AiCreditsProvider(ObjectMapper json){this.json=json;}
    /** Safe diagnostics only: never carries upstream body, source text or secret. */
    public static class ProviderException extends IllegalStateException {
        private final int status;
        private final String code;
        public ProviderException(int status,String code){
            super("AI Service HTTP "+status+" ("+code+")");this.status=status;this.code=code;
        }
        public int status(){return status;}
        public String code(){return code;}
    }
    private JsonNode call(String method,String path,Object payload) throws Exception {
        if(key.length()<32)throw new ProviderException(503,"BE_INTERNAL_KEY_MISSING");
        var request=HttpRequest.newBuilder(URI.create(url.replaceAll("/+$","")+path))
            .timeout(Duration.ofSeconds(15)).header("X-AI-Internal-Key",key);
        if("GET".equals(method))request.GET();
        else request.header("Content-Type","application/json").POST(HttpRequest.BodyPublishers.ofString(json.writeValueAsString(payload)));
        var response=http.send(request.build(),HttpResponse.BodyHandlers.ofString());
        if(response.statusCode()!=200&&response.statusCode()!=202) {
            String code="UPSTREAM_HTTP_ERROR";
            if(response.statusCode()==403)code="INTERNAL_KEY_REJECTED";
            else if(response.statusCode()==404)code="UPSTREAM_JOB_NOT_FOUND";
            else if(response.statusCode()==503) {
                code="UPSTREAM_UNAVAILABLE";
                try {
                    String detail=json.readTree(response.body()).path("detail").asText();
                    if("AI_INTERNAL_KEY must be configured before generation".equals(detail))code="AI_INTERNAL_KEY_MISSING";
                    else if("AI job registry is full; reconcile retained jobs first".equals(detail))code="UPSTREAM_REGISTRY_FULL";
                } catch(Exception ignored) { /* Untrusted response is not logged or exposed. */ }
            }
            log.warn("AI job transport rejected status={} code={} operation={}",response.statusCode(),code,
                "GET".equals(method)?"poll":path.endsWith("/cancel")?"cancel":"start");
            throw new ProviderException(response.statusCode(),code);
        }
        return json.readTree(response.body());
    }
    public void start(UUID token,AiGenerateRequest request)throws Exception {call("POST","/credits/jobs/"+token,request);}
    public JsonNode status(UUID token)throws Exception {return call("GET","/credits/jobs/"+token,null);}
    public void cancel(UUID token)throws Exception {call("POST","/credits/jobs/"+token+"/cancel",Map.of());}
    public List<AiQuestionDto> questions(JsonNode status)throws Exception {
        return Arrays.asList(json.treeToValue(status.path("questions"),AiQuestionDto[].class));
    }
    @SuppressWarnings("unchecked")
    public Map<String,Object> extract(MultipartFile[] files)throws Exception {
        if(files==null||files.length<1||files.length>5)
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"Chọn từ 1 đến 5 tài liệu.");
        var parts=new LinkedMultiValueMap<String,Object>();
        for(var file:files){
            if(file==null||file.isEmpty()||file.getOriginalFilename()==null||file.getOriginalFilename().isBlank())
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"Tài liệu phải có tên file và nội dung.");
            if(file.getSize()>20L*1024*1024)
                throw new ResponseStatusException(HttpStatus.PAYLOAD_TOO_LARGE,"Mỗi tài liệu tối đa 20 MB.");
            parts.add("files",new ByteArrayResource(file.getBytes()){
                @Override public String getFilename(){return Objects.toString(file.getOriginalFilename(),"document");}
            });
        }
        try {
            String response=extractionHttp.post().uri(url.replaceAll("/+$","")+"/extract")
                .contentType(MediaType.MULTIPART_FORM_DATA).body(parts).retrieve().body(String.class);
            return json.readValue(response,Map.class);
        } catch(RestClientResponseException error) {
            int status=error.getStatusCode().value();
            String category="upstream_error";
            String message="Dịch vụ trích xuất tài liệu gặp lỗi. Vui lòng thử lại.";
            if(status==422) {
                category="invalid_document";
                message="Không đọc được tài liệu. Vui lòng kiểm tra file PDF/DOCX/TXT.";
                try {
                    var detail=json.readTree(error.getResponseBodyAsString()).path("detail");
                    if(detail.isArray()) {
                        category="multipart_validation";
                        message="Dữ liệu upload không hợp lệ. Cần gửi file trong trường files.";
                        // Log only validation metadata; never input, filename, document bytes or secrets.
                        for(var item:detail)log.warn("AI extract validation type={} loc={}",
                            safeValidation(item.path("type").asText()),safeValidation(item.path("loc").toString()));
                    } else if(detail.isTextual()&&detail.asText().contains("PDF scan cần OCR")) {
                        category="pdf_without_text";
                        message="PDF không có văn bản có thể trích xuất. Vui lòng dùng PDF có lớp văn bản hoặc thực hiện OCR trước khi tải lên.";
                    } else if(detail.isTextual()&&detail.asText().startsWith("Không đọc được")) {
                        category="document_parse_error";
                    }
                } catch(Exception ignored) { /* Never expose an untrusted upstream response body. */ }
            } else if(status==400) {
                category="unsupported_document";
                message="Tài liệu không hợp lệ hoặc không được hỗ trợ. Chỉ dùng PDF/DOCX/TXT, từ 1 đến 5 file.";
            } else if(status==413) {
                category="document_too_large";message="Mỗi tài liệu tối đa 20 MB.";
            }
            log.warn("AI extract rejected status={} category={}",status,category);
            var mapped=status==400||status==413||status==422?HttpStatus.valueOf(status):HttpStatus.BAD_GATEWAY;
            throw new ResponseStatusException(mapped,message);
        } catch(ResourceAccessException error) {
            Throwable cause=error;
            while(cause.getCause()!=null&&cause.getCause()!=cause)cause=cause.getCause();
            log.warn("AI extract unavailable type={} cause={}",error.getClass().getSimpleName(),cause.getClass().getSimpleName());
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY,"Không kết nối được dịch vụ trích xuất tài liệu. Vui lòng thử lại.");
        }
    }
    private static String safeValidation(String value) {
        String safe=value.replaceAll("[^a-zA-Z0-9_\\[\\],\" ]","?");
        return safe.substring(0,Math.min(120,safe.length()));
    }
}
