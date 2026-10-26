package com.examflow.backend.controller;

import com.examflow.backend.dto.CourseOutline;
import com.examflow.backend.service.CourseOutlineExtractionService;
import com.examflow.backend.service.CourseOutlineImportService;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

@RestController
@RequestMapping("/api/teacher/courses/outline")
public class CourseOutlineController {
    private final CourseOutlineExtractionService extraction;
    private final CourseOutlineImportService importer;
    public CourseOutlineController(CourseOutlineExtractionService extraction,CourseOutlineImportService importer) {this.extraction=extraction;this.importer=importer;}
    @PostMapping(value="/extract",consumes="multipart/form-data")
    public CourseOutline extract(@AuthenticationPrincipal Jwt jwt,@RequestParam("file") MultipartFile file) {
        importer.authorize(jwt);return extraction.extract(file);
    }
    @PostMapping("/preview")
    public CourseOutline.Plan preview(@AuthenticationPrincipal Jwt jwt,@RequestBody CourseOutline outline) {return importer.preview(jwt,outline);}
    @PostMapping("/confirm")
    public CourseOutline.Plan confirm(@AuthenticationPrincipal Jwt jwt,@RequestBody CourseOutline.Confirmation request) {return importer.confirm(jwt,request);}
}
