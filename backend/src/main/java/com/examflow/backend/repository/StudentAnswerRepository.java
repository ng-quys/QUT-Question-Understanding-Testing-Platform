package com.examflow.backend.repository;

import com.examflow.backend.entity.StudentAnswer;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface StudentAnswerRepository extends JpaRepository<StudentAnswer, Long> {
    Optional<StudentAnswer> findByAttemptIdAndQuestionId(Long attemptId, Long questionId);

    @Query("""
        select sa from StudentAnswer sa
        where sa.attempt.id = :attemptId
        order by sa.questionId asc
    """)
    List<StudentAnswer> findByAttemptIdWithDetails(@Param("attemptId") Long attemptId);
}
