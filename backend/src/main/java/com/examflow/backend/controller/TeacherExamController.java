package com.examflow.backend.controller;
import com.examflow.backend.dto.*;
import com.examflow.backend.service.*;
import com.examflow.backend.entity.UserEntity;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.*;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import java.util.List;
@RestController @RequestMapping("/api/teacher/exams")
public class TeacherExamController {
 private final TeacherExamService service;private final ExamOrganizationService organization;private final CurrentUserService users;private final AdminCatalogService catalog;
 public TeacherExamController(TeacherExamService service,ExamOrganizationService organization,CurrentUserService users,AdminCatalogService catalog){this.service=service;this.organization=organization;this.users=users;this.catalog=catalog;}
 private UserEntity actor(Jwt jwt){var user=users.getCurrentUser(jwt);if(!java.util.Set.of("admin","teacher","faculty").contains(user.getRole()))throw new com.examflow.backend.exception.ApiException(org.springframework.http.HttpStatus.FORBIDDEN,"Yêu cầu quyền giảng viên");return user;}
 @GetMapping public List<ExamSummaryDto> list(@AuthenticationPrincipal Jwt jwt){UserEntity actor=actor(jwt);return service.list().stream().filter(e->organization.canUseCourse(actor,e.courseId())).toList();}
 @PatchMapping("/{id}/status") public ExamSummaryDto status(@AuthenticationPrincipal Jwt jwt,@PathVariable Long id,@RequestParam String value){var actor=actor(jwt);organization.requireExamCourse(actor,id);organization.requireUnusedExam(id);return service.setStatus(id,value);}
 @DeleteMapping("/{id}") @ResponseStatus(org.springframework.http.HttpStatus.NO_CONTENT) public void delete(@AuthenticationPrincipal Jwt jwt,@PathVariable Long id){var actor=actor(jwt);organization.requireExamCourse(actor,id);catalog.delete(actor.getId(),"exams",id);}
 @PostMapping("/quick") public QuickExamResult quick(@AuthenticationPrincipal Jwt jwt,@Valid @RequestBody QuickExamRequest request){organization.requireCourse(actor(jwt),request.courseId());return service.createQuick(request,actor(jwt).getId());}
}
