package com.examflow.backend.controller;

import java.util.Map;

import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.examflow.backend.entity.UserEntity;
import com.examflow.backend.repository.CourseRepository;
import com.examflow.backend.repository.ExamRepository;
import com.examflow.backend.repository.ExamSessionRepository;
import com.examflow.backend.repository.QuestionRepository;
import com.examflow.backend.service.CurrentUserService;

@RestController
@RequestMapping("/api/teacher/overview")
public class TeacherOverviewController {
 private final CurrentUserService users;
 private final CourseRepository courses;
 private final QuestionRepository questions;
 private final ExamRepository exams;
 private final ExamSessionRepository sessions;
 public TeacherOverviewController(CurrentUserService users,CourseRepository courses,QuestionRepository questions,ExamRepository exams,ExamSessionRepository sessions){this.users=users;this.courses=courses;this.questions=questions;this.exams=exams;this.sessions=sessions;}
 @GetMapping
 public Map<String,Object> overview(@AuthenticationPrincipal Jwt jwt){
  UserEntity u=users.getCurrentUser(jwt);
  var owned=courses.findByCreatedByOrderByIdAsc(u.getId());
  var ids=owned.stream().map(c->c.getId()).collect(java.util.stream.Collectors.toSet());
  long questionCount=owned.stream().mapToLong(c->questions.countByCourse_Id(c.getId())).sum();
  var ownedExams=exams.findAllByOrderByCreatedAtDesc().stream().filter(e->e.getCourse()!=null && ids.contains(e.getCourse().getId())).toList();
  var ownedExamIds=ownedExams.stream().map(e->e.getId()).collect(java.util.stream.Collectors.toSet());
  var ownedSessions=sessions.findAllWithDetails().stream().filter(s->ownedExamIds.contains(s.getExam().getId())).toList();
  return Map.of("courses",owned.size(),"questions",questionCount,"exams",ownedExams.size(),"sessions",ownedSessions.size(),"recentExams",ownedExams.stream().limit(5).map(e->Map.of("id",e.getId(),"title",e.getTitle(),"code",e.getCode())).toList());
 }
}
