package com.examflow.backend.dto;

public enum RegistrationRole {

    STUDENT("STUDENT"),
    TEACHER("TEACHER");

    private final String keycloakRole;

    RegistrationRole(String keycloakRole) {
        this.keycloakRole = keycloakRole;
    }

    public String getKeycloakRole() {
        return keycloakRole;
    }
}