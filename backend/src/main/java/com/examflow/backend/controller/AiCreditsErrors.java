package com.examflow.backend.controller;

import org.springframework.http.ResponseEntity;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.web.multipart.support.MissingServletRequestPartException;
import org.springframework.web.multipart.MaxUploadSizeExceededException;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;
import java.util.Map;

@RestControllerAdvice(assignableTypes=AiCreditsController.class)
@Order(Ordered.HIGHEST_PRECEDENCE)
public class AiCreditsErrors {
    @ExceptionHandler(MissingServletRequestPartException.class)
    public ResponseEntity<Map<String,String>> missingFile(MissingServletRequestPartException error) {
        return ResponseEntity.badRequest().body(Map.of("message","Thiếu dữ liệu bắt buộc. Hãy gửi tài liệu trong trường files."));
    }
    @ExceptionHandler(MaxUploadSizeExceededException.class)
    public ResponseEntity<Map<String,String>> tooLarge(MaxUploadSizeExceededException error) {
        return ResponseEntity.status(413).body(Map.of("message","Tài liệu vượt giới hạn upload: tối đa 20 MB/file và 101 MB/yêu cầu."));
    }
    @ExceptionHandler(ResponseStatusException.class)
    public ResponseEntity<Map<String,String>> status(ResponseStatusException error) {
        return ResponseEntity.status(error.getStatusCode()).body(
            Map.of("message",error.getReason()==null?"Không xử lý được yêu cầu AI Credits.":error.getReason()));
    }
}
