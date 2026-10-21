package com.examflow.backend.repository;

import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;

import com.examflow.backend.entity.UserEntity;

public interface UserRepository extends JpaRepository<UserEntity, Long> {
    @org.springframework.data.jpa.repository.Lock(jakarta.persistence.LockModeType.PESSIMISTIC_WRITE)
    @org.springframework.data.jpa.repository.Query("select u from UserEntity u where lower(u.username)=lower(:username)")
    Optional<UserEntity> findForLogin(@org.springframework.data.repository.query.Param("username") String username);
    @org.springframework.data.jpa.repository.Lock(jakarta.persistence.LockModeType.PESSIMISTIC_WRITE)
    @org.springframework.data.jpa.repository.Query("select u from UserEntity u where u.id = :id")
    Optional<UserEntity> findForPhotoUpdate(@org.springframework.data.repository.query.Param("id") Long id);

    Optional<UserEntity> findByEmailIgnoreCaseOrUsernameIgnoreCase(
            String email,
            String username
    );

    Optional<UserEntity> findByKeycloakUserId(String keycloakUserId);

    Optional<UserEntity> findByEmailIgnoreCase(String email);

    boolean existsByUsernameIgnoreCase(String username);
}
