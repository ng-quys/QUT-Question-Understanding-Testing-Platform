package com.examflow.backend.controller;

import jakarta.persistence.PersistenceException;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;
import java.sql.SQLException;
import java.util.Map;

@RestControllerAdvice(assignableTypes={AdminCatalogController.class,ExamOrganizationController.class,CourseAllocationController.class,DepartmentExamController.class})
@org.springframework.core.annotation.Order(org.springframework.core.Ordered.HIGHEST_PRECEDENCE)
public class AdminCatalogExceptionHandler {
    @ExceptionHandler(org.springframework.http.converter.HttpMessageNotReadableException.class)
    public ResponseEntity<Map<String,Object>> invalidBody(org.springframework.http.converter.HttpMessageNotReadableException error){
        return response(HttpStatus.BAD_REQUEST,"Dữ liệu thiếu hoặc sai định dạng. Kiểm tra thời gian, mã định danh và số lượng sinh viên.");
    }
    @ExceptionHandler({DataIntegrityViolationException.class,PersistenceException.class})
    public ResponseEntity<Map<String,Object>> integrity(RuntimeException error) {
        for(Throwable cause=error;cause!=null;cause=cause.getCause()) {
            if(cause instanceof SQLException sql && "23505".equals(sql.getSQLState()))
                return response(HttpStatus.CONFLICT,"Mã đã được sử dụng ở phiên khác. Vui lòng tải lại hoặc chọn mã khác.");
            if(cause instanceof SQLException sql && "23503".equals(sql.getSQLState()))
                return response(HttpStatus.CONFLICT,"Bản ghi đang được sử dụng hoặc dữ liệu liên quan đã thay đổi. Vui lòng tải lại danh sách.");
        }
        return response(HttpStatus.SERVICE_UNAVAILABLE,"Chưa lưu được dữ liệu quản trị. Vui lòng kiểm tra kết nối và thử lại.");
    }
    private ResponseEntity<Map<String,Object>> response(HttpStatus status,String message) {
        return ResponseEntity.status(status).body(Map.of("status",status.value(),"message",message));
    }
}
