package com.examflow.backend.service;

import com.examflow.backend.entity.UserEntity;
import com.examflow.backend.exception.ApiException;
import jakarta.persistence.*;
import jakarta.validation.constraints.*;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.text.Collator;
import java.util.*;

/** Shared period creation and ordering helpers. Course enrollment and sequential batch allocation are retired. */
@Service
@Transactional
public class CourseAllocationService {
    @org.springframework.beans.factory.annotation.Autowired private AdminCodeGenerator codes;
    @PersistenceContext private EntityManager em;
    private final AdminService audit;
    public CourseAllocationService(AdminService audit){this.audit=audit;}
    public record PeriodInput(@Size(max=50) String code,@NotBlank @Size(max=150) String name){}
    public Map<String,Object> period(UserEntity actor,PeriodInput input){
        if(!ExamOrganizationService.isAdmin(actor))throw new ApiException(HttpStatus.FORBIDDEN,"Chỉ admin được tạo đợt thi");
        String code=input.code()==null||input.code().isBlank()?codes.next(AdminCodeGenerator.Kind.PERIOD):input.code().trim().toUpperCase(Locale.ROOT);
        long existing=((Number)em.createNativeQuery("SELECT COUNT(*) FROM exam_periods WHERE lower(code)=lower(:code)").setParameter("code",code).getSingleResult()).longValue();
        if(existing>0)throw new ApiException(HttpStatus.CONFLICT,"Mã đợt thi đã tồn tại");
        long id=((Number)em.createNativeQuery("INSERT INTO exam_periods(code,name,created_by) VALUES(:code,:name,:actor) RETURNING id").setParameter("code",code).setParameter("name",input.name().trim()).setParameter("actor",actor.getId()).getSingleResult()).longValue();
        audit.audit(actor.getId(),"CREATE_EXAM_PERIOD","EXAM_PERIOD",id,"code="+code);
        return Map.of("id",id,"code",code,"name",input.name().trim());
    }
    static String normalizedName(Object name){return name==null?"":name.toString().trim().replaceAll("\\s+"," ");}
    static String givenName(Object name){String full=normalizedName(name);return full.substring(full.lastIndexOf(' ')+1);}
    static String familyNames(Object name){String full=normalizedName(name);int split=full.lastIndexOf(' ');return split<0?"":full.substring(0,split);}
    static Comparator<Map<String,Object>> studentOrder(){
        Collator vi=Collator.getInstance(Locale.forLanguageTag("vi-VN"));vi.setStrength(Collator.SECONDARY);vi.setDecomposition(Collator.CANONICAL_DECOMPOSITION);
        return (a,b)->{int compared=vi.compare(givenName(a.get("name")),givenName(b.get("name")));if(compared==0)compared=vi.compare(familyNames(a.get("name")),familyNames(b.get("name")));if(compared==0)compared=Objects.toString(a.get("username"),"").compareTo(Objects.toString(b.get("username"),""));if(compared==0)compared=Long.compare(((Number)a.get("id")).longValue(),((Number)b.get("id")).longValue());return compared;};
    }
    static String hash(String value){try{return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8)));}catch(Exception failure){throw new IllegalStateException(failure);}}
}
