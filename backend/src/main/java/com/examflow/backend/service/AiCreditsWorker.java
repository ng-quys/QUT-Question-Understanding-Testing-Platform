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
import com.examflow.backend.dto.AiQuestionDto;

@Service
public class AiCreditsWorker {
    private static final Logger log=LoggerFactory.getLogger(AiCreditsWorker.class);
    @org.springframework.beans.factory.annotation.Value("${ai.credits.job-timeout-minutes:120}") private long timeoutMinutes;
    // Operational switch, not a distributed lock. Disable on every secondary BE.
    @org.springframework.beans.factory.annotation.Value("${ai.credits.worker.enabled:true}") private boolean workerEnabled=true;
    private final String instance=ProcessHandle.current().pid()+"/"+UUID.randomUUID();
    private final AiCreditsService credits;
    private final AiCreditsProvider provider;
    private final AiGenerationService legacy;
    private final AiWorkerCoordinator coordination;
    private final ScheduledExecutorService timer=Executors.newSingleThreadScheduledExecutor(r->{var t=new Thread(r,"ai-credit-poller");t.setDaemon(true);return t;});
    private final ExecutorService openai=Executors.newFixedThreadPool(2,r->{var t=new Thread(r,"ai-credit-openai");t.setDaemon(true);return t;});
    private final Map<Long,Future<List<AiQuestionDto>>> local=new ConcurrentHashMap<>();
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
    public AiCreditsWorker(AiCreditsService credits,AiCreditsProvider provider,AiGenerationService legacy,AiWorkerCoordinator coordination){
        this.credits=credits;this.provider=provider;this.legacy=legacy;this.coordination=coordination;
    }
    @PostConstruct void start(){
        log.info("AI credit worker instance={} enabled={} clusterReady={}",instance,workerEnabled,coordination.isClusterReady());
        if(!workerEnabled)return;
        timer.scheduleWithFixedDelay(this::tick,5,3,TimeUnit.SECONDS);
    }
    @PreDestroy void close(){timer.shutdownNow();openai.shutdownNow();}
    void tick(){
        if(!workerEnabled||!credits.enabled()||!coordination.isClusterReady())return;
        try{
            coordination.requireReady();
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
                String registry="qwen".equals(credits.payload(row).provider())?provider.registryId():"openai:"+instance;
                if(!coordination.run(id,token,registry,current->process(current,id,token,registry)))
                    log.debug("AI credit job skipped without ownership instance={} job={} token={}",instance,id,token);
            }
            local.keySet().retainAll(activeIds);
        }catch(Exception e){log.warn("AI credit poller unavailable: {}",e.getClass().getSimpleName());}
    }
    private void process(Map<String,Object> row,long id,UUID token,String registry) {
                var poll=polling.compute(id,(ignored,old)->old==null||!old.token.equals(token)?new PollState(token):old);
                if(poll.stopped||clock.instant().isBefore(poll.next))return;
                try{
                    var dispatched=(Timestamp)row.get("dispatched_at");
                    if(dispatched!=null && dispatched.toInstant().isBefore(Instant.now().minusSeconds(Math.max(1,timeoutMinutes)*60))
                        && row.get("cancel_requested_at")==null){
                        credits.cancel(((Number)row.get("requested_by")).longValue(),id);
                        row=credits.raw(id);
                    }
                    var request=credits.payload(row);
                    if("reserved".equals(row.get("credit_state"))){
                        if(!credits.claim(id))return;
                        log.info("AI credit claim instance={} job={} token={}",instance,id,token);
                        if("qwen".equals(request.provider()))provider.start(token,request,registry);
                        else {
                            // Retain the result in the Future until the poller owns the DB lock.
                            // A callback must not lose a completed result merely because a tick holds it.
                            local.put(id,openai.submit(()->legacy.generate(request,()->{var current=credits.raw(id);return current.get("cancel_requested_at")!=null||AiCreditsService.terminal(current);})));
                        }
                    } else if("qwen".equals(request.provider())){
                        var remote=provider.status(token,registry);
                        var questions=provider.questions(remote);
                        if(List.of("succeeded","failed","cancelled").contains(remote.path("status").asText())){
                            log.info("AI credit terminal response instance={} job={} token={} upstream={}",instance,id,token,remote.path("status").asText());
                            credits.finishOwned(id,token,questions,"cancelled".equals(remote.path("status").asText()),null,
                                remote.path("error").isNull()?null:remote.path("error").asText(null));
                        }else {
                            if(row.get("cancel_requested_at")!=null&&!poll.cancelSent){
                                // GET first: an absent/terminal token must never receive repeated cancel.
                                if(!remote.path("cancelRequested").asBoolean(false))provider.cancel(token,registry);
                                poll.cancelSent=true;
                            }
                            credits.checkpointOwned(id,token,questions);
                        }
                    }else{
                        var future=local.get(id);
                        if(future!=null&&!future.isDone())credits.checkpointOwned(id,token,credits.results(row));
                        else if(future!=null)credits.finishOwned(id,token,future.get(),false,null,null);
                        else if(future==null)credits.unknownOwned(id,token,"BE đã khởi động lại; cần xác minh OpenAI cũ đã dừng.");
                    }
                    poll.failures=0;poll.next=Instant.MIN;
                }catch(Exception e){
                    if(e instanceof AiCreditsProvider.ProviderException upstream&&upstream.code().equals("UPSTREAM_REGISTRY_MISMATCH")) {
                        log.warn("AI registry changed; no job mutation instance={} job={} token={}",instance,id,token);
                        return;
                    }
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
                        log.warn("AI credit unknown requested instance={} job={} token={} previousState={} failures={}",instance,id,token,row.get("credit_state"),poll.failures);
                        credits.unknownOwned(id,token,"Không xác minh được tác vụ AI; giữ chỗ để đối soát.");
                    }
                    if(e instanceof AiCreditsProvider.ProviderException upstream)
                        log.warn("AI credit job {} transport/checkpoint failed: instance={} token={} status={} code={}; reservation retained, no replay",id,instance,token,upstream.status(),upstream.code());
                    else log.warn("AI credit job {} transport/checkpoint failed: instance={} token={} error={}",id,instance,token,e.getClass().getSimpleName());
                }
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
            String binding=coordination.binding(row);
            if(binding!=null&&!binding.isEmpty()) {
                try {
                    if(!binding.equals(provider.registryId()))throw new IllegalStateException();
                }catch(Exception e){throw new org.springframework.web.server.ResponseStatusException(org.springframework.http.HttpStatus.CONFLICT,"Sai hoặc không xác minh được registry giữ kết quả; chưa đối soát.");}
            }
            com.fasterxml.jackson.databind.JsonNode remote=null;
            try{remote=binding==null||binding.isEmpty()?provider.status((UUID)row.get("execution_token")):provider.status((UUID)row.get("execution_token"),binding);}
            catch(AiCreditsProvider.ProviderException e){
                if(e.code().equals("UPSTREAM_REGISTRY_MISMATCH"))throw new org.springframework.web.server.ResponseStatusException(org.springframework.http.HttpStatus.CONFLICT,"Registry thay đổi; chưa đối soát.");
            }
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
