package com.examflow.backend.service;

import java.util.*;
import org.springframework.stereotype.Service;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

/** Explicit Admin recovery only. Never adopts a token, starts AI or modifies accounting rules. */
@Service
public class AiCheckpointRecovery {
    private final AiCreditsService credits;
    private final AiCreditsProvider provider;
    private final AiWorkerCoordinator coordination;
    public AiCheckpointRecovery(AiCreditsService credits,AiCreditsProvider provider,AiWorkerCoordinator coordination){
        this.credits=credits;this.provider=provider;this.coordination=coordination;
    }
    private ResponseStatusException conflict(){return new ResponseStatusException(HttpStatus.CONFLICT,
        "Không xác minh được execution cũ đã mất; chưa phục hồi hoặc tính credits.");}
    public Map<String,Object> preview(long id){
        credits.requireEnabled();
        coordination.requireReady();
        var row=credits.raw(id);credits.requireOrphanCancellation(row);
        String old=coordination.binding(row);
        try {
            String current=provider.registryId();
            if(old==null||old.isBlank()||old.equals(current))throw conflict();
            try {provider.status((UUID)row.get("execution_token"),current);throw conflict();}
            catch(AiCreditsProvider.ProviderException e){
                if(e.status()!=404||!"UPSTREAM_JOB_NOT_FOUND".equals(e.code()))throw conflict();
            }
            if(!current.equals(provider.registryId()))throw conflict();
            int accepted=((Number)row.get("accepted_count")).intValue();
            int reserved=((Number)row.get("reserved_monthly")).intValue()+((Number)row.get("reserved_extra")).intValue();
            if(accepted>reserved)throw conflict();
            return Map.of("id",id,"fingerprint",credits.recoveryFingerprint(row),"currentRegistry",current,
                "accepted",accepted,"release",reserved-accepted,"questions",credits.results(row));
        }catch(ResponseStatusException e){throw e;}
        catch(Exception e){throw conflict();}
    }
    public Map<String,Object> recover(long admin,long id,boolean stopped,String fingerprint,String currentRegistry,String reason){
        if(!stopped)throw conflict();
        var proof=preview(id);
        if(!Objects.equals(proof.get("fingerprint"),fingerprint)||!Objects.equals(proof.get("currentRegistry"),currentRegistry))throw conflict();
        return credits.recoverCancelledCheckpoint(admin,id,fingerprint,reason);
    }
}
