package com.examflow.backend.dto;

public record StudentProfileDto(
        Long studentId,
        String username,
        String email,
        String fullName,
        String department,
        String status,
        boolean hasFacePhoto,
        String className
) {
    public StudentProfileDto(Long studentId,String username,String email,String fullName,String department,String status,boolean hasFacePhoto){this(studentId,username,email,fullName,department,status,hasFacePhoto,null);}
}
