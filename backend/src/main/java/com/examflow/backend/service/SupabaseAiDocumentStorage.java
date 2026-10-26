package com.examflow.backend.service;

import com.examflow.backend.exception.ApiException;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import java.net.*;
import java.net.http.*;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.Arrays;
import java.util.stream.Collectors;
import tools.jackson.databind.json.JsonMapper;

/** Server-only adapter for the dedicated private AI source-document bucket. */
@Service
public class SupabaseAiDocumentStorage {
    private final String base,key,bucket;
    private final HttpClient client;
    private final JsonMapper json=JsonMapper.builder().build();
    @org.springframework.beans.factory.annotation.Autowired
    public SupabaseAiDocumentStorage(@Value("${SUPABASE_URL:}") String base,
            @Value("${SUPABASE_SECRET_KEY:${SUPABASE_SERVICE_ROLE_KEY:}}") String key,
            @Value("${SUPABASE_AI_DOCUMENTS_BUCKET:ai-source-documents}") String bucket) {
        this(base,key,bucket,HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build());
    }
    SupabaseAiDocumentStorage(String base,String key,String bucket,HttpClient client) {
        this.base=base.replaceAll("/+$","");this.key=key;this.bucket=bucket;this.client=client;
    }
    public String bucket(){return bucket;}
    public void put(String objectKey,byte[] bytes,String mime) {
        configured();
        try {
            var bucketRequest=request("/storage/v1/bucket/"+encode(bucket)).GET().build();
            var bucketResult=client.send(bucketRequest,HttpResponse.BodyHandlers.ofString());
            boolean publicBucket=bucketResult.statusCode()==200&&json.readTree(bucketResult.body()).path("public").asBoolean(true);
            if(bucketResult.statusCode()!=200 || publicBucket)
                throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE,"Bucket tài liệu AI phải tồn tại và ở chế độ private.");
            var upload=request("/storage/v1/object/"+encode(bucket)+"/"+encodePath(objectKey))
                .header("Content-Type",mime).header("x-upsert","false")
                .POST(HttpRequest.BodyPublishers.ofByteArray(bytes)).build();
            var result=client.send(upload,HttpResponse.BodyHandlers.discarding());
            if(result.statusCode()<200||result.statusCode()>=300)
                throw new ApiException(HttpStatus.BAD_GATEWAY,"Không lưu được tài liệu vào private Storage.");
        } catch(ApiException e){throw e;}
        catch(InterruptedException e){Thread.currentThread().interrupt();throw new ApiException(HttpStatus.BAD_GATEWAY,"Upload tài liệu bị gián đoạn.");}
        catch(Exception e){throw new ApiException(HttpStatus.BAD_GATEWAY,"Không kết nối được private Storage.");}
    }
    private HttpRequest.Builder request(String path){
        var builder=HttpRequest.newBuilder(URI.create(base+path)).timeout(Duration.ofSeconds(30)).header("apikey",key);
        if(key.split("\\.").length==3)builder.header("Authorization","Bearer "+key);
        return builder;
    }
    private void configured(){
        if(base.isBlank()||key.isBlank()||bucket.isBlank())throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE,"Chưa cấu hình private Storage cho tài liệu AI.");
        URI uri;
        try{uri=URI.create(base);}catch(Exception e){throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE,"SUPABASE_URL không hợp lệ.");}
        if(!"https".equals(uri.getScheme())||uri.getHost()==null||uri.getUserInfo()!=null||uri.getQuery()!=null)
            throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE,"SUPABASE_URL không hợp lệ.");
    }
    private static String encode(String value){return URLEncoder.encode(value,StandardCharsets.UTF_8).replace("+","%20");}
    private static String encodePath(String value){return Arrays.stream(value.split("/")).map(SupabaseAiDocumentStorage::encode).collect(Collectors.joining("/"));}
}
