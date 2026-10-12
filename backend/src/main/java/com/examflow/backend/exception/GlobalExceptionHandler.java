package com.examflow.backend.exception;

import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import jakarta.servlet.http.HttpServletRequest;

@RestControllerAdvice
public class GlobalExceptionHandler {

    private static final Logger log =
            LoggerFactory.getLogger(GlobalExceptionHandler.class);

    @ExceptionHandler(ApiException.class)
    public ResponseEntity<Map<String, Object>> handleApi(
            ApiException ex,
            HttpServletRequest request
    ) {
        log.warn(
                "API error while processing {} {}: {}",
                request.getMethod(),
                request.getRequestURI(),
                ex.getMessage()
        );

        return build(
                ex.getStatus(),
                ex.getMessage(),
                request.getRequestURI()
        );
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<Map<String, Object>> handleValidation(
            MethodArgumentNotValidException ex,
            HttpServletRequest request
    ) {
        String message = ex.getBindingResult()
                .getFieldErrors()
                .stream()
                .findFirst()
                .map(err ->
                        err.getField() + ": " + err.getDefaultMessage()
                )
                .orElse("Dữ liệu không hợp lệ");

        log.warn(
                "Validation error while processing {} {}: {}",
                request.getMethod(),
                request.getRequestURI(),
                message
        );

        return build(
                HttpStatus.BAD_REQUEST,
                message,
                request.getRequestURI()
        );
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<Map<String, Object>> handleOther(
            Exception ex,
            HttpServletRequest request
    ) {
        // Quan trọng:
        // truyền "ex" vào Logger để in toàn bộ stack trace.
        log.error(
                "Unhandled exception while processing {} {}",
                request.getMethod(),
                request.getRequestURI(),
                ex
        );

        return build(
                HttpStatus.INTERNAL_SERVER_ERROR,
                "Có lỗi xảy ra khi xử lý yêu cầu",
                request.getRequestURI()
        );
    }

    private ResponseEntity<Map<String, Object>> build(
            HttpStatus status,
            String message,
            String path
    ) {
        Map<String, Object> body = new LinkedHashMap<>();

        body.put("timestamp", Instant.now().toString());
        body.put("status", status.value());
        body.put("error", status.getReasonPhrase());
        body.put("message", message);
        body.put("path", path);

        return ResponseEntity.status(status).body(body);
    }
}