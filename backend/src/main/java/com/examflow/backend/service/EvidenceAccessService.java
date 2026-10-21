package com.examflow.backend.service;

import com.examflow.backend.entity.ExamAttempt;
import com.examflow.backend.entity.UserEntity;
import com.examflow.backend.exception.ApiException;
import com.examflow.backend.repository.ExamAttemptRepository;
import com.examflow.backend.repository.UserRepository;
import org.springframework.http.HttpStatus;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.util.List;
import java.util.Map;
import java.util.Set;

@Service
public class EvidenceAccessService {
    @jakarta.persistence.PersistenceContext private jakarta.persistence.EntityManager em;
    private final UserRepository users;
    private final ExamAttemptRepository attempts;
    private final AdminIdentityService admins;
    public EvidenceAccessService(UserRepository users, ExamAttemptRepository attempts, AdminIdentityService admins) { this.users=users; this.attempts=attempts; this.admins=admins; }
    private boolean role(Jwt jwt,String name) {
        Map<String,Object> access = jwt.getClaim("realm_access");
        return access != null && access.get("roles") instanceof List<?> roles && roles.stream().anyMatch(item -> name.equalsIgnoreCase(String.valueOf(item)));
    }
    @Transactional
    public UserEntity actor(Jwt jwt) {
        if (jwt == null) throw new ApiException(HttpStatus.UNAUTHORIZED,"Chưa đăng nhập");
        if (role(jwt,"ADMIN")) return admins.requireAdmin(jwt);
        if (!role(jwt,"TEACHER")) throw new ApiException(HttpStatus.FORBIDDEN,"Chỉ giảng viên hoặc admin được xem bằng chứng");
        if (jwt.getSubject() == null || jwt.getSubject().isBlank()) throw new ApiException(HttpStatus.FORBIDDEN,"Danh tính giảng viên không hợp lệ");
        // Never link an evidence viewer using an unverified email fallback.
        UserEntity user = new CurrentUserService(users).getCurrentUser(jwt);
        if (!"active".equals(user.getStatus()) || !Set.of("teacher","faculty").contains(user.getRole()))
            throw new ApiException(HttpStatus.FORBIDDEN,"Tài khoản không có quyền xem bằng chứng");
        return user;
    }
    private boolean canRead(UserEntity viewer,ExamAttempt attempt) {
        if(attempt.getExamSession()==null)return false;
        return ((Number)em.createNativeQuery("SELECT COUNT(*) FROM exam_sessions s WHERE s.id=:session AND s.published_at IS NOT NULL AND (EXISTS(SELECT 1 FROM exam_sitting_groups g WHERE g.session_id=s.id AND g.teacher_id=:actor) OR (NOT EXISTS(SELECT 1 FROM exam_sitting_groups g WHERE g.session_id=s.id) AND EXISTS(SELECT 1 FROM exam_room_teachers rt WHERE rt.room_id=s.room_id AND rt.teacher_id=:actor)))")
            .setParameter("session",attempt.getExamSession().getId()).setParameter("actor",viewer.getId()).getSingleResult()).longValue()>0;
    }
    @Transactional
    public ExamAttempt require(Jwt jwt,Long attemptId) {
        UserEntity viewer = actor(jwt);
        ExamAttempt attempt = attempts.findById(attemptId).orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND,"Không tìm thấy lượt thi"));
        if (!"admin".equals(viewer.getRole()) && !canRead(viewer,attempt))
            throw new ApiException(HttpStatus.FORBIDDEN,"Bạn không phụ trách học phần của lượt thi này");
        return attempt;
    }
}
