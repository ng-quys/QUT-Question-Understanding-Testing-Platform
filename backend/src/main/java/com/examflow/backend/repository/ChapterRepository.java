package com.examflow.backend.repository;

import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;
import org.springframework.data.repository.query.Param;

import com.examflow.backend.entity.Course;

public interface ChapterRepository extends Repository<Course, Long> {

    @Query(
        value = "SELECT COUNT(*) FROM chapters WHERE course_id = :courseId",
        nativeQuery = true
    )
    long countByCourseId(@Param("courseId") Long courseId);
}