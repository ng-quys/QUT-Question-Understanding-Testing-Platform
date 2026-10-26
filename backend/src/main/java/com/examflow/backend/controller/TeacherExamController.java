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
 @org.springframework.beans.factory.annotation.Autowired private AutomaticExamService automatic;
 @GetMapping("/automatic/courses") public List<AutomaticExamDto.CourseChoice> automaticCourses(@AuthenticationPrincipal Jwt jwt){return automatic.availableCourses(actor(jwt));}
 @GetMapping("/automatic/bank") public AutomaticExamDto.Bank bank(@AuthenticationPrincipal Jwt jwt,@RequestParam long courseId){automatic.requireCourse(actor(jwt),courseId);return automatic.bank(courseId);}
 @PostMapping("/automatic/check") public AutomaticExamDto.Check check(@AuthenticationPrincipal Jwt jwt,@Valid @RequestBody AutomaticExamDto.Request r){automatic.requireCourse(actor(jwt),r.courseId());return automatic.check(r);}
 @PostMapping("/automatic/preview") public AutomaticExamDto.Preview preview(@AuthenticationPrincipal Jwt jwt,@Valid @RequestBody AutomaticExamDto.Request r){var a=actor(jwt);automatic.requireCourse(a,r.courseId());return automatic.generate(a.getId(),r);}
 @PostMapping("/automatic/save") public java.util.Map<String,Object> save(@AuthenticationPrincipal Jwt jwt,@Valid @RequestBody AutomaticExamDto.Save r){var a=actor(jwt);automatic.requireCourse(a,automatic.previewCourse(a.getId(),r.previewId()));var ids=automatic.save(a.getId(),r.previewId());return java.util.Map.of("examIds",ids,"examCodes",automatic.savedCodes(ids));}
 private final TeacherExamService service;private final ExamOrganizationService organization;private final CurrentUserService users;private final AdminCatalogService catalog;
 public TeacherExamController(TeacherExamService service,ExamOrganizationService organization,CurrentUserService users,AdminCatalogService catalog){this.service=service;this.organization=organization;this.users=users;this.catalog=catalog;}
 private UserEntity actor(Jwt jwt){var user=users.getCurrentUser(jwt);if(!java.util.Set.of("admin","teacher","faculty").contains(user.getRole()))throw new com.examflow.backend.exception.ApiException(org.springframework.http.HttpStatus.FORBIDDEN,"Yêu cầu quyền giảng viên");return user;}
 @GetMapping public List<ExamSummaryDto> list(@AuthenticationPrincipal Jwt jwt){UserEntity actor=actor(jwt);var allowed=automatic.availableCourses(actor).stream().map(AutomaticExamDto.CourseChoice::id).collect(java.util.stream.Collectors.toSet());return service.list().stream().filter(e->allowed.contains(e.courseId())).toList();}
 @PatchMapping("/{id}/status") public ExamSummaryDto status(@AuthenticationPrincipal Jwt jwt,@PathVariable Long id,@RequestParam String value){var actor=actor(jwt);organization.requireExamCourse(actor,id);organization.requireUnusedExam(id);return service.setStatus(id,value);}
 @DeleteMapping("/{id}") @ResponseStatus(org.springframework.http.HttpStatus.NO_CONTENT) public void delete(@AuthenticationPrincipal Jwt jwt,@PathVariable Long id){var actor=actor(jwt);organization.requireExamCourse(actor,id);catalog.delete(actor.getId(),"exams",id);}
 @PostMapping("/quick") public QuickExamResult quick(@AuthenticationPrincipal Jwt jwt,@Valid @RequestBody QuickExamRequest request){organization.requireCourse(actor(jwt),request.courseId());return service.createQuick(request,actor(jwt).getId());}
}
