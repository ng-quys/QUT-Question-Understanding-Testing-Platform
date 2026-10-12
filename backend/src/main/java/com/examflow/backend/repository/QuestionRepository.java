package com.examflow.backend.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import com.examflow.backend.entity.Question;
import java.util.List;

public interface QuestionRepository extends JpaRepository<Question, Long> {
    long countByCourse_Id(Long courseId);

    @Query("""
      select q from Question q
      left join fetch q.clo
      where q.course.id = :courseId and q.status = 'approved'
        and (:cloIdsEmpty = true or q.clo.id in :cloIds)
    """)
    List<Question> findApprovedPool(@Param("courseId") Long courseId,
                                    @Param("cloIds") List<Long> cloIds,
                                    @Param("cloIdsEmpty") boolean cloIdsEmpty);
}
