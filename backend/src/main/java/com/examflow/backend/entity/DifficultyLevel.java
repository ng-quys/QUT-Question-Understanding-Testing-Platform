package com.examflow.backend.entity;
import jakarta.persistence.*;
import lombok.Getter;
@Entity @Table(name="difficulty_levels") @Getter
public class DifficultyLevel {
 @Id private Short id;
 @Column(nullable=false,unique=true) private String code;
 @Column(nullable=false) private String name;
 @Column(name="level_order",nullable=false,unique=true) private Short levelOrder;
}
