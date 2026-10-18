package com.examflow.backend.repository;

import com.examflow.backend.entity.ExamQuestion;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import java.util.List;

public interface ExamQuestionRepository extends JpaRepository<ExamQuestion, Long> {
    @Query("""
        select eq from ExamQuestion eq
        where eq.exam.id = :examId order by eq.position asc
    """)
    List<ExamQuestion> findByExamIdWithQuestion(@Param("examId") Long examId);

    @Query("select eq.questionId from ExamQuestion eq where eq.exam.course.id = :courseId and eq.exam.id <> :examId")
    List<Long> findQuestionIdsOfOtherExams(@Param("courseId") Long courseId, @Param("examId") Long examId);

    @Query("select eq.exam.id, eq.questionId from ExamQuestion eq where eq.exam.course.id = :courseId")
    List<Object[]> findExamQuestionPairsByCourse(@Param("courseId") Long courseId);
}
