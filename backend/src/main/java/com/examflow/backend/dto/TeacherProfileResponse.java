package com.examflow.backend.dto;
import com.examflow.backend.entity.UserEntity;
public record TeacherProfileResponse(Long id,String name,String email,String department,String role,String username) {
 public static TeacherProfileResponse from(UserEntity u){return new TeacherProfileResponse(u.getId(),u.getFullName(),u.getEmail(),u.getDepartment(),u.getRole(),u.getUsername());}
}
