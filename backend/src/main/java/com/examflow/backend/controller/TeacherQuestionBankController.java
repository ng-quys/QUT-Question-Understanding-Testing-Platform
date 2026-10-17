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
import com.examflow.backend.service.AiGenerationService;
import jakarta.validation.Valid;

@RestController
@RequestMapping("/api/teacher/questions")
@Validated
public class TeacherQuestionBankController {
    private final TeacherQuestionBankService service;
    private final AiGenerationService aiGenerationService;

    public TeacherQuestionBankController(TeacherQuestionBankService service, AiGenerationService aiGenerationService) {
        this.service = service;
        this.aiGenerationService = aiGenerationService;
    }

    @GetMapping public List<QuestionResponse> list(@RequestParam(required=false) Long courseId,@RequestParam(required=false) String status,@RequestParam(required=false) String search,@AuthenticationPrincipal Jwt jwt){return service.list(courseId,status,search,jwt);}
    @GetMapping("/{id}") public QuestionResponse get(@PathVariable long id,@AuthenticationPrincipal Jwt jwt){return service.get(id,jwt);}
    @PostMapping @ResponseStatus(HttpStatus.CREATED) public QuestionResponse create(@Valid @RequestBody SaveQuestionRequest r,@AuthenticationPrincipal Jwt jwt){return service.create(r,jwt);}
    @PutMapping("/{id}") public QuestionResponse update(@PathVariable long id,@Valid @RequestBody SaveQuestionRequest r,@AuthenticationPrincipal Jwt jwt){return service.update(id,r,jwt);}
    @PatchMapping("/{id}/status") public QuestionResponse status(@PathVariable long id,@RequestBody Map<String,String> body,@AuthenticationPrincipal Jwt jwt){return service.setStatus(id,body.get("status"),jwt);}
    @DeleteMapping("/{id}") @ResponseStatus(HttpStatus.NO_CONTENT) public void delete(@PathVariable long id,@AuthenticationPrincipal Jwt jwt){service.delete(id,jwt);}

    @PostMapping("/ai-generate")
    public List<AiQuestionDto> generateQuestions(@Valid @RequestBody AiGenerateRequest request) {
        return aiGenerationService.generate(request);
    }
}
