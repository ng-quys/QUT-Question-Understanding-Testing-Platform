package com.examflow.backend.controller;
import com.examflow.backend.exception.ApiException;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;
@RestController
@RequestMapping("/api/student/exams")
public class StudentJoinController {
    @PostMapping({"/search","/join"}) public void closed() {
        throw new ApiException(HttpStatus.GONE,"Không còn tham gia bằng mã. Chỉ có thể vào ca thi được nhà trường phân công.");
    }
}
