package com.examflow.backend.repository;

import com.examflow.backend.entity.ExamAttempt;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface ExamAttemptRepository extends JpaRepository<ExamAttempt, Long> {
    Optional<ExamAttempt> findByExamSessionIdAndStudentId(Long examSessionId, Long studentId);

    @Query("""
        select a from ExamAttempt a
        join fetch a.exam e
        join fetch e.course c
        join fetch a.examSession s
        where a.student.id = :studentId
        order by a.startedAt desc
    """)
    List<ExamAttempt> findAllByStudentIdWithDetails(@Param("studentId") Long studentId);

    @Query("""
        select a from ExamAttempt a
        join fetch a.exam e
        join fetch e.course c
        join fetch a.examSession s
        where a.id = :attemptId and a.student.id = :studentId
    """)
    Optional<ExamAttempt> findOwnedAttempt(@Param("attemptId") Long attemptId,
                                           @Param("studentId") Long studentId);
}
