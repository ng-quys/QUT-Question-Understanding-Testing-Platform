package com.examflow.backend.repository;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;

import com.examflow.backend.entity.Exam;

public interface ExamRepository extends JpaRepository<Exam, Long> {

    List<Exam> findAllByOrderByCreatedAtDesc();

    Optional<Exam> findByCodeIgnoreCase(String code);

    boolean existsByCodeIgnoreCase(String code);
}