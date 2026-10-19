package com.examflow.backend.service;

import com.examflow.backend.exception.ApiException;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import tools.jackson.databind.json.JsonMapper;
import java.net.URI;
import java.net.http.*;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.UUID;
import java.nio.ByteBuffer;
import java.util.List;
import java.util.concurrent.CompletionStage;
import java.util.concurrent.Flow;

/** Server-only private profile storage. Never accepts a client-supplied object key. */
@Service
public class SupabaseStudentPhotoStorage {
    public static final int MAX_BYTES = 5 * 1024 * 1024;
    private final String base, secret, bucket;
    private final HttpClient client;
    private final JsonMapper mapper = JsonMapper.builder().build();

    @org.springframework.beans.factory.annotation.Autowired
    public SupabaseStudentPhotoStorage(@Value("${SUPABASE_URL:}") String base,
            @Value("${SUPABASE_SECRET_KEY:${SUPABASE_SERVICE_ROLE_KEY:}}") String secret,
            @Value("${SUPABASE_STUDENT_PHOTOS_BUCKET:student-photos}") String bucket) {
        this(base, secret, bucket, HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(3))
                .followRedirects(HttpClient.Redirect.NEVER).build());
    }
    SupabaseStudentPhotoStorage(String base, String secret, String bucket, HttpClient client) {
        this.base = base.replaceAll("/+$", ""); this.secret = secret; this.bucket = bucket; this.client = client;
    }
    public String bucket() { return bucket; }
    public String newKey(Long studentId) { return "student-" + studentId + "/" + UUID.randomUUID() + ".jpg"; }
    void validate(Long studentId, String storedBucket, String objectKey) {
        String prefix = "student-" + studentId + "/";
        if (studentId == null || studentId <= 0 || !bucket.equals(storedBucket) || objectKey == null
                || !objectKey.startsWith(prefix) || !objectKey.substring(prefix.length()).matches("[0-9a-fA-F-]{36}\\.jpg"))
            throw new ApiException(HttpStatus.FORBIDDEN, "Ảnh hồ sơ không thuộc sinh viên này");
        try { UUID.fromString(objectKey.substring(prefix.length(), objectKey.length() - 4)); }
        catch (IllegalArgumentException ex) { throw new ApiException(HttpStatus.FORBIDDEN, "Khóa ảnh hồ sơ không hợp lệ"); }
    }
    private void configured() {
        try {
            URI uri = URI.create(base);
            if (!"https".equals(uri.getScheme()) || uri.getHost() == null || uri.getUserInfo() != null
                    || uri.getQuery() != null || uri.getFragment() != null || !uri.getPath().isEmpty()
                    || secret.isBlank() || !bucket.matches("[a-z0-9_-]+")) throw new IllegalArgumentException();
        } catch (IllegalArgumentException ex) {
            throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE, "Chưa cấu hình Supabase Storage cho ảnh hồ sơ");
        }
    }
    private void requirePrivate() {
        configured();
        byte[] bytes = request("GET", "/storage/v1/bucket/" + bucket, null, "application/json");
        try {
            var data = mapper.readTree(bytes);
            if (!data.path("public").isBoolean() || data.path("public").asBoolean())
                throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE, "Bucket ảnh hồ sơ phải đặt PRIVATE");
        } catch (ApiException ex) { throw ex; }
        catch (Exception ex) { throw new ApiException(HttpStatus.BAD_GATEWAY, "Không kiểm tra được bucket ảnh hồ sơ"); }
    }
    public void upload(Long studentId, String objectKey, byte[] jpeg) {
        validate(studentId, bucket, objectKey);
        if (jpeg.length == 0 || jpeg.length > MAX_BYTES)
            throw new ApiException(HttpStatus.BAD_REQUEST, "Ảnh đã xử lý vượt giới hạn 5MB");
        requirePrivate();
        // Each replacement gets a new UUID: a failed request cannot overwrite the previous photo.
        request("POST", "/storage/v1/object/" + bucket + "/" + objectKey, jpeg, "image/jpeg");
    }
    public byte[] download(Long studentId, String storedBucket, String objectKey) {
        validate(studentId, storedBucket, objectKey);
        requirePrivate();
        byte[] jpeg = request("GET", "/storage/v1/object/authenticated/" + bucket + "/" + objectKey, null, "application/json");
        if (jpeg.length < 3 || (jpeg[0] & 255) != 255 || (jpeg[1] & 255) != 216 || (jpeg[2] & 255) != 255)
            throw new ApiException(HttpStatus.BAD_GATEWAY, "Ảnh hồ sơ trên Storage không hợp lệ");
        return jpeg;
    }
    public void delete(Long studentId, String storedBucket, String objectKey) {
        validate(studentId, storedBucket, objectKey); configured();
        byte[] body = ("{\"prefixes\":[\"" + objectKey + "\"]}").getBytes(StandardCharsets.UTF_8);
        request("DELETE", "/storage/v1/object/" + bucket, body, "application/json");
    }
    private byte[] request(String method, String path, byte[] body, String contentType) {
        try {
            var builder = HttpRequest.newBuilder(URI.create(base + path)).timeout(Duration.ofSeconds(8))
                    .header("apikey", secret).header("Content-Type", contentType);
            if (secret.split("\\.").length == 3) builder.header("Authorization", "Bearer " + secret);
            builder.method(method, body == null ? HttpRequest.BodyPublishers.noBody() : HttpRequest.BodyPublishers.ofByteArray(body));
            var response = client.send(builder.build(), info -> new LimitedBody());
            if (response.statusCode() < 200 || response.statusCode() >= 300) {
                String code = "";
                try { code = mapper.readTree(response.body()).path("statusCode").asString(""); } catch (Exception ignored) {}
                if (response.statusCode() == 404 || "404".equals(code))
                    throw new ApiException(HttpStatus.NOT_FOUND, "Không tìm thấy bucket hoặc ảnh hồ sơ trên Storage");
                throw new ApiException(HttpStatus.BAD_GATEWAY, "Storage từ chối xử lý ảnh hồ sơ. Vui lòng thử lại.");
            }
            if (response.body().length > MAX_BYTES) throw new ApiException(HttpStatus.BAD_GATEWAY, "Ảnh hồ sơ vượt giới hạn dung lượng");
            return response.body();
        } catch (ApiException ex) { throw ex; }
        catch (InterruptedException ex) { Thread.currentThread().interrupt(); throw new ApiException(HttpStatus.BAD_GATEWAY, "Yêu cầu ảnh hồ sơ bị gián đoạn"); }
        catch (Exception ex) { throw new ApiException(HttpStatus.BAD_GATEWAY, "Không kết nối được Storage ảnh hồ sơ. Vui lòng thử lại."); }
    }

    /** Stop oversized responses while receiving, before they can consume unbounded heap. */
    static final class LimitedBody implements HttpResponse.BodySubscriber<byte[]> {
        private final HttpResponse.BodySubscriber<byte[]> delegate = HttpResponse.BodySubscribers.ofByteArray();
        private Flow.Subscription subscription;
        private long received;
        private boolean failed;
        public CompletionStage<byte[]> getBody() { return delegate.getBody(); }
        public void onSubscribe(Flow.Subscription value) { subscription = value; delegate.onSubscribe(value); }
        public void onNext(List<ByteBuffer> buffers) {
            if (failed) return;
            for (ByteBuffer buffer : buffers) received += buffer.remaining();
            if (received > MAX_BYTES) {
                failed = true; subscription.cancel();
                delegate.onError(new java.io.IOException("Photo response exceeds size limit"));
            } else delegate.onNext(buffers);
        }
        public void onError(Throwable error) { delegate.onError(error); }
        public void onComplete() { if (!failed) delegate.onComplete(); }
    }
}
