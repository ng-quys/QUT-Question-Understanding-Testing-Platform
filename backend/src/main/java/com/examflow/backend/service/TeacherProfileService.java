package com.examflow.backend.service;
import com.examflow.backend.entity.UserEntity;
import com.examflow.backend.service.CurrentUserService;
import com.examflow.backend.repository.UserRepository;
import com.examflow.backend.dto.*;
import org.springframework.http.HttpStatus;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;
@Service
public class TeacherProfileService {
 private final CurrentUserService currentUser;
 private final UserRepository repository;
 public TeacherProfileService(CurrentUserService currentUser,UserRepository repository){this.currentUser=currentUser;this.repository=repository;}
 public TeacherProfileResponse get(Jwt jwt){return TeacherProfileResponse.from(currentUser.getCurrentUser(jwt));}
 public TeacherProfileResponse update(Jwt jwt,UpdateTeacherProfileRequest req){
  UserEntity user=currentUser.getCurrentUser(jwt);
  if(req.name()!=null){String name=req.name().trim();if(name.isEmpty()||name.length()>150)throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"Tên không hợp lệ");user.setFullName(name);}
  if(req.department()!=null){String department=req.department().trim();if(department.length()>150)throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"Tên khoa quá dài");user.setDepartment(department);}
  return TeacherProfileResponse.from(repository.save(user));
 }
}
