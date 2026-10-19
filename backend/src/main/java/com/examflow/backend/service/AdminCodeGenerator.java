package com.examflow.backend.service;

import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import org.springframework.stereotype.Service;
import com.examflow.backend.exception.ApiException;
import org.springframework.http.HttpStatus;
import java.util.Locale;

/** Codes are reserved by PostgreSQL, never by a browser or MAX(code)+1. */
@Service
public class AdminCodeGenerator {
    @PersistenceContext private EntityManager em;
    public enum Kind {
        STUDENT("student", "200", "users", "username", 7),
        TEACHER("teacher", "300", "users", "username", 7),
        COURSE("course", "MH", "courses", "code", 2),
        EXAM("exam", "DE", "exams", "code", 2),
        CLASS("class", "L", "student_classes", "code", 2),
        PERIOD("period", "DT", "exam_periods", "code", 2);
        final String sequence, prefix, table, column;
        final int digits;
        Kind(String sequence, String prefix, String table, String column, int digits) {
            this.sequence=sequence; this.prefix=prefix; this.table=table; this.column=column; this.digits=digits;
        }
    }
    public String next(Kind kind) {
        // Skip legacy/imported codes that predate the sequence. Enum values are fixed SQL identifiers.
        for (int attempt=0; attempt<10000; attempt++) {
            long number=((Number)em.createNativeQuery("SELECT nextval('public.admin_"+kind.sequence+"_code_seq')").getSingleResult()).longValue();
            String code=kind.prefix+String.format(Locale.ROOT,"%0"+kind.digits+"d",number);
            long occupied=((Number)em.createNativeQuery("SELECT COUNT(*) FROM "+kind.table+" WHERE lower("+kind.column+")=lower(:code)")
                    .setParameter("code",code).getSingleResult()).longValue();
            if(occupied==0) return code;
        }
        throw new ApiException(HttpStatus.CONFLICT,"Chưa cấp được mã tự động. Vui lòng thử lại.");
    }
}
