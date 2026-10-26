package com.examflow.backend.service;

import com.examflow.backend.entity.ExamAttempt;
import com.examflow.backend.exception.ApiException;
import com.examflow.backend.repository.ExamAttemptRepository;
import jakarta.annotation.PreDestroy;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;
import java.net.URI;
import java.net.http.*;
import java.time.*;
import java.util.*;
import java.util.concurrent.*;

/** Registration, model loading and Storage reads never block opening an exam. */
@Service
public class BatchMonitoringService {
    private final ExamAttemptRepository attempts;
    private final StudentProfileService photos;
    private final HttpClient client;
    private final JsonMapper json = JsonMapper.builder().build();
    private final String url, secret;
    private final ThreadPoolExecutor executor = new ThreadPoolExecutor(2,2,0,TimeUnit.SECONDS,
            new ArrayBlockingQueue<>(300),r->{Thread t=new Thread(r,"qut-monitoring-control");t.setDaemon(true);return t;},new ThreadPoolExecutor.AbortPolicy());
    private static final ZoneId ZONE=ZoneId.of("Asia/Ho_Chi_Minh");
    private static class Registration {volatile boolean pending,cancelled;volatile int tries;volatile long next;long expires;}
    private final ConcurrentMap<Long,Registration> registrations=new ConcurrentHashMap<>();
    @org.springframework.beans.factory.annotation.Autowired
    public BatchMonitoringService(ExamAttemptRepository attempts,StudentProfileService photos,
            @Value("${app.anticheat.url:http://127.0.0.1:8000}") String url,
            @Value("${app.anticheat.secret:change-me}") String secret){this(attempts,photos,url,secret,HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(2)).build());}
    BatchMonitoringService(ExamAttemptRepository attempts,StudentProfileService photos,String url,String secret,HttpClient client){this.attempts=attempts;this.photos=photos;this.url=url.replaceAll("/$","");this.secret=secret;this.client=client;}
    @PreDestroy public void close(){executor.shutdownNow();}
    static LocalDateTime now(){return LocalDateTime.now(ZONE);}
    static boolean active(ExamAttempt a){return "in_progress".equals(a.getStatus())&&a.getExamSession()!=null&&
            !Boolean.FALSE.equals(a.getExamSession().getAiEnabled())&&
            SessionTiming.deadline(a).isAfter(now())&&
            !Set.of("cancelled","completed").contains(a.getExamSession().getStatus());}
    private ExamAttempt owned(long attempt,long student){return attempts.findOwnedAttempt(attempt,student).orElseThrow(()->new ApiException(HttpStatus.NOT_FOUND,"Không tìm thấy bài làm"));}
    private ExamAttempt activeOwned(long attempt,long student){ExamAttempt a=owned(attempt,student);if(!active(a))throw new ApiException(HttpStatus.CONFLICT,"Bài thi không còn nhận dữ liệu giám sát");return a;}
    private void afterCommit(Runnable task){
        if(TransactionSynchronizationManager.isSynchronizationActive())TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization(){@Override public void afterCommit(){task.run();}});
        else task.run();
    }
    public void queue(long attempt,long student){afterCommit(()->schedule(attempt,student,true));}
    private synchronized void schedule(long attempt,long student,boolean manual){
        long clock=System.currentTimeMillis();registrations.entrySet().removeIf(e->!e.getValue().pending&&e.getValue().expires<clock);
        if(!registrations.containsKey(attempt)&&registrations.size()>=2000)return;
        Registration state=registrations.computeIfAbsent(attempt,id->{Registration r=new Registration();r.expires=clock+86400000;return r;});
        if(state.cancelled&&manual){registrations.remove(attempt,state);schedule(attempt,student,true);return;}
        if(state.pending||state.cancelled||(!manual&&(state.tries>=3||clock<state.next)))return;
        if(manual)state.tries=0;
        state.pending=true;state.tries++;state.next=clock+Math.min(30000,2000L*(1L<<state.tries));
        try{executor.execute(()->{
            try{
                ExamAttempt a=activeOwned(attempt,student);
                byte[] reference=photos.getFacePhotoForExam(student);
                if(state.cancelled)return;
                Map<String,Object> body=new HashMap<>();body.put("attemptId",attempt);body.put("studentId",student);body.put("roomId",a.getExamSession().getRoomId());
                body.put("remainingSeconds",Math.max(0,Duration.between(now(),SessionTiming.deadline(a)).toSeconds()));
                body.put("sessionEnd",a.getExamSession().getEndTime().atZone(ZONE).toInstant().toString());
                body.put("referencePhotoBase64",Base64.getEncoder().encodeToString(reference));
                post("register",body);
                if(state.cancelled||!active(owned(attempt,student)))post("stop",Map.of("attemptId",attempt));
            }catch(Exception error){/* status reports unavailable; no exam or camera thread is stopped */}
            finally{state.pending=false;}
        });}catch(RejectedExecutionException error){state.pending=false;}
    }
    public JsonNode status(long attempt,long student){
        ExamAttempt a=owned(attempt,student);
        if(!active(a))return json.valueToTree(Map.of("ready",false,"captureAllowed",false,"status","stopped","message","Bài thi đã kết thúc"));
        try{
            JsonNode result=post("status",Map.of("attemptId",attempt));
            if("unregistered".equals(result.path("status").asString()))schedule(attempt,student,false);
            return result;
        }catch(Exception error){schedule(attempt,student,false);return json.valueToTree(Map.of("ready",false,"captureAllowed",false,"status","offline","message","Chưa kết nối được dịch vụ giám sát"));}
    }
    public JsonNode verifyIdentity(String jpeg,byte[] reference){return post("verify-identity",Map.of("jpeg",jpeg,"referencePhotoBase64",Base64.getEncoder().encodeToString(reference)));}
    public record Frame(long lease,String jpeg,String audioPcm16){}
    public JsonNode frame(long attempt,long student,Frame frame){
        activeOwned(attempt,student);
        if(frame==null||frame.jpeg()==null||frame.jpeg().length()>334000||frame.jpeg().length()<8||frame.audioPcm16()==null||frame.audioPcm16().length()>43000)
            throw new ApiException(HttpStatus.BAD_REQUEST,"Dữ liệu camera/âm thanh vượt giới hạn");
        return post("frame",Map.of("attemptId",attempt,"lease",frame.lease(),"jpeg",frame.jpeg(),"audioPcm16",frame.audioPcm16()));
    }
    public void stop(long attempt){
        afterCommit(()->{
            Registration r=registrations.get(attempt);if(r!=null)r.cancelled=true;
            try{executor.execute(()->{try{post("stop",Map.of("attemptId",attempt));}catch(Exception ignored){}});}catch(RejectedExecutionException ignored){}
        });
    }
    public Map<Long,JsonNode> forAttempts(Collection<Long> ids){
        if(ids.isEmpty())return Map.of();
        try{
            Map<Long,JsonNode> filtered=new HashMap<>();
            for(JsonNode item:post("status",Map.of()).path("sessions")){
                long id=item.path("attemptId").asLong();if(ids.contains(id))filtered.put(id,item);
            }return filtered;
        }catch(Exception error){return Map.of();}
    }
    public JsonNode runtimeStatus(){return post("status",Map.of());}
    public JsonNode analyzeOffline(byte[] jpeg,byte[] reference){return post("offline-analysis",Map.of("jpeg",Base64.getEncoder().encodeToString(jpeg),"referencePhotoBase64",Base64.getEncoder().encodeToString(reference)));}
    private JsonNode post(String action,Object body){
        try{
            var request=HttpRequest.newBuilder(URI.create(url+"/monitoring/"+action)).timeout(Duration.ofSeconds(Set.of("verify-identity","offline-analysis").contains(action)?10:4))
                    .header("Content-Type","application/json").header("X-AntiCheat-Secret",secret).POST(HttpRequest.BodyPublishers.ofString(json.writeValueAsString(body))).build();
            var response=client.send(request,HttpResponse.BodyHandlers.ofString());
            if(response.statusCode()!=200)throw new IllegalStateException("Monitoring unavailable");
            return json.readTree(response.body());
        }catch(Exception error){if(error instanceof InterruptedException)Thread.currentThread().interrupt();throw new ApiException(HttpStatus.BAD_GATEWAY,"Không kết nối được giám sát AI; bài thi vẫn được lưu");}
    }
}
