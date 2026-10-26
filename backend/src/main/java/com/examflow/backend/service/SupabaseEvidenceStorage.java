package com.examflow.backend.service;

import com.examflow.backend.exception.ApiException;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import tools.jackson.databind.json.JsonMapper;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.*;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.util.Map;

@Service
public class SupabaseEvidenceStorage {
    private final String base, key, bucket;
    private final HttpClient client;
    private final JsonMapper mapper = JsonMapper.builder().build();
    public record SignedLink(String url, Instant expiresAt, String provider) {}
    @org.springframework.beans.factory.annotation.Autowired
    public SupabaseEvidenceStorage(@Value("${SUPABASE_URL:}") String base,
            @Value("${SUPABASE_SECRET_KEY:${SUPABASE_SERVICE_ROLE_KEY:}}") String key,
            @Value("${SUPABASE_STORAGE_BUCKET:exam-evidence}") String bucket) {
        this(base,key,bucket,HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(3)).followRedirects(HttpClient.Redirect.NEVER).build());
    }
    SupabaseEvidenceStorage(String base, String key, String bucket, HttpClient client) {
        this.base = base.replaceAll("/+$", ""); this.key = key; this.bucket = bucket; this.client = client;
    }
    public String bucket() { return bucket; }
    public void uploadOffline(long attempt,String capture,byte[] jpeg){
        String object="attempt-"+attempt+"/"+java.util.UUID.fromString(capture)+".jpg";
        validateObject(attempt,bucket,object);
        authenticated("/storage/v1/bucket/"+encode(bucket));
        try{
            var info=send("/storage/v1/bucket/"+encode(bucket),null);
            if(!info.path("public").isBoolean()||info.path("public").asBoolean())throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE,"Bucket bằng chứng phải PRIVATE");
            var request=authenticated("/storage/v1/object/"+encode(bucket)+"/"+encodePath(object)).header("Content-Type","image/jpeg").header("x-upsert","true")
                .POST(HttpRequest.BodyPublishers.ofByteArray(jpeg)).build();
            var response=client.send(request,HttpResponse.BodyHandlers.discarding());
            if(response.statusCode()<200||response.statusCode()>=300)throw new IllegalStateException();
        }catch(InterruptedException ex){Thread.currentThread().interrupt();throw new ApiException(HttpStatus.BAD_GATEWAY,"Gửi ảnh bị gián đoạn, bản trên máy vẫn được giữ.");}
        catch(ApiException ex){throw ex;}
        catch(Exception ex){throw new ApiException(HttpStatus.BAD_GATEWAY,"Chưa lưu được ảnh trên máy chủ, vui lòng thử lại.");}
    }
    public byte[] readOffline(long attempt,String capture){
        String object="attempt-"+attempt+"/"+java.util.UUID.fromString(capture)+".jpg";validateObject(attempt,bucket,object);
        try{
            var response=client.send(authenticated("/storage/v1/object/"+encode(bucket)+"/"+encodePath(object)).GET().build(),HttpResponse.BodyHandlers.ofInputStream());
            try(var body=response.body()){
                byte[] bytes=body.readNBytes(250001);
                if(response.statusCode()!=200||bytes.length>250000)throw new IllegalStateException();
                return bytes;
            }
        }catch(InterruptedException ex){Thread.currentThread().interrupt();throw new IllegalStateException("OFFLINE_IMAGE_UNAVAILABLE");}
        catch(Exception ex){throw new IllegalStateException("OFFLINE_IMAGE_UNAVAILABLE");}
    }
    private HttpRequest.Builder authenticated(String path){
        URI origin;
        try{origin=URI.create(base);if(!"https".equals(origin.getScheme())||origin.getHost()==null||origin.getUserInfo()!=null||origin.getQuery()!=null||origin.getFragment()!=null||!origin.getPath().isEmpty()||key.isBlank())throw new IllegalArgumentException();}
        catch(Exception ex){throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE,"Cấu hình Storage không hợp lệ");}
        var request=HttpRequest.newBuilder(URI.create(base+path)).timeout(Duration.ofSeconds(8)).header("apikey",key);
        if(key.split("\\.").length==3)request.header("Authorization","Bearer "+key);
        return request;
    }
    public SignedLink sign(Long attemptId, String storedBucket, String objectKey) {
        validateObject(attemptId,storedBucket,objectKey);
        if (base.isBlank() || key.isBlank()) throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE,"Máy chủ chưa cấu hình Supabase Storage");
        URI origin;
        try {
            origin = URI.create(base);
            if (!"https".equals(origin.getScheme()) || origin.getHost() == null || origin.getUserInfo() != null
                    || origin.getQuery() != null || origin.getFragment() != null || !origin.getPath().isEmpty()) throw new IllegalArgumentException();
        } catch (IllegalArgumentException ex) { throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE,"Cấu hình địa chỉ Storage không hợp lệ"); }
        try {
            // Validate the private bucket without changing its policies.
            var bucketResponse = send("/storage/v1/bucket/" + encode(bucket), null);
            if (!bucketResponse.path("public").isBoolean() || bucketResponse.path("public").asBoolean())
                throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE,"Bucket bằng chứng phải được đặt PRIVATE");
            Instant expiresAt = Instant.now().plusSeconds(180);
            var result = send("/storage/v1/object/sign/" + encode(bucket) + "/" + encodePath(objectKey), "{\"expiresIn\":180}");
            String relative = result.path("signedURL").asString("");
            if (!relative.startsWith("/object/sign/")) throw new ApiException(HttpStatus.BAD_GATEWAY,"Storage trả về liên kết không hợp lệ");
            URI signed = URI.create(base + "/storage/v1" + relative);
            if (!origin.getHost().equals(signed.getHost()) || !origin.getScheme().equals(signed.getScheme())) throw new IllegalArgumentException();
            return new SignedLink(signed.toString(),expiresAt,"supabase");
        } catch (ApiException ex) { throw ex; }
        catch (InterruptedException ex) { Thread.currentThread().interrupt(); throw new ApiException(HttpStatus.BAD_GATEWAY,"Yêu cầu Storage bị gián đoạn"); }
        catch (Exception ex) { throw new ApiException(HttpStatus.BAD_GATEWAY,"Chưa kết nối được Storage. Vui lòng thử lại."); }
    }
    void validateObject(Long attemptId, String storedBucket, String objectKey) {
        String prefix = "attempt-" + attemptId + "/";
        if (!bucket.equals(storedBucket) || objectKey == null || !objectKey.startsWith(prefix)
                || !objectKey.substring(prefix.length()).matches("[0-9a-fA-F-]{36}\\.jpg"))
            throw new ApiException(HttpStatus.FORBIDDEN,"Ảnh không thuộc lượt thi hoặc bucket bằng chứng đã cấu hình");
        try { java.util.UUID.fromString(objectKey.substring(prefix.length(),objectKey.length()-4)); }
        catch (IllegalArgumentException ex) { throw new ApiException(HttpStatus.FORBIDDEN,"Khóa ảnh bằng chứng không hợp lệ"); }
    }
    private tools.jackson.databind.JsonNode send(String path, String body) throws Exception {
        var request = HttpRequest.newBuilder(URI.create(base + path)).timeout(Duration.ofSeconds(8)).header("apikey",key).header("Content-Type","application/json");
        if (key.split("\\.").length == 3) request.header("Authorization","Bearer " + key);
        if (body == null) request.GET(); else request.POST(HttpRequest.BodyPublishers.ofString(body));
        var response = client.send(request.build(),HttpResponse.BodyHandlers.ofString());
        if (response.statusCode() < 200 || response.statusCode() >= 300) {
            // Storage may encode missing objects as HTTP 400. Inspect only the code,
            // never include its response body or URL in application errors/logs.
            String code = "";
            try { code = mapper.readTree(response.body()).path("statusCode").asString(""); } catch (Exception ignored) {}
            if (response.statusCode() == 404 || code.equals("404")) throw new ApiException(HttpStatus.NOT_FOUND,"Không tìm thấy ảnh bằng chứng trên Storage");
            throw new ApiException(HttpStatus.BAD_GATEWAY,"Không thể lấy bằng chứng từ Storage");
        }
        return mapper.readTree(response.body());
    }
    private static String encode(String text) { return URLEncoder.encode(text,StandardCharsets.UTF_8).replace("+","%20"); }
    private static String encodePath(String path) { return java.util.Arrays.stream(path.split("/")).map(SupabaseEvidenceStorage::encode).collect(java.util.stream.Collectors.joining("/")); }
}
