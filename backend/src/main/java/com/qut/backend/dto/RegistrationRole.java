package com.qut.backend.dto;

public enum RegistrationRole {
    STUDENT("student"),
    TEACHER("teacher");

    private final String keycloakRole;

    RegistrationRole(String keycloakRole) {
        this.keycloakRole = keycloakRole;
    }

    public String getKeycloakRole() {
        return keycloakRole;
    }
}