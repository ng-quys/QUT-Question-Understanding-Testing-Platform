package com.examflow.backend.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;
import java.math.BigDecimal;
import java.time.LocalDateTime;

@Entity
@Table(name = "exams")
@Getter @Setter
public class Exam {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "course_id", nullable = false)
    private Course course;
    @Column(nullable = false, unique = true)
    private String code;
    @Column(nullable = false)
    private String title;
    @Column(name = "duration_minutes", nullable = false)
    private Integer durationMinutes;
    @Column(name = "total_questions", nullable = false)
    private Integer totalQuestions;
    @Column(name = "total_points", nullable = false)
    private BigDecimal totalPoints;
    @Column(nullable = false)
    private String status;
    @Column(name = "exam_date")
    private LocalDateTime examDate;
    @Column(name = "shuffle_questions", nullable = false)
    private Boolean shuffleQuestions;
    @Column(name = "shuffle_answers", nullable = false)
    private Boolean shuffleAnswers;
    @Column(name = "anti_cheat_mode", nullable = false)
    private Boolean antiCheatMode;
}
