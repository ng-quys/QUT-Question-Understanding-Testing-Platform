package com.examflow.backend.repository;

import com.examflow.backend.entity.ExamSession;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Optional;

public interface ExamSessionRepository extends JpaRepository<ExamSession, Long> {
    /**
     * One public exam code is the student's join code.
     * If an exam has multiple sessions, prefer the currently active session,
     * otherwise the nearest scheduled session.
     */
    @Query("""
        select s from ExamSession s
        join fetch s.exam e
        join fetch e.course c
        where lower(e.code) = lower(:code)
          and lower(s.status) in ('scheduled', 'ongoing')
        order by
          case when s.startTime <= CURRENT_TIMESTAMP and s.endTime > CURRENT_TIMESTAMP then 0
               when s.startTime > CURRENT_TIMESTAMP then 1
               else 2 end,
          s.startTime asc
    """)
    Optional<ExamSession> findByExamCode(@Param("code") String code);
}
