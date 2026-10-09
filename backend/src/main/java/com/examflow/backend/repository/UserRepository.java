package com.examflow.backend.repository;

import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;

import com.examflow.backend.entity.UserEntity;

public interface UserRepository extends JpaRepository<UserEntity, Long> {

    Optional<UserEntity> findByEmailIgnoreCaseOrUsernameIgnoreCase(
            String email,
            String username
    );

    Optional<UserEntity> findByKeycloakUserId(String keycloakUserId);

    Optional<UserEntity> findByEmailIgnoreCase(String email);

    boolean existsByUsernameIgnoreCase(String username);
}
