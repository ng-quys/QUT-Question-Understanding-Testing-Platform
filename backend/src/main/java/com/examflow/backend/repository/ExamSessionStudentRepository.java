package com.examflow.backend.repository;

import com.examflow.backend.entity.ExamSessionStudent;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface ExamSessionStudentRepository extends JpaRepository<ExamSessionStudent, Long> {
    @Query("""
        select ess from ExamSessionStudent ess
        join fetch ess.examSession s
        join fetch s.exam e
        join fetch e.course c
        where ess.student.id = :studentId
        order by s.startTime desc
    """)
    List<ExamSessionStudent> findAllByStudentIdWithDetails(@Param("studentId") Long studentId);

    @Query("""
        select ess from ExamSessionStudent ess
        join fetch ess.examSession s
        join fetch s.exam e
        where ess.student.id = :studentId and s.id = :sessionId
    """)
    Optional<ExamSessionStudent> findRegistration(@Param("studentId") Long studentId,
                                                   @Param("sessionId") Long sessionId);
}
