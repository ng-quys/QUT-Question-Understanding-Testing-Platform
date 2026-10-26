package com.examflow.backend.service;

import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

@Service
public class EvidenceSchema {
    @PersistenceContext private EntityManager em;
    private volatile boolean initialized;

    @Transactional
    public synchronized void ensure() {
        if (initialized) return;
        // Same additive changes as migration 007; the base event table must exist.
        for (String ddl : new String[]{
                "event_uuid VARCHAR(36)", "capture_uuid VARCHAR(36)", "evidence_provider VARCHAR(16) NOT NULL DEFAULT 'local'",
                "evidence_bucket TEXT", "evidence_key TEXT", "evidence_status VARCHAR(16) NOT NULL DEFAULT 'none'",
                "evidence_error VARCHAR(80)"}) {
            em.createNativeQuery("ALTER TABLE anti_cheat_events ADD COLUMN IF NOT EXISTS " + ddl).executeUpdate();
        }
        em.createNativeQuery("CREATE UNIQUE INDEX IF NOT EXISTS idx_anti_cheat_event_uuid ON anti_cheat_events(attempt_id,event_uuid)").executeUpdate();
        em.createNativeQuery("CREATE INDEX IF NOT EXISTS idx_anti_cheat_capture ON anti_cheat_events(attempt_id,capture_uuid)").executeUpdate();
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override public void afterCommit() { initialized = true; }
            });
        }
    }
}
