package com.examflow.backend.controller;

import com.examflow.backend.entity.UserEntity;
import com.examflow.backend.exception.ApiException;
import com.examflow.backend.service.*;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;
import java.util.Map;

@RestController
@RequestMapping("/api/admin/organization")
public class ExamOrganizationController {
    private final ExamOrganizationService service;private final CurrentUserService users;
    public ExamOrganizationController(ExamOrganizationService service,CurrentUserService users){this.service=service;this.users=users;}
    private UserEntity actor(Jwt jwt){UserEntity user=users.getCurrentUser(jwt);if(!java.util.Set.of("admin","teacher","faculty").contains(user.getRole()))throw new ApiException(HttpStatus.FORBIDDEN,"Không có quyền tổ chức thi");return user;}
    @GetMapping("/bootstrap") public Map<String,Object> bootstrap(@AuthenticationPrincipal Jwt jwt){return service.bootstrap(actor(jwt));}
    @GetMapping("/students") public ExamOrganizationService.Page students(@AuthenticationPrincipal Jwt jwt,@RequestParam(defaultValue="") String q,@RequestParam(required=false) Long classId,@RequestParam(defaultValue="") String department,@RequestParam(defaultValue="0") int page,@RequestParam(defaultValue="20") int size){return service.students(actor(jwt),q,classId,department,page,size);}
    @GetMapping("/rooms/{id}") public Map<String,Object> room(@AuthenticationPrincipal Jwt jwt,@PathVariable long id){return service.roomDetail(actor(jwt),id);}
    @PostMapping("/rooms") public void room(@AuthenticationPrincipal Jwt jwt,@Valid @RequestBody ExamOrganizationService.RoomInput input){service.saveRoom(actor(jwt),null,new ExamOrganizationService.RoomInput(null,input.name(),input.status(),input.capacity()));}
    @PutMapping("/rooms/{id}") public void room(@AuthenticationPrincipal Jwt jwt,@PathVariable long id,@Valid @RequestBody ExamOrganizationService.RoomInput input){service.saveRoom(actor(jwt),id,input);}
    @DeleteMapping("/rooms/{id}") public void deleteRoom(@AuthenticationPrincipal Jwt jwt,@PathVariable long id){service.deleteRoom(actor(jwt),id);}
    @PostMapping("/rooms/{id}/members") public void members(@AuthenticationPrincipal Jwt jwt,@PathVariable long id,@Valid @RequestBody ExamOrganizationService.Ids input){service.members(actor(jwt),id,input,false);}
    @DeleteMapping("/rooms/{id}/members") public void remove(@AuthenticationPrincipal Jwt jwt,@PathVariable long id,@Valid @RequestBody ExamOrganizationService.Ids input){service.members(actor(jwt),id,input,true);}
    @PutMapping("/rooms/{id}/teachers") public void teachers(@AuthenticationPrincipal Jwt jwt,@PathVariable long id,@Valid @RequestBody ExamOrganizationService.Ids input){service.teachers(actor(jwt),id,input);}
    @PostMapping("/classes") public void schoolClass(@AuthenticationPrincipal Jwt jwt,@Valid @RequestBody ExamOrganizationService.ClassInput input){service.saveClass(actor(jwt),null,new ExamOrganizationService.ClassInput(null,input.name(),input.department(),input.status()));}
    @PutMapping("/classes/{id}") public void schoolClass(@AuthenticationPrincipal Jwt jwt,@PathVariable long id,@Valid @RequestBody ExamOrganizationService.ClassInput input){service.saveClass(actor(jwt),id,new ExamOrganizationService.ClassInput(null,input.name(),input.department(),input.status()));}
    @DeleteMapping("/classes/{id}") public void deleteClass(@AuthenticationPrincipal Jwt jwt,@PathVariable long id){service.deleteClass(actor(jwt),id);}
    @PutMapping("/students/{id}/profile") public void profile(@AuthenticationPrincipal Jwt jwt,@PathVariable long id,@Valid @RequestBody ExamOrganizationService.ProfileInput input){service.profile(actor(jwt),id,input);}
    @GetMapping("/sessions") public ExamOrganizationService.Page sessions(@AuthenticationPrincipal Jwt jwt,@RequestParam(defaultValue="false") boolean live,@RequestParam(defaultValue="") String q,@RequestParam(defaultValue="0") int page,@RequestParam(defaultValue="20") int size){return service.sessions(actor(jwt),live,q,page,size);}
    @GetMapping("/sessions/{id}") public Map<String,Object> session(@AuthenticationPrincipal Jwt jwt,@PathVariable long id){return service.detail(actor(jwt),id);}
    @PostMapping("/sessions") public Map<String,Object> create(@AuthenticationPrincipal Jwt jwt,@Valid @RequestBody ExamOrganizationService.SessionInput input){return service.saveSession(actor(jwt),null,input);}
    @PutMapping("/sessions/{id}") public Map<String,Object> edit(@AuthenticationPrincipal Jwt jwt,@PathVariable long id,@Valid @RequestBody ExamOrganizationService.SessionInput input){return service.saveSession(actor(jwt),id,input);}
    @PostMapping("/sessions/{id}/publish") public Map<String,Object> publish(@AuthenticationPrincipal Jwt jwt,@PathVariable long id){return service.publish(actor(jwt),id);}
    @PatchMapping("/sessions/{id}/status") public Map<String,Object> status(@AuthenticationPrincipal Jwt jwt,@PathVariable long id,@RequestParam String value){return service.status(actor(jwt),id,value);}
    @PatchMapping("/sessions/{id}/ai-policy") public Map<String,Object> aiPolicy(@AuthenticationPrincipal Jwt jwt,@PathVariable long id,@RequestParam boolean enabled){return service.aiPolicy(actor(jwt),id,enabled);}
}
