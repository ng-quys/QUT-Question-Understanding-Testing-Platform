package com.examflow.backend.controller;

import com.examflow.backend.dto.QuickExamRequest;
import com.examflow.backend.service.*;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;
import java.util.Map;

@RestController
@RequestMapping("/api/admin/catalog")
public class AdminCatalogController {
    @org.springframework.beans.factory.annotation.Autowired private AdminExamContentService content;
    private final AdminCatalogService catalog;
    private final AdminIdentityService identity;
    public AdminCatalogController(AdminCatalogService catalog,AdminIdentityService identity){this.catalog=catalog;this.identity=identity;}
    @GetMapping("/options") public Map<String,Object> options(@AuthenticationPrincipal Jwt jwt){identity.requireAdmin(jwt);return catalog.options();}
    @GetMapping("/{resource}/{id}") public Map<String,Object> detail(@AuthenticationPrincipal Jwt jwt,@PathVariable String resource,@PathVariable Long id){identity.requireAdmin(jwt);return catalog.detail(resource,id);}
    @PostMapping("/courses") public Map<String,Object> createCourse(@AuthenticationPrincipal Jwt jwt,@Valid @RequestBody AdminCatalogService.CourseInput r){return catalog.course(identity.requireAdmin(jwt).getId(),null,new AdminCatalogService.CourseInput(null,r.name(),r.credits(),r.department(),r.description(),r.teacherId(),r.status()));}
    @PutMapping("/courses/{id}") public Map<String,Object> editCourse(@AuthenticationPrincipal Jwt jwt,@PathVariable Long id,@Valid @RequestBody AdminCatalogService.CourseInput r){return catalog.course(identity.requireAdmin(jwt).getId(),id,new AdminCatalogService.CourseInput(null,r.name(),r.credits(),r.department(),r.description(),r.teacherId(),r.status()));}
    @PostMapping("/exams") public Map<String,Object> createExam(@AuthenticationPrincipal Jwt jwt,@Valid @RequestBody AdminCatalogService.QuickExamInput r){return catalog.createExam(identity.requireAdmin(jwt).getId(),r.request());}
    @GetMapping("/exams/{id}/review") public Map<String,Object> reviewExam(@AuthenticationPrincipal Jwt jwt,@PathVariable Long id){identity.requireAdmin(jwt);return catalog.reviewExam(id);}
    @PostMapping("/exams/{id}/close") public Map<String,Object> closeExam(@AuthenticationPrincipal Jwt jwt,@PathVariable Long id){return catalog.closeExam(identity.requireAdmin(jwt).getId(),id);}
    @PutMapping("/exams/{id}/content") public Map<String,Object> content(@AuthenticationPrincipal Jwt jwt,@PathVariable Long id,@Valid @RequestBody AdminExamContentService.Input input){return content.save(identity.requireAdmin(jwt).getId(),id,input,false);}
    @PostMapping("/exams/{id}/revision") public Map<String,Object> revision(@AuthenticationPrincipal Jwt jwt,@PathVariable Long id,@Valid @RequestBody AdminExamContentService.Input input){return content.save(identity.requireAdmin(jwt).getId(),id,input,true);}
    @PutMapping("/exams/{id}") public Map<String,Object> editExam(@AuthenticationPrincipal Jwt jwt,@PathVariable Long id,@Valid @RequestBody AdminCatalogService.ExamInput r){return catalog.exam(identity.requireAdmin(jwt).getId(),id,new AdminCatalogService.ExamInput(null,r.title(),r.shuffleQuestions(),r.shuffleAnswers()));}
    @PostMapping("/sessions") public Map<String,Object> createSession(@AuthenticationPrincipal Jwt jwt,@Valid @RequestBody AdminCatalogService.SessionInput r){return catalog.session(identity.requireAdmin(jwt).getId(),null,new AdminCatalogService.SessionInput(r.examId(),r.name(),null,r.classId(),r.startTime(),r.endTime()));}
    @PutMapping("/sessions/{id}") public Map<String,Object> editSession(@AuthenticationPrincipal Jwt jwt,@PathVariable Long id,@Valid @RequestBody AdminCatalogService.SessionInput r){return catalog.session(identity.requireAdmin(jwt).getId(),id,new AdminCatalogService.SessionInput(r.examId(),r.name(),null,r.classId(),r.startTime(),r.endTime()));}
    @DeleteMapping("/{resource}/{id}") public ResponseEntity<Void> delete(@AuthenticationPrincipal Jwt jwt,@PathVariable String resource,@PathVariable Long id){catalog.delete(identity.requireAdmin(jwt).getId(),resource,id);return ResponseEntity.noContent().build();}
}
