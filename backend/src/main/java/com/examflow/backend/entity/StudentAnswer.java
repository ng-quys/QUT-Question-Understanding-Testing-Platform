package com.examflow.backend.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;
import java.math.BigDecimal;
import java.time.LocalDateTime;

@Entity
@Table(name = "student_answers")
@Getter @Setter
public class StudentAnswer {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "attempt_id", nullable = false)
    private ExamAttempt attempt;
    @Column(name = "question_id", nullable = false)
    private Long questionId;
    @Column(name = "selected_answer_id")
    private Long selectedAnswerId;
    @Column(name = "is_correct")
    private Boolean correct;
    @Column(name = "points_awarded", nullable = false)
    private BigDecimal pointsAwarded;
    @Column(name = "answered_at", nullable = false)
    private LocalDateTime answeredAt;
}
