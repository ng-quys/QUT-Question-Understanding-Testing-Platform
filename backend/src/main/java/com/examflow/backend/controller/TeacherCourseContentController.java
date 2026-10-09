package com.examflow.backend.controller;

import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;
import com.examflow.backend.dto.*;
import com.examflow.backend.service.TeacherCourseContentService;

@RestController
@RequestMapping("/api/teacher/courses/{courseId}")
public class TeacherCourseContentController {
    private final TeacherCourseContentService service;
    public TeacherCourseContentController(TeacherCourseContentService service) { this.service = service; }

    @GetMapping("/structure") public List<CourseChapterDto> structure(@PathVariable long courseId, @AuthenticationPrincipal Jwt jwt) { return service.getStructure(courseId, jwt); }
    @PostMapping("/chapters") @ResponseStatus(HttpStatus.CREATED) public CourseChapterDto createChapter(@PathVariable long courseId, @RequestBody CreateChapterRequest r, @AuthenticationPrincipal Jwt jwt) { return service.createChapter(courseId, r, jwt); }
    @PutMapping("/chapters/{chapterId}") public CourseChapterDto updateChapter(@PathVariable long courseId, @PathVariable long chapterId, @RequestBody UpdateChapterRequest r, @AuthenticationPrincipal Jwt jwt) { return service.updateChapter(courseId, chapterId, r, jwt); }
    @DeleteMapping("/chapters/{chapterId}") @ResponseStatus(HttpStatus.NO_CONTENT) public void deleteChapter(@PathVariable long courseId, @PathVariable long chapterId, @AuthenticationPrincipal Jwt jwt) { service.deleteChapter(courseId, chapterId, jwt); }

    @PostMapping("/chapters/{chapterId}/topics") @ResponseStatus(HttpStatus.CREATED) public CourseTopicDto createTopic(@PathVariable long courseId, @PathVariable long chapterId, @RequestBody CreateTopicRequest r, @AuthenticationPrincipal Jwt jwt) { return service.createTopic(courseId, chapterId, r, jwt); }
    @PutMapping("/chapters/{chapterId}/topics/{topicId}") public CourseTopicDto updateTopic(@PathVariable long courseId, @PathVariable long chapterId, @PathVariable long topicId, @RequestBody UpdateTopicRequest r, @AuthenticationPrincipal Jwt jwt) { return service.updateTopic(courseId, chapterId, topicId, r, jwt); }
    @DeleteMapping("/chapters/{chapterId}/topics/{topicId}") @ResponseStatus(HttpStatus.NO_CONTENT) public void deleteTopic(@PathVariable long courseId, @PathVariable long chapterId, @PathVariable long topicId, @AuthenticationPrincipal Jwt jwt) { service.deleteTopic(courseId, chapterId, topicId, jwt); }

    @GetMapping("/clos") public List<CourseCloDto> clos(@PathVariable long courseId, @AuthenticationPrincipal Jwt jwt) { return service.getClos(courseId, jwt); }
    @PostMapping("/clos") @ResponseStatus(HttpStatus.CREATED) public CourseCloDto createClo(@PathVariable long courseId, @RequestBody SaveCourseCloRequest r, @AuthenticationPrincipal Jwt jwt) { return service.createClo(courseId, r, jwt); }
    @PutMapping("/clos/{cloId}") public CourseCloDto updateClo(@PathVariable long courseId, @PathVariable long cloId, @RequestBody SaveCourseCloRequest r, @AuthenticationPrincipal Jwt jwt) { return service.updateClo(courseId, cloId, r, jwt); }
    @DeleteMapping("/clos/{cloId}") @ResponseStatus(HttpStatus.NO_CONTENT) public void deleteClo(@PathVariable long courseId, @PathVariable long cloId, @AuthenticationPrincipal Jwt jwt) { service.deleteClo(courseId, cloId, jwt); }
}
