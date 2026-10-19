package com.examflow.backend.controller;
import com.examflow.backend.service.*;
import com.examflow.backend.dto.CreateExamSessionRequest;
import com.examflow.backend.dto.TeacherExamSessionDto;
import com.examflow.backend.exception.ApiException;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
@RestController @RequestMapping("/api/teacher/exam-sessions")
public class TeacherExamSessionController {
 private final ExamOrganizationService organization; private final CurrentUserService users;
 private final TeacherExamSessionService service;private final AdminWorkspaceService workspace;
 public TeacherExamSessionController(ExamOrganizationService organization,CurrentUserService users,TeacherExamSessionService service,AdminWorkspaceService workspace){this.organization=organization;this.users=users;this.service=service;this.workspace=workspace;}
 private com.examflow.backend.entity.UserEntity actor(Jwt jwt){var user=users.getCurrentUser(jwt);if(!java.util.Set.of("admin","teacher","faculty").contains(user.getRole()))throw new ApiException(HttpStatus.FORBIDDEN,"Yêu cầu quyền giảng viên");return user;}
 @GetMapping public java.util.List<TeacherExamSessionDto> list(@AuthenticationPrincipal Jwt jwt){
  var viewer=actor(jwt);return service.list().stream().filter(s->{try{organization.requireExamCourse(viewer,s.examId());return true;}catch(ApiException denied){if(denied.getStatus()!=HttpStatus.FORBIDDEN)throw denied;return false;}}).toList();
 }
 @PostMapping public TeacherExamSessionDto create(@AuthenticationPrincipal Jwt jwt,@RequestBody CreateExamSessionRequest request){
  if(request.examId()==null)throw new ApiException(HttpStatus.BAD_REQUEST,"Cần chọn đề thi");
  organization.requireExamCourse(actor(jwt),request.examId());return service.create(request);
 }
 @PatchMapping("/{id}/status") public TeacherExamSessionDto status(@AuthenticationPrincipal Jwt jwt,@PathVariable long id,@RequestParam String value){
  var viewer=actor(jwt);var session=service.list().stream().filter(s->s.id().equals(id)).findFirst().orElseThrow(()->new ApiException(HttpStatus.NOT_FOUND,"Không tìm thấy ca thi"));
  organization.requireExamCourse(viewer,session.examId());workspace.updateSessionStatus(viewer.getId(),id,value);
  return service.list().stream().filter(s->s.id().equals(id)).findFirst().orElseThrow();
 }
}
