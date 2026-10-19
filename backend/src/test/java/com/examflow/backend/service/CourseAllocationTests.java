package com.examflow.backend.service;

import org.junit.jupiter.api.Test;
import java.time.LocalDateTime;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;

class CourseAllocationTests {
    Map<String,Object> student(long id,String code,String name){return Map.of("id",id,"username",code,"name",name);}
    @Test void vietnameseOrderUsesGivenNameThenFamilyNamesThenStudentCode(){
        var rows=new ArrayList<>(List.of(student(1,"0000000002","Nguyễn Văn An"),student(2,"0000000001","Nguyễn Văn An"),student(3,"0000000003","Lê Bình"),student(4,"0000000004","Trần Đạt"),student(5,"0000000005","Nguyễn Duy"),student(6,"0000000006","Lê Ánh")));
        rows.sort(CourseAllocationService.studentOrder());assertEquals(List.of(2L,1L,6L,3L,5L,4L),rows.stream().map(r->r.get("id")).toList());
    }
    @Test void splitKeepsAllStudentsInOneCommonTimeWindow(){
        var students=new ArrayList<Map<String,Object>>();for(int i=0;i<100;i++)students.add(student(i,String.format("%010d",i),"Sinh viên "+i));
        var start=LocalDateTime.of(2027,1,1,7,0);var input=new DepartmentExamService.Input(UUID.randomUUID(),1L,2L,"CNTT","Cuối kỳ",start,start.plusHours(1),30,null);
        var result=DepartmentExamService.split(students,input);assertEquals(4,result.size());assertEquals(start,result.get(3).get("startTime"));assertEquals(start.plusHours(1),result.get(3).get("endTime"));
        var counts=result.stream().map(r->((List<?>)r.get("students")).size()).toList();assertEquals(List.of(30,30,30,10),counts);
        var combined=new ArrayList<>();result.forEach(r->combined.addAll((List<?>)r.get("students")));assertEquals(students,combined);
    }
}
