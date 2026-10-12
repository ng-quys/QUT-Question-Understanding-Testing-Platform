package com.examflow.backend.entity;
import jakarta.persistence.*; import lombok.Getter; import lombok.Setter; import java.time.LocalDateTime;
@Entity @Table(name="anti_cheat_events") @Getter @Setter
public class AntiCheatEvent { @Id @GeneratedValue(strategy=GenerationType.IDENTITY) private Long id; @ManyToOne(fetch=FetchType.LAZY) @JoinColumn(name="attempt_id",nullable=false) private ExamAttempt attempt; @Column(nullable=false) private String event; @Column(nullable=false) private Boolean active=true; @Column(name="occurred_at",insertable=false,updatable=false) private LocalDateTime occurredAt; }
