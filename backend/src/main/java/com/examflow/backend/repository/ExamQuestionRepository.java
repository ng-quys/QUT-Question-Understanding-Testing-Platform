package com.examflow.backend.repository;

import com.examflow.backend.entity.ExamQuestion;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface ExamQuestionRepository extends JpaRepository<ExamQuestion, Long> {
    @Query("""
        select eq from ExamQuestion eq
        join fetch eq.question q
        left join fetch q.clo
        where eq.exam.id = :examId
        order by eq.position asc
    """)
    List<ExamQuestion> findByExamIdWithQuestion(@Param("examId") Long examId);
}
