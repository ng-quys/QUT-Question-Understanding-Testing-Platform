package com.examflow.backend.service;

import com.examflow.backend.dto.AiGenerateRequest.AiDocumentRefDto;
import com.examflow.backend.exception.ApiException;
import org.springframework.beans.factory.annotation.*;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;
import javax.sql.DataSource;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.*;

/** Document metadata lives only in Question Bank; ownership is verified in main DB. */
@Service
public class AiDocumentService {
    private final JdbcTemplate main,bank;
    private final SupabaseAiDocumentStorage storage;
    private final AiCreditsProvider ai;
    @Value("${ai.saved-documents.enabled:false}") private boolean enabled;
    public AiDocumentService(@Qualifier("dataSource") DataSource mainData,
            @Qualifier("questionBankDataSource") DataSource bankData,
            SupabaseAiDocumentStorage storage,AiCreditsProvider ai){
        this.main=new JdbcTemplate(mainData);this.bank=new JdbcTemplate(bankData);this.storage=storage;this.ai=ai;
    }
    public void requireEnabled(){if(!enabled)throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE,"Thư viện tài liệu AI chưa được bật.");}
    public void requireCourse(long user,long course){
        Long count=main.queryForObject("""
            SELECT count(*) FROM public.courses c WHERE c.id=? AND
            (c.created_by=? OR EXISTS(SELECT 1 FROM public.course_faculties f WHERE f.course_id=c.id AND f.faculty_id=?))
            """,Long.class,course,user,user);
        if(count==null||count==0)throw new ApiException(HttpStatus.FORBIDDEN,"Không có quyền quản lý học phần.");
    }
    public List<Map<String,Object>> list(long user,long course){
        requireEnabled();requireCourse(user,course);
        return bank.queryForList("""
            SELECT d.id,d.revision,d.original_name AS name,d.mime_type,d.byte_size,d.file_sha256,d.status,
                   d.created_at,d.updated_at,i.id AS index_id,i.status AS index_status,i.config_hash,
                   i.chunk_count,i.error_code,i.error_message,i.ready_at
            FROM public.ai_source_documents d
            LEFT JOIN LATERAL (SELECT x.* FROM public.ai_document_indexes x
              WHERE x.document_id=d.id AND x.document_revision=d.revision ORDER BY x.created_at DESC LIMIT 1) i ON true
            WHERE d.owner_user_id=? AND d.course_id=? AND d.deleted_at IS NULL
            ORDER BY d.created_at DESC
            """,user,course);
    }
    @SuppressWarnings("unchecked")
    public List<Map<String,Object>> upload(long user,long course,MultipartFile[] files)throws Exception{
        requireEnabled();requireCourse(user,course);
        if(files==null||files.length<1||files.length>5)throw new ApiException(HttpStatus.BAD_REQUEST,"Chọn từ 1 đến 5 tài liệu.");
        var result=new ArrayList<Map<String,Object>>();
        for(var file:files)result.add(uploadOne(user,course,file));
        return result;
    }
    @SuppressWarnings("unchecked")
    private Map<String,Object> uploadOne(long user,long course,MultipartFile file)throws Exception{
        String name=Objects.toString(file.getOriginalFilename(),"").strip();
        String mime=normalizedMime(name,file.getContentType());
        if(name.isBlank()||file.isEmpty())throw new ApiException(HttpStatus.BAD_REQUEST,"Tài liệu rỗng hoặc thiếu tên.");
        if(file.getSize()>20L*1024*1024)throw new ApiException(HttpStatus.PAYLOAD_TOO_LARGE,"Mỗi tài liệu tối đa 20 MB.");
        byte[] raw=file.getBytes();String sha=hex(MessageDigest.getInstance("SHA-256").digest(raw));
        var hit=bank.queryForList("""
            SELECT d.id,d.revision,d.original_name AS name,d.byte_size,d.status,i.id AS index_id,
                   i.status AS index_status,i.config_hash,i.chunk_count,i.ready_at,true AS cache_hit
            FROM public.ai_source_documents d JOIN public.ai_document_indexes i
              ON i.document_id=d.id AND i.document_revision=d.revision
            WHERE d.owner_user_id=? AND d.course_id=? AND d.file_sha256=? AND d.deleted_at IS NULL
              AND i.status='ready' AND i.ready_at IS NOT NULL
              AND i.chunk_count=(SELECT count(*) FROM public.ai_document_chunks c WHERE c.index_id=i.id)
            ORDER BY i.ready_at DESC LIMIT 1
            """,user,course,sha);
        if(!hit.isEmpty()){
            UUID hitId=UUID.fromString(hit.get(0).get("id").toString());
            var current=ai.reindexDocument(Map.of("documentId",hitId,"ownerUserId",user,"courseId",course));
            var response=detail(user,course,hitId);
            response.put("cache_hit",current.path("cacheHit").asBoolean(false));
            response.put("preparation_ms",current.path("preparationMs").asLong(0));
            return response;
        }
        var existing=bank.queryForList("""
            SELECT id,revision FROM public.ai_source_documents
            WHERE owner_user_id=? AND course_id=? AND file_sha256=? AND deleted_at IS NULL LIMIT 1
            """,user,course,sha);
        if(!existing.isEmpty()){
            UUID existingId=UUID.fromString(existing.get(0).get("id").toString());
            int existingRevision=((Number)existing.get(0).get("revision")).intValue();
            var extracted=ai.extract(new MultipartFile[]{file});
            var docs=(List<Map<String,Object>>)extracted.get("documents");
            if(docs==null||docs.size()!=1)throw new IllegalStateException("Extraction response mismatch");
            String text=Objects.toString(docs.get(0).get("extractedText"),"");
            ai.indexDocument(Map.of("documentId",existingId,"revision",existingRevision,"ownerUserId",user,"courseId",course,"extractedText",text));
            bank.update("UPDATE public.ai_source_documents SET status='active',error_code=null,updated_at=current_timestamp WHERE id=?",existingId);
            return detail(user,course,existingId);
        }
        UUID id=UUID.randomUUID();int revision=1;
        String ext=name.toLowerCase(Locale.ROOT).substring(name.lastIndexOf('.')+1);
        String objectKey=user+"/"+course+"/"+id+"/"+revision+"/"+sha+"."+ext;
        storage.put(objectKey,raw,mime);
        bank.update("""
            INSERT INTO public.ai_source_documents(id,revision,owner_user_id,course_id,original_name,mime_type,byte_size,file_sha256,storage_object_key)
            VALUES (?,?,?,?,?,?,?,?,?)
            """,id,revision,user,course,name,mime,raw.length,sha,objectKey);
        try{
            var extracted=ai.extract(new MultipartFile[]{file});
            var docs=(List<Map<String,Object>>)extracted.get("documents");
            if(docs==null||docs.size()!=1)throw new IllegalStateException("Extraction response mismatch");
            String text=Objects.toString(docs.get(0).get("extractedText"),"");
            ai.indexDocument(Map.of("documentId",id,"revision",revision,"ownerUserId",user,"courseId",course,"extractedText",text));
            bank.update("UPDATE public.ai_source_documents SET status='active',error_code=null,updated_at=current_timestamp WHERE id=?",id);
        }catch(Exception e){
            bank.update("UPDATE public.ai_source_documents SET status='failed',error_code='INDEXING_FAILED',updated_at=current_timestamp WHERE id=?",id);
            throw e;
        }
        return detail(user,course,id);
    }
    public Map<String,Object> detail(long user,long course,UUID id){
        requireEnabled();requireCourse(user,course);
        var rows=bank.queryForList("""
            SELECT d.id,d.revision,d.original_name AS name,d.mime_type,d.byte_size,d.status,d.created_at,d.updated_at,
                   i.id AS index_id,i.status AS index_status,i.config_hash,i.chunk_count,i.error_code,i.error_message,i.ready_at,false AS cache_hit
            FROM public.ai_source_documents d LEFT JOIN LATERAL
              (SELECT x.* FROM public.ai_document_indexes x WHERE x.document_id=d.id ORDER BY x.created_at DESC LIMIT 1)i ON true
            WHERE d.id=? AND d.owner_user_id=? AND d.course_id=? AND d.deleted_at IS NULL
            """,id,user,course);
        if(rows.isEmpty())throw new ApiException(HttpStatus.NOT_FOUND,"Không tìm thấy tài liệu.");
        return rows.get(0);
    }
    public Map<String,Object> reindex(long user,long course,UUID id)throws Exception{
        requireEnabled();requireCourse(user,course);detail(user,course,id);
        ai.reindexDocument(Map.of("documentId",id,"ownerUserId",user,"courseId",course));
        return detail(user,course,id);
    }
    public void softDelete(long user,long course,UUID id){
        requireEnabled();requireCourse(user,course);
        int changed=bank.update("""
            UPDATE public.ai_source_documents SET status='deleted',deleted_at=current_timestamp,updated_at=current_timestamp
            WHERE id=? AND owner_user_id=? AND course_id=? AND deleted_at IS NULL
            """,id,user,course);
        if(changed!=1)throw new ApiException(HttpStatus.NOT_FOUND,"Không tìm thấy tài liệu.");
    }
    public void validateRefs(long user,long course,List<AiDocumentRefDto> refs){
        requireEnabled();requireCourse(user,course);
        if(refs==null||refs.isEmpty()||refs.size()>5)throw new ApiException(HttpStatus.BAD_REQUEST,"Chọn từ 1 đến 5 tài liệu đã sẵn sàng.");
        if(refs.stream().map(AiDocumentRefDto::indexId).distinct().count()!=refs.size())throw new ApiException(HttpStatus.BAD_REQUEST,"Tài liệu được chọn bị trùng.");
        for(var ref:refs){
            Long count=bank.queryForObject("""
                SELECT count(*) FROM public.ai_source_documents d JOIN public.ai_document_indexes i
                  ON i.document_id=d.id AND i.document_revision=d.revision
                WHERE d.id=? AND d.revision=? AND d.owner_user_id=? AND d.course_id=? AND d.deleted_at IS NULL
                  AND d.status='active' AND i.id=? AND i.config_hash=? AND i.status='ready' AND i.ready_at IS NOT NULL
                  AND i.chunk_count>0 AND i.chunk_count=(SELECT count(*) FROM public.ai_document_chunks c WHERE c.index_id=i.id)
                """,Long.class,ref.documentId(),ref.revision(),user,course,ref.indexId(),ref.configHash());
            if(count==null||count!=1)throw new ApiException(HttpStatus.CONFLICT,"Tài liệu chưa ready, đã stale hoặc không còn quyền truy cập.");
        }
    }
    public boolean evidenceInRefs(List<AiDocumentRefDto> refs,String quote){
        if(refs==null||refs.isEmpty()||quote==null||quote.isBlank())return false;
        String normalized=quote.strip().replaceAll("\\s+"," ");
        for(var ref:refs){
            var texts=bank.queryForList("SELECT extracted_text FROM public.ai_document_indexes WHERE id=? AND status='ready'",String.class,ref.indexId());
            if(!texts.isEmpty()&&texts.get(0)!=null&&texts.get(0).replaceAll("\\s+"," ").contains(normalized))return true;
        }
        return false;
    }
    private static String normalizedMime(String name,String supplied){
        String lower=name.toLowerCase(Locale.ROOT);
        if(lower.endsWith(".pdf"))return "application/pdf";
        if(lower.endsWith(".docx"))return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
        if(lower.endsWith(".txt"))return "text/plain";
        throw new ApiException(HttpStatus.BAD_REQUEST,"Chỉ hỗ trợ PDF, DOCX và TXT.");
    }
    private static String hex(byte[] value){return HexFormat.of().formatHex(value);}
}
