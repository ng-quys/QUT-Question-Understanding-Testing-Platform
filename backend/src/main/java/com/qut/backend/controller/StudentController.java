package com.qut.backend.controller;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;


@RestController
@RequestMapping("/api/student")
public class StudentController {

    @GetMapping("/hello")
    public String hello() {
        return "Hello Student!";
    }
}