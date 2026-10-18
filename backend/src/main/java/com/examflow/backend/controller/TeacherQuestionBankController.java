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
    private final TeacherQuestionBankService service;
    private final AiCreditsService credits;
    private final CurrentUserService users;

    public TeacherQuestionBankController(TeacherQuestionBankService service, AiCreditsService credits, CurrentUserService users) {
        this.service = service;
        this.credits = credits;
        this.users = users;
    }

    @GetMapping public List<QuestionResponse> list(@RequestParam(required=false) Long courseId,@RequestParam(required=false) String status,@RequestParam(required=false) String search,@AuthenticationPrincipal Jwt jwt){return service.list(courseId,status,search,jwt);}
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
