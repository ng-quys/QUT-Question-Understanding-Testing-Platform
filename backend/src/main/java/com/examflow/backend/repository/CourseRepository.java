package com.examflow.backend.repository;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;

import com.examflow.backend.entity.Course;

public interface CourseRepository
        extends JpaRepository<Course, Long> {

    List<Course> findByCreatedByOrderByIdAsc(
            Long createdBy
    );

    boolean existsByCodeIgnoreCase(
            String code
    );
}