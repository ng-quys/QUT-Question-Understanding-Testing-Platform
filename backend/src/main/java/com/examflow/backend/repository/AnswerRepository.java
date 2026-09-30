package com.examflow.backend.repository;

import com.examflow.backend.entity.Answer;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface AnswerRepository extends JpaRepository<Answer, Long> {
    List<Answer> findByQuestionIdOrderByPositionAsc(Long questionId);
    Optional<Answer> findByIdAndQuestionId(Long id, Long questionId);
}
