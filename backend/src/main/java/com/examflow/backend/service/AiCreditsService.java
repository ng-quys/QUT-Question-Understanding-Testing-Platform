package com.examflow.backend.service;

import com.examflow.backend.dto.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.*;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.server.ResponseStatusException;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import javax.sql.DataSource;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.*;
import java.util.*;

/** Pinned to MAIN datasource. No Question Bank writes or schema changes. */
@Service
public class AiCreditsService {
    private final JdbcTemplate db;
    private final TransactionTemplate tx;
    private final ObjectMapper json;
    private final AiWorkerCoordinator coordination;
    private final AiDocumentService documents;
    private final Clock clock = Clock.systemUTC();
    @Value("${ai.credits.enabled:false}") private boolean enabled;
    @Value("${ai.credits.monthly-limit:200}") private int monthlyLimit;
    @Value("${ai.credits.max-questions-per-request:45}") private int maximum;
    @Value("${ai.credits.zone:Asia/Ho_Chi_Minh}") private String zone;
    @Value("${ai.internal.key:}") private String secret;

    @Autowired
    public AiCreditsService(@Qualifier("dataSource") DataSource main, ObjectMapper json,AiWorkerCoordinator coordination,AiDocumentService documents) {
        db = new JdbcTemplate(main);
        tx = new TransactionTemplate(new DataSourceTransactionManager(main));
        this.json = json;
        this.coordination=coordination;
        this.documents=documents;
    }
    /** Test/legacy constructor; saved-document requests require the managed service. */
    public AiCreditsService(DataSource main,ObjectMapper json,AiWorkerCoordinator coordination){
        db=new JdbcTemplate(main);tx=new TransactionTemplate(new DataSourceTransactionManager(main));this.json=json;this.coordination=coordination;this.documents=null;
    }
    public boolean enabled() { return enabled; }
    public void requireEnabled() {
        if (!enabled) throw error(503,"AI Credits chưa được bật; đang chờ migration được xác nhận.");
        if (monthlyLimit<0 || maximum<1) throw error(503,"Cấu hình AI Credits không hợp lệ.");
    }
    private static ResponseStatusException error(int status,String message) {
        return new ResponseStatusException(HttpStatus.valueOf(status),message);
    }
    private LocalDate month() { return AiCreditRules.month(clock,ZoneId.of(zone)); }
    private static int n(Map<String,Object> r,String k) { return ((Number)r.get(k)).intValue(); }
    private static long l(Map<String,Object> r,String k) { return ((Number)r.get(k)).longValue(); }
    private String encode(Object value) {
        try { return json.writeValueAsString(value); }
        catch(Exception e) { throw error(400,"Dữ liệu AI không hợp lệ."); }
    }
    private String sha(String value) {
        try { return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8))); }
        catch(Exception e) { throw new IllegalStateException(e); }
    }
    private static UUID operation(String kind,long id) {
        return UUID.nameUUIDFromBytes(("examflow-ai:"+kind+":"+id).getBytes(StandardCharsets.UTF_8));
    }
    private byte[] sign(String value) {
        if(secret.length()<32) throw error(503,"Cần cấu hình AI_INTERNAL_KEY tối thiểu 32 ký tự ở BE và AI Service.");
        try {
            Mac mac=Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8),"HmacSHA256"));
            return mac.doFinal(value.getBytes(StandardCharsets.UTF_8));
        } catch(Exception e) { throw new IllegalStateException(e); }
    }
    public String documentProof(long user,String text) {
        String value=user+":"+sha(text)+":"+clock.instant().plus(Duration.ofHours(24)).getEpochSecond();
        var b=Base64.getUrlEncoder().withoutPadding();
        return b.encodeToString(value.getBytes(StandardCharsets.UTF_8))+"."+b.encodeToString(sign(value));
    }
    private void verifyProof(long user,AiGenerateRequest request) {
        try {
            String[] parts=Objects.toString(request.sourceProof(),"").split("\\.");
            if(parts.length!=2)throw new IllegalArgumentException();
            String value=new String(Base64.getUrlDecoder().decode(parts[0]),StandardCharsets.UTF_8);
            if(!MessageDigest.isEqual(sign(value),Base64.getUrlDecoder().decode(parts[1])))throw new IllegalArgumentException();
            String[] fields=value.split(":");
            if(fields.length!=3||Long.parseLong(fields[0])!=user||!fields[1].equals(sha(request.sourceText()))
                ||Long.parseLong(fields[2])<clock.instant().getEpochSecond())throw new IllegalArgumentException();
        } catch(ResponseStatusException e) { throw e; }
        catch(Exception e) { throw error(403,"Tài liệu chưa được xác thực hoặc đã hết hạn. Vui lòng trích xuất lại tài liệu."); }
    }
    private void ledger(long user,LocalDate month,Long job,Long actor,UUID key,String type,
                        int limit,int used,int reserved,long extra,long extraReserved,String reason) {
        db.update("""
            INSERT INTO public.ai_credit_transactions
            (user_id,month_start,job_id,actor_id,operation_key,event_type,monthly_limit_delta,
             monthly_used_delta,monthly_reserved_delta,extra_balance_delta,extra_reserved_delta,reason)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
            """,user,month,job,actor,key,type,limit,used,reserved,extra,extraReserved,reason);
    }
    private Map<String,Object> lockAccount(long user) {
        db.update("INSERT INTO public.ai_credit_accounts(user_id) VALUES (?) ON CONFLICT DO NOTHING",user);
        return db.queryForMap("SELECT * FROM public.ai_credit_accounts WHERE user_id=? FOR UPDATE",user);
    }
    private Map<String,Object> lockMonth(long user,LocalDate period) {
        int created=db.update("INSERT INTO public.ai_credit_months(user_id,month_start,monthly_limit) VALUES (?,?,?) ON CONFLICT DO NOTHING",user,period,monthlyLimit);
        if(created==1) {
            UUID key=UUID.nameUUIDFromBytes(("examflow-ai:month:"+user+":"+period).getBytes(StandardCharsets.UTF_8));
            ledger(user,period,null,null,key,"monthly_allocation",monthlyLimit,0,0,0,0,null);
        }
        return db.queryForMap("SELECT * FROM public.ai_credit_months WHERE user_id=? AND month_start=? FOR UPDATE",user,period);
    }
    public record Quota(LocalDate month,int monthlyLimit,int used,int reserved,long extraBalance,
                        long extraReserved,long remaining,Instant nextReset,int maxPerRequest,Map<String,Object> activeJob) {}
    public Quota quota(long user) {
        requireEnabled();
        return tx.execute(status->{
            var account=lockAccount(user);var period=month();var monthly=lockMonth(user,period);
            var active=db.queryForList("""
                SELECT id,credit_state AS status,requested_question_count AS requested
                FROM public.ai_generation_requests WHERE requested_by=?
                AND credit_state IN ('reserved','running','cancel_requested','unknown') ORDER BY id LIMIT 1
                """,user);
            long remaining=(long)n(monthly,"monthly_limit")-n(monthly,"used")-n(monthly,"reserved")
                +l(account,"extra_balance")-l(account,"extra_reserved");
            return new Quota(period,n(monthly,"monthly_limit"),n(monthly,"used"),n(monthly,"reserved"),
                l(account,"extra_balance"),l(account,"extra_reserved"),remaining,
                AiCreditRules.nextReset(period,ZoneId.of(zone)),maximum,active.isEmpty()?null:active.get(0));
        });
    }
    private void ownedCourse(long user,AiGenerateRequest request) {
        Long count=db.queryForObject("""
            SELECT count(*) FROM public.courses c WHERE c.id=?
            AND (c.created_by=? OR EXISTS(SELECT 1 FROM public.course_faculties cf WHERE cf.course_id=c.id AND cf.faculty_id=?))
            """,Long.class,request.courseId(),user,user);
        if(count==null||count==0)throw error(403,"Không có quyền quản lý học phần.");
        for(var unit:request.units()==null?List.<AiGenerateRequest.AiUnitDto>of():request.units()) {
            if(unit.chapterId()!=null&&db.queryForObject("SELECT count(*) FROM public.chapters WHERE id=? AND course_id=?",Long.class,unit.chapterId(),request.courseId())==0)
                throw error(400,"Chương không thuộc học phần.");
            if(unit.cloId()!=null&&db.queryForObject("SELECT count(*) FROM public.clos WHERE id=? AND course_id=?",Long.class,unit.cloId(),request.courseId())==0)
                throw error(400,"CLO không thuộc học phần.");
        }
    }
    public Map<String,Object> create(long user,UUID key,AiGenerateRequest request) {
        requireEnabled();int count;
        try { count=AiCreditRules.count(request,maximum); }
        catch(IllegalArgumentException e) { throw error(400,e.getMessage()); }
        if(!List.of("qwen","openai").contains(request.provider()))throw error(400,"Provider không hợp lệ.");
        if(request.automatic() && !"qwen".equals(request.provider()))throw error(400,"Luồng tài liệu và CLO sử dụng Qwen qua RAG.");
        if(request.effectiveBatchSize()!=5&&request.effectiveBatchSize()!=10)throw error(400,"Batch size phải là 5 hoặc 10 câu.");
        if(request.effectiveInferenceBatchSize()!=1&&request.effectiveInferenceBatchSize()!=3)throw error(400,"Chế độ sinh AI phải là 1 hoặc 3 câu/lượt.");
        boolean legacy=request.sourceText()!=null&&!request.sourceText().isBlank();
        boolean saved=request.documentRefs()!=null&&!request.documentRefs().isEmpty();
        if(legacy==saved)throw error(400,"Chọn đúng một nguồn: nội dung đã trích xuất hoặc tài liệu đã lưu.");
        if(legacy&&request.sourceText().length()<50)throw error(400,"Tài liệu phải có ít nhất 50 ký tự.");
        if(saved){if(documents==null)throw error(503,"Thư viện tài liệu AI chưa sẵn sàng.");documents.validateRefs(user,request.courseId(),request.documentRefs());}
        String payload=encode(request),hash=sha(payload);
        return tx.execute(status->{
            var account=lockAccount(user);
            var previous=db.queryForList("SELECT id,payload_sha256 FROM public.ai_generation_requests WHERE requested_by=? AND idempotency_key=? AND credit_state<>'legacy'",user,key);
            if(!previous.isEmpty()) {
                if(!hash.equals(previous.get(0).get("payload_sha256")))throw error(409,"Idempotency key đã được dùng với nội dung khác.");
                return view(raw(l(previous.get(0),"id")));
            }
            ownedCourse(user,request);if(legacy)verifyProof(user,request);
            var stored=request;
            if(request.automatic()) {
                var selected=new ArrayList<AiGenerateRequest.AiCloDto>();
                for(Long cloId:request.cloIds()) {
                    var rows=db.queryForList("SELECT id,code,description FROM public.clos WHERE id=? AND course_id=? AND coalesce(status,'active')='active'",cloId,request.courseId());
                    if(rows.size()!=1 || rows.get(0).get("description")==null || rows.get(0).get("description").toString().isBlank())
                        throw error(400,"CLO không hợp lệ hoặc không thuộc học phần.");
                    var c=rows.get(0);selected.add(new AiGenerateRequest.AiCloDto(cloId,c.get("code").toString(),c.get("description").toString()));
                }
                stored=new AiGenerateRequest(request.courseId(),request.provider(),request.instruction(),request.sourceText(),null,request.sourceProof(),request.defaultScore(),request.cloIds(),request.questionCount(),selected,request.effectiveBatchSize(),request.documentRefs(),request.effectiveInferenceBatchSize());
            }
            if(db.queryForObject("SELECT count(*) FROM public.ai_generation_requests WHERE requested_by=? AND credit_state IN ('reserved','running','cancel_requested','unknown')",Long.class,user)>0)
                throw error(409,"Bạn đang có một job AI hoạt động hoặc chờ đối soát.");
            LocalDate period=month();var monthly=lockMonth(user,period);AiCreditRules.Split split;
            try { split=AiCreditRules.reserve(count,n(monthly,"monthly_limit")-n(monthly,"used")-n(monthly,"reserved"),l(account,"extra_balance")-l(account,"extra_reserved")); }
            catch(IllegalArgumentException e) { throw error(409,e.getMessage()); }
            db.update("UPDATE public.ai_credit_accounts SET extra_reserved=extra_reserved+?,updated_at=current_timestamp WHERE user_id=?",split.extra(),user);
            db.update("UPDATE public.ai_credit_months SET reserved=reserved+? WHERE user_id=? AND month_start=?",split.monthly(),user,period);
            Long id=db.queryForObject("""
                INSERT INTO public.ai_generation_requests
                (course_id,requested_by,requested_question_count,status,model_name,credit_state,
                 credit_month,idempotency_key,payload_sha256,credit_payload,reserved_monthly,reserved_extra,execution_token,credit_created_at)
                VALUES (?,?,?,'pending',?,'reserved',?,?,?,?::jsonb,?,?,?,current_timestamp) RETURNING id
                """,Long.class,request.courseId(),user,count,request.provider(),period,key,hash,encode(stored),split.monthly(),split.extra(),UUID.randomUUID());
            ledger(user,period,id,null,operation("reserve",id),"reserve",0,0,split.monthly(),0,split.extra(),null);
            return view(raw(id));
        });
    }
    public Map<String,Object> raw(long id) {
        try { return db.queryForMap("SELECT * FROM public.ai_generation_requests WHERE id=? AND credit_state<>'legacy'",id); }
        catch (org.springframework.dao.EmptyResultDataAccessException e) { throw error(404,"Không tìm thấy job AI."); }
    }
    public AiGenerateRequest payload(Map<String,Object> row) {
        try {
            var payload=(com.fasterxml.jackson.databind.node.ObjectNode)json.readTree(row.get("credit_payload").toString());
            payload.remove(AiWorkerCoordinator.BINDING); // Server-only routing metadata, never forwarded to Qwen/client.
            return json.treeToValue(payload,AiGenerateRequest.class);
        }
        catch(Exception e) { throw new IllegalStateException("Không đọc được payload job",e); }
    }
    public List<AiQuestionDto> results(Map<String,Object> row) {
        try { return Arrays.asList(json.readValue(row.get("credit_result").toString(),AiQuestionDto[].class)); }
        catch(Exception e) { throw new IllegalStateException(e); }
    }
    private Map<String,Object> view(Map<String,Object> row) {
        var out=new LinkedHashMap<String,Object>();
        out.put("courseId",row.get("course_id"));out.put("id",row.get("id"));out.put("status",row.get("credit_state"));
        out.put("requested",row.get("requested_question_count"));out.put("accepted",row.get("accepted_count"));
        out.put("charged",n(row,"charged_monthly")+n(row,"charged_extra"));out.put("error",row.get("credit_error_code"));
        int batchSize=payload(row).effectiveBatchSize(),accepted=n(row,"accepted_count"),requested=n(row,"requested_question_count");
        out.put("batchSize",batchSize);out.put("completedBatches",terminal(row)?(accepted+batchSize-1)/batchSize:accepted/batchSize);
        out.put("inferenceBatchSize",payload(row).effectiveInferenceBatchSize());
        out.put("totalBatches",(requested+batchSize-1)/batchSize);
        out.put("defaultScore",payload(row).defaultScore()==null?0.5:payload(row).defaultScore());
        if(payload(row).automatic())out.put("selectedClos",payload(row).selectedClos());
        out.put("questions",terminal(row)?results(row):List.of());return out;
    }
    public Map<String,Object> job(long user,long id) {
        requireEnabled();var row=raw(id);
        if(l(row,"requested_by")!=user)throw error(403,"Job không thuộc tài khoản.");return view(row);
    }
    public static boolean terminal(Map<String,Object> row) {
        return List.of("succeeded","partial","failed","cancelled").contains(row.get("credit_state"));
    }
    public List<Map<String,Object>> active() {
        // Unknown jobs stay visible in quota/Admin, but must not occupy the worker batch.
        return db.queryForList("SELECT * FROM public.ai_generation_requests WHERE credit_state IN ('reserved','running','cancel_requested') ORDER BY id LIMIT 100");
    }
    public void allocateCurrentMonth() {
        var rows=db.queryForList("""
            SELECT u.id FROM public.users u WHERE u.role IN ('teacher','faculty') AND u.status='active'
            AND NOT EXISTS(SELECT 1 FROM public.ai_credit_months m WHERE m.user_id=u.id AND m.month_start=?)
            ORDER BY u.id LIMIT 100
            """,month());
        for(var row:rows)quota(l(row,"id"));
    }
    private Map<String,Object> lockJob(long id) {
        var before=raw(id);lockAccount(l(before,"requested_by"));
        LocalDate period=((java.sql.Date)before.get("credit_month")).toLocalDate();
        db.queryForMap("SELECT * FROM public.ai_credit_months WHERE user_id=? AND month_start=? FOR UPDATE",l(before,"requested_by"),period);
        return db.queryForMap("SELECT * FROM public.ai_generation_requests WHERE id=? FOR UPDATE",id);
    }
    public boolean claim(long id) {
        return tx.execute(status->{
            coordination.requireAuthority(id);
            var row=lockJob(id);if(!"reserved".equals(row.get("credit_state")))return false;
            db.update("UPDATE public.ai_generation_requests SET credit_state='running',status='processing',dispatched_at=current_timestamp,heartbeat_at=current_timestamp,lease_expires_at=current_timestamp+interval '120 seconds' WHERE id=?",id);
            return true;
        });
    }
    public List<AiQuestionDto> validate(Map<String,Object> row,List<AiQuestionDto> candidates) {
        var request=payload(row);Map<String,Integer> budgets=new HashMap<>();
        for(var unit:request.units()==null?List.<AiGenerateRequest.AiUnitDto>of():request.units()) {
            String base=unit.chapterId()+":"+unit.cloId()+":";
            budgets.merge(base+"remember",unit.nb(),Integer::sum);budgets.merge(base+"understand",unit.th(),Integer::sum);budgets.merge(base+"apply",unit.vd(),Integer::sum);
        }
        var accepted=new ArrayList<AiQuestionDto>();var seen=new HashSet<String>();
        for(var q:candidates) {
            if(q==null||q.content()==null||q.content().isBlank()||q.options()==null||q.options().size()!=4
                ||q.options().stream().anyMatch(o->o==null||o.isBlank())||q.correctIndex()<0||q.correctIndex()>3)continue;
            if(request.automatic()) {
                if(accepted.size()>=request.questionCount() || q.cloId()==null || !request.cloIds().contains(q.cloId())
                    || !List.of("remember","understand","apply").contains(Objects.toString(q.bloom(),""))
                    || q.chapterId()!=null || q.explanation()==null || q.explanation().isBlank()
                    || q.evidenceQuote()==null || q.evidenceQuote().strip().length()<20
                    || !evidencePresent(request,q.evidenceQuote())
                    || q.options().stream().map(o->o.strip().toLowerCase(Locale.ROOT)).distinct().count()!=4)continue;
                String fingerprint=q.content().strip().toLowerCase(Locale.ROOT).replaceAll("\\s+"," ");
                if(seen.add(fingerprint))accepted.add(q);
                continue;
            }
            String key=q.chapterId()+":"+q.cloId()+":"+q.bloom();
            String fingerprint=q.content().strip().toLowerCase(Locale.ROOT).replaceAll("\\s+"," ");
            if(budgets.getOrDefault(key,0)<=0||!seen.add(fingerprint))continue;
            budgets.computeIfPresent(key,(k,v)->v-1);accepted.add(q);
        }return accepted;
    }
    private boolean evidencePresent(AiGenerateRequest request,String quote){
        if(request.documentRefs()!=null&&!request.documentRefs().isEmpty())return documents!=null&&documents.evidenceInRefs(request.documentRefs(),quote);
        return request.sourceText()!=null&&request.sourceText().replaceAll("\\s+"," ").contains(quote.strip().replaceAll("\\s+"," "));
    }
    public void checkpoint(long id,UUID token,List<AiQuestionDto> questions) {
        tx.executeWithoutResult(status->{
            coordination.requireAuthority(id);
            var row=lockJob(id);if(terminal(row)||!token.equals(row.get("execution_token")))return;
            var accepted=validate(row,questions);if(accepted.size()<n(row,"accepted_count"))return;
            String state=row.get("cancel_requested_at")==null?"running":"cancel_requested";
            db.update("UPDATE public.ai_generation_requests SET credit_result=?::jsonb,accepted_count=?,credit_state=?,heartbeat_at=current_timestamp,lease_expires_at=current_timestamp+interval '120 seconds' WHERE id=?",encode(accepted),accepted.size(),state,id);
        });
    }
    public void checkpointOwned(long id,UUID token,List<AiQuestionDto> questions) {
        checkpoint(id,token,questions);
    }
    public void unknownOwned(long id,UUID token,String reason) {
        unknown(id,token,reason);
    }
    public void finishOwned(long id,UUID token,List<AiQuestionDto> questions,boolean cancelled,Long actor,String reason) {
        tx.executeWithoutResult(s->{coordination.requireAuthority(id);finish(id,token,questions,cancelled,actor,reason);});
    }
    public void unknown(long id,UUID token,String reason) {
        tx.executeWithoutResult(s->{
            coordination.requireAuthority(id);
            db.update("UPDATE public.ai_generation_requests SET credit_state='unknown',status='processing',credit_error_code=? WHERE id=? AND execution_token=? AND credit_state IN ('running','cancel_requested')",reason,id,token);
        });
    }
    public void finish(long id,UUID token,List<AiQuestionDto> questions,boolean cancelled,Long actor,String reason) {
        tx.executeWithoutResult(status->{
            var row=lockJob(id);if(terminal(row)||!token.equals(row.get("execution_token")))return;
            var accepted=validate(row,questions);if(accepted.size()<n(row,"accepted_count"))accepted=results(row);
            int count=accepted.size(),rm=n(row,"reserved_monthly"),re=n(row,"reserved_extra");
            var charged=AiCreditRules.settle(count,rm,re);long user=l(row,"requested_by");
            LocalDate period=((java.sql.Date)row.get("credit_month")).toLocalDate();
            db.update("UPDATE public.ai_credit_accounts SET extra_balance=extra_balance-?,extra_reserved=extra_reserved-?,updated_at=current_timestamp WHERE user_id=?",charged.extra(),re,user);
            db.update("UPDATE public.ai_credit_months SET used=used+?,reserved=reserved-? WHERE user_id=? AND month_start=?",charged.monthly(),rm,user,period);
            boolean wasCancelled=cancelled||row.get("cancel_requested_at")!=null;
            String state=count==n(row,"requested_question_count")?"succeeded":count>0?"partial":wasCancelled?"cancelled":"failed";
            String oldStatus=count>0?"completed":wasCancelled?"cancelled":"failed";
            db.update("""
                UPDATE public.ai_generation_requests SET credit_state=?,status=?,credit_result=?::jsonb,
                accepted_count=?,charged_monthly=?,charged_extra=?,credit_completed_at=current_timestamp,
                completed_at=current_timestamp,credit_error_code=?,lease_expires_at=NULL WHERE id=?
                """,state,oldStatus,encode(accepted),count,charged.monthly(),charged.extra(),reason,id);
            ledger(user,period,id,actor,operation("final",id),count>0?"settle":"release",0,charged.monthly(),-rm,-charged.extra(),-re,reason);
        });
    }
    public Map<String,Object> cancel(long user,long id) {
        requireEnabled();tx.executeWithoutResult(status->{
            var row=lockJob(id);if(l(row,"requested_by")!=user)throw error(403,"Job không thuộc tài khoản.");
            if(terminal(row))return;
            if("reserved".equals(row.get("credit_state")))finish(id,(UUID)row.get("execution_token"),List.of(),true,null,"Đã hủy trước khi gọi AI.");
            else db.update("UPDATE public.ai_generation_requests SET cancel_requested_at=current_timestamp,credit_state=CASE WHEN credit_state='unknown' THEN 'unknown' ELSE 'cancel_requested' END WHERE id=?",id);
        });return job(user,id);
    }
    public Map<String,Object> grant(long admin,long user,UUID key,long amount,String reason) {
        requireEnabled();
        if(amount<1||amount>1000000||reason==null||reason.isBlank()||reason.length()>1000)throw error(400,"Số credits phải từ 1–1000000 và cần lý do tối đa 1000 ký tự.");
        String clean=reason.strip();
        return tx.execute(status->{
            if(db.queryForObject("SELECT count(*) FROM public.users WHERE id=? AND role IN ('teacher','faculty')",Long.class,user)==0)throw error(404,"Không tìm thấy giảng viên.");
            lockAccount(user);
            db.queryForObject("SELECT pg_advisory_xact_lock(?)",Object.class,key.getMostSignificantBits()^key.getLeastSignificantBits());
            var old=db.queryForList("SELECT * FROM public.ai_credit_transactions WHERE operation_key=?",key);
            if(!old.isEmpty()) {
                var e=old.get(0);
                if(!"admin_grant".equals(e.get("event_type"))||l(e,"user_id")!=user||e.get("actor_id")==null||l(e,"actor_id")!=admin
                    ||l(e,"extra_balance_delta")!=amount||!clean.equals(e.get("reason")))throw error(409,"Operation key đã dùng với nội dung khác.");
                return Map.of("operationKey",key,"replayed",true);
            }
            db.update("UPDATE public.ai_credit_accounts SET extra_balance=extra_balance+?,updated_at=current_timestamp WHERE user_id=?",amount,user);
            ledger(user,null,null,admin,key,"admin_grant",0,0,0,amount,0,clean);return Map.of("operationKey",key,"replayed",false);
        });
    }
    public Map<String,Object> teachers(String search,int page,int size) {
        requireEnabled();int limit=Math.min(50,Math.max(1,size));int offset=Math.multiplyExact(Math.max(0,page),limit);
        String pattern="%"+Objects.toString(search,"").toLowerCase(Locale.ROOT)+"%";
        var rows=db.queryForList("SELECT id,full_name,email FROM public.users WHERE role IN ('teacher','faculty') AND (lower(full_name) LIKE ? OR lower(email) LIKE ?) ORDER BY id LIMIT ? OFFSET ?",pattern,pattern,limit,offset);
        var items=new ArrayList<Map<String,Object>>();
        for(var row:rows){var item=new LinkedHashMap<>(row);item.put("quota",quota(l(row,"id")));items.add(item);}
        return Map.of("items",items,"page",Math.max(0,page),"size",limit);
    }
    public List<Map<String,Object>> history(long user,Long before,int size) {
        requireEnabled();return db.queryForList("""
            SELECT t.id,t.event_type,t.monthly_limit_delta,t.monthly_used_delta,t.monthly_reserved_delta,
            t.extra_balance_delta,t.extra_reserved_delta,t.job_id,t.reason,t.created_at,t.actor_id,u.full_name AS actor_name
            FROM public.ai_credit_transactions t LEFT JOIN public.users u ON u.id=t.actor_id
            WHERE t.user_id=? AND t.id<? ORDER BY t.id DESC LIMIT ?
            """,user,before==null?Long.MAX_VALUE:before,Math.min(50,Math.max(1,size)));
    }
    /** Snapshot is compared again under the same account/month/job locks used by settlement. */
    public String recoveryFingerprint(Map<String,Object> row) {
        var values=new ArrayList<Object>();
        for(String field:List.of("id","execution_token","credit_payload","credit_result","accepted_count",
                "reserved_monthly","reserved_extra","charged_monthly","charged_extra","credit_state",
                "lease_expires_at","cancel_requested_at"))values.add(Objects.toString(row.get(field),""));
        return sha(encode(values));
    }
    public void requireOrphanCancellation(Map<String,Object> row) {
        Object lease=row.get("lease_expires_at");
        if(!List.of("cancel_requested","unknown").contains(row.get("credit_state"))
                ||row.get("cancel_requested_at")==null||!(lease instanceof java.sql.Timestamp timestamp)
                ||!timestamp.toInstant().isBefore(clock.instant().minusSeconds(120))
                ||!"qwen".equals(payload(row).provider())
                ||n(row,"charged_monthly")!=0||n(row,"charged_extra")!=0
                ||results(row).size()!=n(row,"accepted_count")
                ||validate(row,results(row)).size()!=n(row,"accepted_count"))
            throw error(409,"Job chưa đủ điều kiện phục hồi checkpoint sau khi mất registry.");
    }
    public Map<String,Object> recoverCancelledCheckpoint(long admin,long id,String fingerprint,String reason) {
        requireEnabled();
        if(reason==null||reason.isBlank()||reason.length()>1000)throw error(400,"Cần lý do phục hồi.");
        return tx.execute(status->{
            var row=lockJob(id);
            if(!recoveryFingerprint(row).equals(fingerprint))throw error(409,"Job đã thay đổi; cần kiểm tra lại preview.");
            requireOrphanCancellation(row);
            finish(id,(UUID)row.get("execution_token"),results(row),true,admin,reason.strip());
            return view(raw(id));
        });
    }
    public Map<String,Object> reconcile(long admin,long id,boolean stopped,String reason) {
        requireEnabled();
        if(!stopped||reason==null||reason.isBlank()||reason.length()>1000)throw error(400,"Cần xác nhận tác vụ cũ đã dừng và ghi lý do đối soát.");
        return tx.execute(status->{
            var row=lockJob(id);if(terminal(row))return view(row);
            if(!"unknown".equals(row.get("credit_state")))throw error(409,"Chỉ đối soát job unknown.");
            finish(id,(UUID)row.get("execution_token"),results(row),row.get("cancel_requested_at")!=null,admin,reason.strip());return view(raw(id));
        });
    }
}
