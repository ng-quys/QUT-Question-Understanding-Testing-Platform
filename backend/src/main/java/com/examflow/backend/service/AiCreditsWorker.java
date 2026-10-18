package com.examflow.backend.service;

import jakarta.annotation.*;
import org.springframework.stereotype.Service;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import java.time.Instant;
import java.time.Clock;
import java.sql.Timestamp;
import java.util.*;
import java.util.concurrent.*;

@Service
public class AiCreditsWorker {
    private static final Logger log=LoggerFactory.getLogger(AiCreditsWorker.class);
    @org.springframework.beans.factory.annotation.Value("${ai.credits.job-timeout-minutes:120}") private long timeoutMinutes;
    private final AiCreditsService credits;
    private final AiCreditsProvider provider;
    private final AiGenerationService legacy;
    private final ScheduledExecutorService timer=Executors.newSingleThreadScheduledExecutor(r->{var t=new Thread(r,"ai-credit-poller");t.setDaemon(true);return t;});
    private final ExecutorService openai=Executors.newFixedThreadPool(2,r->{var t=new Thread(r,"ai-credit-openai");t.setDaemon(true);return t;});
    private final Map<Long,Future<?>> local=new ConcurrentHashMap<>();
    private Clock clock=Clock.systemUTC();
    private static final int MAX_POLL_FAILURES=5;
    private static class PollState {
        final UUID token;
        int failures;
        Instant next=Instant.MIN;
        boolean stopped;
        boolean cancelSent;
        PollState(UUID token){this.token=token;}
    }
    private final Map<Long,PollState> polling=new ConcurrentHashMap<>();
    public AiCreditsWorker(AiCreditsService credits,AiCreditsProvider provider,AiGenerationService legacy){
        this.credits=credits;this.provider=provider;this.legacy=legacy;
    }
    @PostConstruct void start(){
        timer.scheduleWithFixedDelay(this::tick,5,3,TimeUnit.SECONDS);
    }
    @PreDestroy void close(){timer.shutdownNow();openai.shutdownNow();}
    void tick(){
        if(!credits.enabled())return;
        try{
            credits.allocateCurrentMonth();
            var active=credits.active();
            var activeIds=new HashSet<Long>();
            for(var row:active)activeIds.add(((Number)row.get("id")).longValue());
            polling.keySet().retainAll(activeIds);
            for(var row:active){
                long id=((Number)row.get("id")).longValue();
                UUID token=(UUID)row.get("execution_token");
                // Unknown jobs require explicit Admin reconciliation, never blind polling/cancel.
                if("unknown".equals(row.get("credit_state")))continue;
                var poll=polling.compute(id,(ignored,old)->old==null||!old.token.equals(token)?new PollState(token):old);
                if(poll.stopped||clock.instant().isBefore(poll.next))continue;
                try{
                    var dispatched=(Timestamp)row.get("dispatched_at");
                    if(dispatched!=null && dispatched.toInstant().isBefore(Instant.now().minusSeconds(Math.max(1,timeoutMinutes)*60))
                        && row.get("cancel_requested_at")==null){
                        credits.cancel(((Number)row.get("requested_by")).longValue(),id);
                        row=credits.raw(id);
                    }
                    var request=credits.payload(row);
                    if("reserved".equals(row.get("credit_state"))){
                        if(!credits.claim(id))continue;
                        if("qwen".equals(request.provider()))provider.start(token,request);
                        else {
                            local.put(id,openai.submit(()->{
                                try{credits.finish(id,token,legacy.generate(request,()->{var current=credits.raw(id);return current.get("cancel_requested_at")!=null||AiCreditsService.terminal(current);}),false,null,null);}
                                catch(Exception e){credits.unknown(id,token,"OpenAI cần đối soát sau lỗi/timeout.");}
                            }));
                        }
                    } else if("qwen".equals(request.provider())){
                        var remote=provider.status(token);
                        var questions=provider.questions(remote);
                        if(List.of("succeeded","failed","cancelled").contains(remote.path("status").asText())){
                            credits.finish(id,token,questions,"cancelled".equals(remote.path("status").asText()),null,
                                remote.path("error").isNull()?null:remote.path("error").asText(null));
                        }else {
                            if(row.get("cancel_requested_at")!=null&&!poll.cancelSent){
                                // GET first: an absent/terminal token must never receive repeated cancel.
                                if(!remote.path("cancelRequested").asBoolean(false))provider.cancel(token);
                                poll.cancelSent=true;
                            }
                            credits.checkpoint(id,token,questions);
                        }
                    }else{
                        var future=local.get(id);
                        if(future!=null&&!future.isDone())credits.checkpoint(id,token,credits.results(row));
                        else if(future==null)credits.unknown(id,token,"BE đã khởi động lại; cần xác minh OpenAI cũ đã dừng.");
                    }
                    poll.failures=0;poll.next=Instant.MIN;
                }catch(Exception e){
                    var lease=(Timestamp)row.get("lease_expires_at");
                    poll.failures++;
                    poll.next=clock.instant().plusSeconds(Math.min(60,5L << Math.min(poll.failures-1,4)));
                    boolean permanent=e instanceof AiCreditsProvider.ProviderException upstream
                        && (upstream.status()==404||upstream.status()==403||upstream.code().equals("BE_INTERNAL_KEY_MISSING")
                            ||upstream.code().equals("AI_INTERNAL_KEY_MISSING"));
                    // A failed start can have reached upstream: never automatically replay it.
                    if("reserved".equals(row.get("credit_state"))||permanent||poll.failures>=MAX_POLL_FAILURES
                        ||lease==null||lease.toInstant().isBefore(clock.instant())) {
                        poll.stopped=true;
                        credits.unknown(id,token,"Không xác minh được tác vụ AI; giữ chỗ để đối soát.");
                    }
                    if(e instanceof AiCreditsProvider.ProviderException upstream)
                        log.warn("AI credit job {} transport/checkpoint failed: status={} code={}; reservation retained, no replay",id,upstream.status(),upstream.code());
                    else log.warn("AI credit job {} transport/checkpoint failed: {}",id,e.getClass().getSimpleName());
                }
            }
            local.entrySet().removeIf(e->e.getValue().isDone());
        }catch(Exception e){log.warn("AI credit poller unavailable: {}",e.getClass().getSimpleName());}
    }
    public Map<String,Object> reconcile(long admin,long id,boolean stopped,String reason){
        credits.requireEnabled();
        if(!stopped||reason==null||reason.isBlank()||reason.length()>1000)
            throw new org.springframework.web.server.ResponseStatusException(org.springframework.http.HttpStatus.BAD_REQUEST,"Cần xác nhận tác vụ cũ đã dừng và lý do đối soát.");
        var row=credits.raw(id);
        if(AiCreditsService.terminal(row))return credits.job(((Number)row.get("requested_by")).longValue(),id);
        if(!"unknown".equals(row.get("credit_state")))
            throw new org.springframework.web.server.ResponseStatusException(org.springframework.http.HttpStatus.CONFLICT,"Chỉ đối soát job unknown.");
        if("qwen".equals(credits.payload(row).provider())){
            com.fasterxml.jackson.databind.JsonNode remote=null;
            try{remote=provider.status((UUID)row.get("execution_token"));}
            catch(Exception e){/* Admin must attest that the unreachable old worker was stopped. */}
            if(remote!=null){
                if("running".equals(remote.path("status").asText()))
                    throw new org.springframework.web.server.ResponseStatusException(org.springframework.http.HttpStatus.CONFLICT,"AI Service vẫn báo job đang chạy; yêu cầu hủy và chờ dừng.");
                if(List.of("succeeded","failed","cancelled").contains(remote.path("status").asText())){
                    java.util.List<com.examflow.backend.dto.AiQuestionDto> questions;
                    try{questions=provider.questions(remote);}
                    catch(Exception e){throw new org.springframework.web.server.ResponseStatusException(org.springframework.http.HttpStatus.BAD_GATEWAY,"Kết quả upstream chưa đọc được để đối soát.");}
                    credits.finish(id,(UUID)row.get("execution_token"),questions,
                        "cancelled".equals(remote.path("status").asText()),admin,reason.strip());
                    return credits.job(((Number)row.get("requested_by")).longValue(),id);
                }
            }
        }else if(local.containsKey(id)&&!local.get(id).isDone())
            throw new org.springframework.web.server.ResponseStatusException(org.springframework.http.HttpStatus.CONFLICT,"Worker vẫn đang chạy.");
        return credits.reconcile(admin,id,stopped,reason);
    }
}
