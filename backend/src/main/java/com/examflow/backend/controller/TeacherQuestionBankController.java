package com.examflow.backend.controller;

import java.util.List;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;
import com.examflow.backend.dto.QuestionResponse;
import com.examflow.backend.dto.SaveQuestionRequest;
import com.examflow.backend.dto.AiGenerateRequest;
import com.examflow.backend.dto.AiQuestionDto;
import com.examflow.backend.service.TeacherQuestionBankService;
import com.examflow.backend.service.AiCreditsService;
import com.examflow.backend.service.CurrentUserService;
import jakarta.validation.Valid;

@RestController
@RequestMapping("/api/teacher/questions")
@Validated
public class TeacherQuestionBankController {
    @org.springframework.beans.factory.annotation.Autowired private com.examflow.backend.service.AutomaticExamService automatic;
    private final TeacherQuestionBankService service;
    private final AiCreditsService credits;
    private final CurrentUserService users;

    public TeacherQuestionBankController(TeacherQuestionBankService service, AiCreditsService credits, CurrentUserService users) {
        this.service = service;
        this.credits = credits;
        this.users = users;
    }

    @GetMapping public List<QuestionResponse> list(@RequestParam(required=false) Long courseId,@RequestParam(required=false) String status,@RequestParam(required=false) String search,@AuthenticationPrincipal Jwt jwt){return service.list(courseId,status,search,jwt);}
    @GetMapping("/preview")
    public TeacherQuestionBankService.PreviewPage preview(@RequestParam long courseId,
            @RequestParam(defaultValue="") String search,@RequestParam(defaultValue="") String difficulty,
            @RequestParam(defaultValue="") String chapter,@RequestParam(defaultValue="") String topic,
            @RequestParam(defaultValue="") String clo,@RequestParam(defaultValue="") String status,
            @RequestParam(defaultValue="0") int page,@RequestParam(defaultValue="20") int size,@AuthenticationPrincipal Jwt jwt) {
        var actor=users.getCurrentUser(jwt);
        if(!List.of("teacher","faculty","admin").contains(actor.getRole()))throw new org.springframework.web.server.ResponseStatusException(HttpStatus.FORBIDDEN);
        automatic.requireCourse(actor,courseId);
        return service.preview(courseId,new TeacherQuestionBankService.PreviewFilter(search,difficulty,chapter,topic,clo,status),page,size);
    }
    @GetMapping("/{id}") public QuestionResponse get(@PathVariable long id,@AuthenticationPrincipal Jwt jwt){return service.get(id,jwt);}
    @PostMapping @ResponseStatus(HttpStatus.CREATED) public QuestionResponse create(@Valid @RequestBody SaveQuestionRequest r,@AuthenticationPrincipal Jwt jwt){return service.create(r,jwt);}
    @PutMapping("/{id}") public QuestionResponse update(@PathVariable long id,@Valid @RequestBody SaveQuestionRequest r,@AuthenticationPrincipal Jwt jwt){return service.update(id,r,jwt);}
    @PatchMapping("/{id}/status") public QuestionResponse status(@PathVariable long id,@RequestBody Map<String,String> body,@AuthenticationPrincipal Jwt jwt){return service.setStatus(id,body.get("status"),jwt);}
    @DeleteMapping("/{id}") @ResponseStatus(HttpStatus.NO_CONTENT) public void delete(@PathVariable long id,@AuthenticationPrincipal Jwt jwt){service.delete(id,jwt);}

    @PostMapping("/ai-generate")
    @ResponseStatus(HttpStatus.ACCEPTED)
    public Map<String,Object> generateQuestions(@AuthenticationPrincipal Jwt jwt, @RequestParam java.util.UUID idempotencyKey, @Valid @RequestBody AiGenerateRequest request) {
        var user = users.getCurrentUser(jwt);
        if (!List.of("teacher", "faculty", "admin").contains(user.getRole().toLowerCase(java.util.Locale.ROOT)))
            throw new org.springframework.web.server.ResponseStatusException(HttpStatus.FORBIDDEN, "Chỉ giảng viên được sử dụng AI Credits.");
        return credits.create(user.getId(), idempotencyKey, request);
    }
}
