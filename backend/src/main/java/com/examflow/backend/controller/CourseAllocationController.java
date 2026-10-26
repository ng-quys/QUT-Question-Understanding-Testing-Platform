package com.examflow.backend.controller;

import com.examflow.backend.service.*;
import com.examflow.backend.exception.ApiException;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.*;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.http.HttpStatus;

@RestController
@RequestMapping("/api/admin/organization/allocation")
public class CourseAllocationController {
    private final CourseAllocationService service;private final CurrentUserService users;
    public CourseAllocationController(CourseAllocationService service,CurrentUserService users){this.service=service;this.users=users;}
    @PostMapping("/periods") public java.util.Map<String,Object> period(@AuthenticationPrincipal Jwt jwt,@Valid @RequestBody CourseAllocationService.PeriodInput input){return service.period(users.getCurrentUser(jwt),new CourseAllocationService.PeriodInput(null,input.name()));}
    @RequestMapping({"/options","/candidates","/preview","/batches","/courses/{id}/students"})
    public void retired(){throw new ApiException(HttpStatus.GONE,"Luồng gán môn và chia ca nối tiếp đã ngừng sử dụng. Vào Ca thi theo khoa để chia nhóm cùng giờ.");}
}
