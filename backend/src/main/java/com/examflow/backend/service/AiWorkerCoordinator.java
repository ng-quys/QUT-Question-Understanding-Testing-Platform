package com.examflow.backend.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.jdbc.datasource.ConnectionHolder;
import java.sql.Connection;
import javax.sql.DataSource;
import java.util.*;
import java.util.function.Consumer;

/** Per-job PostgreSQL session locks on MAIN DB; never use a transaction pooler. */
@Service
public class AiWorkerCoordinator {
    public static final String BINDING="_executionRegistry";
    private final JdbcTemplate db;
    private final TransactionTemplate tx;
    private final ObjectMapper json;
    private final DataSource source;
    @org.springframework.beans.factory.annotation.Value("${ai.credits.worker.cluster-ready:false}") private boolean clusterReady;
    public boolean isClusterReady(){return clusterReady;}
    public void requireReady() {
        if(!clusterReady)throw new org.springframework.web.server.ResponseStatusException(org.springframework.http.HttpStatus.SERVICE_UNAVAILABLE,
            "Chưa xác nhận toàn bộ Backend đã nâng cấp hoặc tắt worker cũ; chưa tạo job hay giữ credits.");
        if(Boolean.TRUE.equals(db.queryForObject("""
            SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE pid<>pg_backend_pid() AND datname=current_database()
            AND application_name NOT LIKE 'ExamFlow-Main/ai-worker-v1%'
            AND query ILIKE 'SELECT * FROM public.ai_generation_requests WHERE credit_state IN%'
            AND query ILIKE '%ORDER BY id LIMIT 100%')
            """,Boolean.class)))throw new org.springframework.web.server.ResponseStatusException(org.springframework.http.HttpStatus.SERVICE_UNAVAILABLE,
            "Phát hiện worker Backend chưa nâng cấp cùng polling; tạm chặn sinh để tránh kẹt credits.");
    }
    // Capability context only. Exclusivity/fencing is provided by PostgreSQL, not this field.
    private final ThreadLocal<Long> authorizedJob=new ThreadLocal<>();
    public AiWorkerCoordinator(@Qualifier("dataSource") DataSource source,ObjectMapper json) {
        this.db=new JdbcTemplate(source);this.json=json;this.source=source;
        this.tx=new TransactionTemplate(new DataSourceTransactionManager(source));
        tx.setTimeout(60);
    }
    public void requireAuthority(long id) {
        if(!Objects.equals(authorizedJob.get(),id)||!TransactionSynchronizationManager.isActualTransactionActive())
            throw new IllegalStateException("Worker lacks PostgreSQL job authority");
        long key=lockKey(id);
        if(!Boolean.TRUE.equals(db.queryForObject("""
            SELECT EXISTS(SELECT 1 FROM pg_locks WHERE locktype='advisory' AND pid=pg_backend_pid()
            AND classid::bigint=? AND objid::bigint=? AND objsubid=1 AND granted)
            """,Boolean.class,key>>>32,key&0xffffffffL)))
            throw new IllegalStateException("PostgreSQL worker ownership lost");
    }
    public String binding(Map<String,Object> row) {
        try{return json.readTree(row.get("credit_payload").toString()).path(BINDING).asText("");}
        catch(Exception e){throw new IllegalStateException("Invalid job registry binding");}
    }
    public boolean run(long id,UUID token,String registry,Consumer<Map<String,Object>> action) {
        if(registry==null||registry.isBlank())return false;
        if(authorizedJob.get()!=null)throw new IllegalStateException("Nested worker coordination");
        if(TransactionSynchronizationManager.hasResource(source))throw new IllegalStateException("Worker must own its database session");
        // Bind one physical session for the entire operation. claim() commits BEFORE POST start;
        // later checkpoint/finish transactions reuse the very same lock-owning connection.
        try(Connection connection=source.getConnection()) {
            if(connection.getMetaData().getURL().matches(".*:6543(?:/|\\?).*"))
                throw new IllegalStateException("AI worker requires PostgreSQL session endpoint, not port 6543");
            connection.setAutoCommit(true);
            TransactionSynchronizationManager.bindResource(source,new ConnectionHolder(connection));
            boolean locked=false;
            try {
                locked=Boolean.TRUE.equals(db.queryForObject("SELECT pg_try_advisory_lock(?)",Boolean.class,lockKey(id)));
                if(!locked)return false;
                var row=tx.execute(status->{
            var before=db.queryForMap("SELECT * FROM public.ai_generation_requests WHERE id=?",id);
            // Match the accounting lock order: account -> month -> job. Never invert it.
            db.queryForMap("SELECT * FROM public.ai_credit_accounts WHERE user_id=? FOR UPDATE",before.get("requested_by"));
            db.queryForMap("SELECT * FROM public.ai_credit_months WHERE user_id=? AND month_start=? FOR UPDATE",before.get("requested_by"),before.get("credit_month"));
            var current=db.queryForMap("SELECT * FROM public.ai_generation_requests WHERE id=? FOR UPDATE",id);
            if(!token.equals(current.get("execution_token"))||!List.of("reserved","running","cancel_requested").contains(current.get("credit_state")))return null;
            String owner=binding(current);
            if("reserved".equals(current.get("credit_state"))&&owner.isEmpty()) {
                try {
                    var payload=(ObjectNode)json.readTree(current.get("credit_payload").toString());
                    payload.put(BINDING,registry);
                    String encoded=json.writeValueAsString(payload);
                    db.update("UPDATE public.ai_generation_requests SET credit_payload=?::jsonb WHERE id=?",encoded,id);
                    current.put("credit_payload",encoded);
                }catch(java.io.IOException e){throw new IllegalStateException("Cannot bind execution registry");}
            }else if(!registry.equals(owner))return null;
            return current;
                });
            if(row==null)return false;
            // A dispatched legacy job without binding requires explicit review, never adoption/replay.
            authorizedJob.set(id);
            try{action.accept(row);}finally{authorizedJob.remove();}
            return true;
            } finally {
                authorizedJob.remove();
                try {
                    if(locked&&!Boolean.TRUE.equals(db.queryForObject("SELECT pg_advisory_unlock(?)",Boolean.class,lockKey(id))))
                        throw new IllegalStateException("Worker lock unexpectedly absent");
                }catch(Exception unlockFailure) {
                    // Never return a session with a possibly retained lock to Hikari.
                    try{connection.abort(Runnable::run);}catch(Exception ignored){}
                    throw new IllegalStateException("Worker session invalidated after lock loss",unlockFailure);
                }finally{TransactionSynchronizationManager.unbindResource(source);}
            }
        }catch(java.sql.SQLException e){throw new IllegalStateException("Worker database session unavailable",e);}
    }
    private static long lockKey(long id){return 0x4558414d574f524bL^id;}
}
