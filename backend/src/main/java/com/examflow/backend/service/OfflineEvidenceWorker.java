package com.examflow.backend.service;

import org.springframework.stereotype.Component;
import org.springframework.scheduling.annotation.Scheduled;

/** Durable, leased background work; never holds a transaction during Storage / AI calls. */
@Component
public class OfflineEvidenceWorker {
    private final OfflineEvidenceService evidence;
    private final SupabaseEvidenceStorage storage;
    private final BatchMonitoringService models;
    public OfflineEvidenceWorker(OfflineEvidenceService evidence,SupabaseEvidenceStorage storage,BatchMonitoringService models){this.evidence=evidence;this.storage=storage;this.models=models;}
    @Scheduled(fixedDelay=2000,initialDelay=15000)
    public void run(){
        OfflineEvidenceService.Job job=null;
        try{
            job=evidence.claim();
            if(job!=null)evidence.analyzed(job,models.analyzeOffline(storage.readOffline(job.attempt(),job.capture()),job.reference()));
        }catch(Exception ignored){if(job!=null)evidence.retry(job);}
    }
}
