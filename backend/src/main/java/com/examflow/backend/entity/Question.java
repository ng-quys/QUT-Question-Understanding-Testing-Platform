package com.examflow.backend.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;
import java.math.BigDecimal;

@Entity
@Table(name = "questions")
@Getter @Setter
public class Question {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "course_id", nullable = false)
    private Course course;
    @Column(name = "chapter_id")
    private Long chapterId;
    @Column(name = "topic_id")
    private Long topicId;
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "clo_id")
    private Clo clo;
    @Column(name = "cognitive_level_id", nullable = false)
    private Short cognitiveLevelId;
    @Column(name = "difficulty_level_id", nullable = false)
    private Short difficultyLevelId;
    @Column(nullable = false, columnDefinition = "text")
    private String content;
    @Column(columnDefinition = "text")
    private String explanation;
    @Column(nullable = false)
    private String status;
    @Column(nullable = false)
    private String source;
    @Column(name = "default_score", nullable = false)
    private BigDecimal defaultScore;
}
