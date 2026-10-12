package com.examflow.backend.repository;

import com.examflow.backend.entity.ExamSession;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

public interface ExamSessionRepository extends JpaRepository<ExamSession, Long> {
    @Query("select s from ExamSession s join fetch s.exam e join fetch e.course order by s.startTime desc")
    List<ExamSession> findAllWithDetails();

    @Query("select s from ExamSession s join fetch s.exam e join fetch e.course where s.id=?1")
    Optional<ExamSession> findWithDetails(Long id);

    boolean existsByRoomCodeIgnoreCase(String roomCode);
    Optional<ExamSession> findByRoomCodeIgnoreCase(String roomCode);
    boolean existsByExamIdAndNameIgnoreCaseAndStartTimeAndEndTime(
            Long examId, String name, LocalDateTime startTime, LocalDateTime endTime);

    // Return a list: one exam can have several sessions.
    @Query("""
        select s from ExamSession s
        join fetch s.exam e
        join fetch e.course c
        where lower(s.roomCode) = lower(:code)
          and lower(s.status) in ('scheduled', 'ongoing')
        order by s.startTime asc, s.id asc
    """)
    List<ExamSession> findJoinCandidatesByRoomCode(@Param("code") String code);
}
