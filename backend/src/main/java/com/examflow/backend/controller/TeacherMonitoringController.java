package com.examflow.backend.controller;
import com.examflow.backend.entity.UserEntity;
import com.examflow.backend.exception.ApiException;
import com.examflow.backend.service.*;
import org.springframework.web.bind.annotation.*;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import java.util.*;
@RestController
@RequestMapping("/api/teacher/monitoring")
public class TeacherMonitoringController {
    private final CurrentUserService users;private final ExamOrganizationService organization;
    public TeacherMonitoringController(CurrentUserService users,ExamOrganizationService organization){this.users=users;this.organization=organization;}
    private UserEntity actor(Jwt jwt){var u=users.getCurrentUser(jwt);if(!Set.of("teacher","faculty").contains(u.getRole())||!"active".equals(u.getStatus()))throw new ApiException(org.springframework.http.HttpStatus.FORBIDDEN,"Yêu cầu tài khoản giảng viên đang hoạt động.");return u;}
    @GetMapping("/sessions") public ExamOrganizationService.Page sessions(@AuthenticationPrincipal Jwt jwt,@RequestParam(defaultValue="true") boolean live,@RequestParam(defaultValue="") String q,@RequestParam(defaultValue="0") int page,@RequestParam(defaultValue="20") int size){return organization.monitoringSessions(actor(jwt),live,q,page,size);}
    @GetMapping("/warning-sessions") public ExamOrganizationService.Page warnings(@AuthenticationPrincipal Jwt jwt,@RequestParam(defaultValue="false") boolean live,@RequestParam(defaultValue="") String q,@RequestParam(defaultValue="0") int page,@RequestParam(defaultValue="20") int size){return organization.warningSessions(actor(jwt),live,q,page,size);}
    @GetMapping("/warning-sessions/{id}") public Map<String,Object> warningDetail(@AuthenticationPrincipal Jwt jwt,@PathVariable long id){return organization.monitoringDetail(actor(jwt),id);}
    @GetMapping("/sessions/{id}") public Map<String,Object> detail(@AuthenticationPrincipal Jwt jwt,@PathVariable long id){return organization.monitoringDetail(actor(jwt),id);}
}
