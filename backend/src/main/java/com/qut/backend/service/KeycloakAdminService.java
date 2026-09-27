package com.qut.backend.service;

import java.net.URI;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Service;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;

import com.qut.backend.dto.RegisterRequest;

@Service
public class KeycloakAdminService {

    private final RestClient restClient;

    @Value("${keycloak.server-url}")
    private String serverUrl;

    @Value("${keycloak.realm}")
    private String realm;

    @Value("${keycloak.admin-client-id}")
    private String clientId;

    @Value("${keycloak.admin-client-secret}")
    private String clientSecret;

    public KeycloakAdminService(RestClient.Builder builder) {
        this.restClient = builder.build();
    }

    private String getAdminAccessToken() {

        MultiValueMap<String, String> form = new LinkedMultiValueMap<>();

        form.add("grant_type", "client_credentials");
        form.add("client_id", clientId);
        form.add("client_secret", clientSecret);

        try {

            Map<?, ?> response = restClient.post()
                    .uri(
                            serverUrl
                                    + "/realms/"
                                    + realm
                                    + "/protocol/openid-connect/token"
                    )
                    .contentType(MediaType.APPLICATION_FORM_URLENCODED)
                    .body(form)
                    .retrieve()
                    .body(Map.class);

            if (response == null || response.get("access_token") == null) {
                throw new IllegalStateException(
                        "Cannot obtain Keycloak admin token"
                );
            }

            return response.get("access_token").toString();

        } catch (RestClientResponseException e) {

            System.err.println("===== KEYCLOAK TOKEN ERROR =====");
            System.err.println("Status: " + e.getStatusCode());
            System.err.println("Body: " + e.getResponseBodyAsString());

            throw new IllegalStateException(
                    "Cannot obtain Keycloak admin token: "
                            + e.getResponseBodyAsString(),
                    e
            );
        }
    }

    public void createUser(RegisterRequest request) {

        String adminToken = getAdminAccessToken();

        String username = resolveUsername(request);

        String[] names = resolveName(request, username);

        String firstName = names[0];
        String lastName = names[1];

        Map<String, Object> credential = new HashMap<>();

        credential.put("type", "password");
        credential.put("value", request.password());
        credential.put("temporary", false);

        Map<String, Object> user = new HashMap<>();

        user.put("username", username);
        user.put(
                "email",
                request.email()
                        .trim()
                        .toLowerCase(Locale.ROOT)
        );

        user.put("firstName", firstName);
        user.put("lastName", lastName);
        user.put("enabled", true);

        // Chưa có email verification flow thì để false
        user.put("emailVerified", false);

        user.put(
                "credentials",
                List.of(credential)
        );

        String userId = null;

        try {

            System.out.println(
                    "Creating Keycloak user: " + username
            );

            ResponseEntity<Void> response = restClient.post()
                    .uri(
                            serverUrl
                                    + "/admin/realms/"
                                    + realm
                                    + "/users"
                    )
                    .header(
                            HttpHeaders.AUTHORIZATION,
                            "Bearer " + adminToken
                    )
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(user)
                    .retrieve()
                    .toBodilessEntity();

            URI location = response.getHeaders().getLocation();

            if (location == null) {
                throw new IllegalStateException(
                        "Keycloak did not return Location header"
                );
            }

            String path = location.getPath();

            userId = path.substring(
                    path.lastIndexOf('/') + 1
            );

            System.out.println(
                    "Keycloak user created successfully. ID: "
                            + userId
            );

            String roleName =
                    request.role().getKeycloakRole();

            System.out.println(
                    "Assigning Keycloak role: " + roleName
            );

            assignRealmRole(
                    userId,
                    roleName,
                    adminToken
            );

            System.out.println(
                    "Registration completed successfully."
            );

        } catch (Exception e) {

            System.err.println(
                    "===== KEYCLOAK REGISTER ERROR ====="
            );

            System.err.println(e.getMessage());

            /*
             * User đã tạo nhưng assign role lỗi
             * => rollback user.
             *
             * Tránh trường hợp frontend báo fail
             * nhưng Keycloak vẫn còn account.
             */
            if (userId != null) {

                try {

                    System.err.println(
                            "Rolling back Keycloak user: "
                                    + userId
                    );

                    deleteUser(
                            userId,
                            adminToken
                    );

                } catch (Exception deleteException) {

                    System.err.println(
                            "Rollback failed: "
                                    + deleteException.getMessage()
                    );
                }
            }

            if (e instanceof RestClientResponseException restException) {

                System.err.println(
                        "Status: "
                                + restException.getStatusCode()
                );

                System.err.println(
                        "Response: "
                                + restException.getResponseBodyAsString()
                );

                throw new IllegalStateException(
                        "Keycloak request failed: "
                                + restException.getStatusCode()
                                + " - "
                                + restException.getResponseBodyAsString(),
                        restException
                );
            }

            throw new IllegalStateException(
                    "Register failed: " + e.getMessage(),
                    e
            );
        }
    }

