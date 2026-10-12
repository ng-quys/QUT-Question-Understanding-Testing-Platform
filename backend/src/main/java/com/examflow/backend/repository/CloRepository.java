package com.examflow.backend.repository;

import org.springframework.data.jpa.repository.JpaRepository;

import com.examflow.backend.entity.Clo;

public interface CloRepository extends JpaRepository<Clo, Long> {
    long countByCourse_Id(Long courseId);
}
