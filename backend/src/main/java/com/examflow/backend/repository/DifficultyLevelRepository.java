package com.examflow.backend.repository;
import com.examflow.backend.entity.DifficultyLevel;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.Optional;
public interface DifficultyLevelRepository extends JpaRepository<DifficultyLevel,Short>{ Optional<DifficultyLevel> findByLevelOrder(Short levelOrder); }