    private String resolveUsername(
            RegisterRequest request
    ) {

        if (
                request.username() != null
                        && !request.username().isBlank()
        ) {

            return request.username().trim();
        }

        String email = request.email().trim();

        int atIndex = email.indexOf('@');

        if (atIndex > 0) {
            return email.substring(0, atIndex);
        }

        return email;
    }

    private String[] resolveName(
            RegisterRequest request,
            String username
    ) {

        String firstName = "";
        String lastName = "";

        if (
                request.fullName() != null
                        && !request.fullName().isBlank()
        ) {

            String fullName =
                    request.fullName()
                            .trim()
                            .replaceAll("\\s+", " ");

            int lastSpaceIndex =
                    fullName.lastIndexOf(' ');

            if (lastSpaceIndex > 0) {

                lastName =
                        fullName
                                .substring(
                                        0,
                                        lastSpaceIndex
                                )
                                .trim();

                firstName =
                        fullName
                                .substring(
                                        lastSpaceIndex + 1
                                )
                                .trim();

            } else {

                firstName = fullName;
            }

        } else {

            firstName =
                    request.firstName() != null
                            && !request.firstName().isBlank()
                            ? request.firstName().trim()
                            : username;

            lastName =
                    request.lastName() != null
                            ? request.lastName().trim()
                            : "";
        }

        return new String[]{
                firstName,
                lastName
        };
    }

    private void assignRealmRole(
            String userId,
            String roleName,
            String adminToken
    ) {

        try {

            Map<?, ?> role = restClient.get()
                    .uri(
                            serverUrl
                                    + "/admin/realms/"
                                    + realm
                                    + "/roles/"
                                    + roleName
                    )
                    .header(
                            HttpHeaders.AUTHORIZATION,
                            "Bearer " + adminToken
                    )
                    .retrieve()
                    .body(Map.class);

            if (role == null) {
                throw new IllegalStateException(
                        "Realm role not found: "
                                + roleName
                );
            }

            restClient.post()
                    .uri(
                            serverUrl
                                    + "/admin/realms/"
                                    + realm
                                    + "/users/"
                                    + userId
                                    + "/role-mappings/realm"
                    )
                    .header(
                            HttpHeaders.AUTHORIZATION,
                            "Bearer " + adminToken
                    )
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(List.of(role))
                    .retrieve()
                    .toBodilessEntity();

        } catch (RestClientResponseException e) {

            System.err.println(
                    "===== ROLE ASSIGNMENT ERROR ====="
            );

            System.err.println(
                    "Role: " + roleName
            );

            System.err.println(
                    "Status: " + e.getStatusCode()
            );

            System.err.println(
                    "Body: "
                            + e.getResponseBodyAsString()
            );

            throw e;
        }
    }

    private void deleteUser(
            String userId,
            String adminToken
    ) {

        restClient.delete()
                .uri(
                        serverUrl
                                + "/admin/realms/"
                                + realm
                                + "/users/"
                                + userId
                )
                .header(
                        HttpHeaders.AUTHORIZATION,
                        "Bearer " + adminToken
                )
                .retrieve()
                .toBodilessEntity();
    }
}