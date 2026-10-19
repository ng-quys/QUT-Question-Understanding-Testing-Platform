package com.examflow.backend.service;

import java.net.URI;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Service;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;

import com.examflow.backend.dto.RegisterRequest;

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
        var requests=new org.springframework.http.client.SimpleClientHttpRequestFactory();
        requests.setConnectTimeout(java.time.Duration.ofSeconds(5));
        requests.setReadTimeout(java.time.Duration.ofSeconds(15));
        this.restClient = builder.requestFactory(requests).build();
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
            System.err.println("Body: " + "Keycloak request failed");

            throw new IllegalStateException(
                    "Cannot obtain Keycloak admin token: "
                            + "Keycloak request failed",
                    e
            );
        }
    }

    public String createUser(RegisterRequest request) {

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
return userId;
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
                                + "Keycloak request failed"
                );

                throw new IllegalStateException(
                        "Keycloak request failed: "
                                + restException.getStatusCode()
                                + " - "
                                + "Keycloak request failed",
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

    public void assignRealmRole(
            String userId,
            String roleName
    ) {
        String adminToken = getAdminAccessToken();
        assignRealmRole(userId, roleName, adminToken);
    }

    public void requireManagedAccount(String userId) {
        String token = getAdminAccessToken();
        List<?> roles = restClient.get().uri(serverUrl + "/admin/realms/" + realm + "/users/" + userId + "/role-mappings/realm/composite")
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + token).retrieve().body(List.class);
        if (roles != null && roles.stream().anyMatch(role -> role instanceof Map<?, ?> map && "ADMIN".equalsIgnoreCase(String.valueOf(map.get("name")))))
            throw new com.examflow.backend.exception.ApiException(org.springframework.http.HttpStatus.BAD_REQUEST, "Tài khoản quản trị cần được quản lý trực tiếp trong Keycloak");
    }
    public boolean usernameExists(String username) {
        String token=getAdminAccessToken();
        List<?> matches=restClient.get().uri(serverUrl+"/admin/realms/"+realm+"/users?username={username}&exact=true",username)
                .header(HttpHeaders.AUTHORIZATION,"Bearer "+token).retrieve().body(List.class);
        return matches!=null&&!matches.isEmpty();
    }
    /** Explicit administrator repair only; never infer an identity from a login email. */
    public String findProvisionedAccount(String username,String email,String expectedRole) {
        String token=getAdminAccessToken();
        List<?> matches=restClient.get().uri(serverUrl+"/admin/realms/"+realm+"/users?username={username}&exact=true",username)
                .header(HttpHeaders.AUTHORIZATION,"Bearer "+token).retrieve().body(List.class);
        if(matches==null||matches.size()!=1||!(matches.get(0) instanceof Map<?,?> user)
                ||!username.equalsIgnoreCase(String.valueOf(user.get("username")))
                ||!email.equalsIgnoreCase(String.valueOf(user.get("email")))||!Boolean.TRUE.equals(user.get("enabled")))
            throw new com.examflow.backend.exception.ApiException(org.springframework.http.HttpStatus.CONFLICT,"Không tìm thấy đúng một tài khoản Keycloak đang hoạt động khớp tên đăng nhập và email. Cần đối chiếu thủ công.");
        String id=String.valueOf(user.get("id"));
        List<?> roles=restClient.get().uri(serverUrl+"/admin/realms/"+realm+"/users/"+id+"/role-mappings/realm/composite")
                .header(HttpHeaders.AUTHORIZATION,"Bearer "+token).retrieve().body(List.class);
        boolean correct=roles!=null&&roles.stream().anyMatch(r->r instanceof Map<?,?> m&&expectedRole.equalsIgnoreCase(String.valueOf(m.get("name"))));
        boolean elevated=roles!=null&&roles.stream().anyMatch(r->r instanceof Map<?,?> m&&"ADMIN".equalsIgnoreCase(String.valueOf(m.get("name"))));
        if(!correct||elevated)throw new com.examflow.backend.exception.ApiException(org.springframework.http.HttpStatus.CONFLICT,"Vai trò Keycloak chưa khớp hồ sơ. Cần quản trị viên kiểm tra vai trò trước khi liên kết.");
        return id;
    }

    public void updateManagedAccount(String userId, String fullName, boolean enabled) {
        String token = getAdminAccessToken();
        String name = fullName.trim().replaceAll("\\s+", " ");
        int split = name.lastIndexOf(' ');
        Map<String, Object> body = Map.of("firstName", split < 0 ? name : name.substring(split + 1),
                "lastName", split < 0 ? "" : name.substring(0, split), "enabled", enabled);
        restClient.put().uri(serverUrl + "/admin/realms/" + realm + "/users/" + userId)
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + token).contentType(MediaType.APPLICATION_JSON).body(body).retrieve().toBodilessEntity();
        if (!enabled) logoutManagedAccount(userId);
    }

    public void logoutManagedAccount(String userId) {
        String token = getAdminAccessToken();
        restClient.post().uri(serverUrl + "/admin/realms/" + realm + "/users/" + userId + "/logout")
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + token).retrieve().toBodilessEntity();
    }

    public void deleteCreatedAccount(String userId) { deleteUser(userId, getAdminAccessToken()); }

    /**
     * Keep exactly one application role (STUDENT or TEACHER) on the user.
     * This prevents repeated logins from accumulating both roles.
     */
    public void setApplicationRealmRole(
            String userId,
            String roleName
    ) {
        String normalizedRole = roleName.toUpperCase(Locale.ROOT);
        if (!normalizedRole.equals("STUDENT") && !normalizedRole.equals("TEACHER")) {
            throw new IllegalArgumentException("Unsupported application role: " + roleName);
        }

        String adminToken = getAdminAccessToken();
        String oppositeRole = normalizedRole.equals("STUDENT") ? "TEACHER" : "STUDENT";

        removeRealmRole(userId, oppositeRole, adminToken);
        assignRealmRole(userId, normalizedRole, adminToken);
    }

    private void removeRealmRole(
            String userId,
            String roleName,
            String adminToken
    ) {
        Map<?, ?> role = restClient.get()
                .uri(serverUrl + "/admin/realms/" + realm + "/roles/" + roleName)
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .retrieve()
                .body(Map.class);

        if (role == null) {
            return;
        }

        restClient.method(HttpMethod.DELETE)
                .uri(serverUrl + "/admin/realms/" + realm + "/users/" + userId + "/role-mappings/realm")
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .contentType(MediaType.APPLICATION_JSON)
                .body(List.of(role))
                .retrieve()
                .toBodilessEntity();
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
                            + "Keycloak request failed"
            );

            throw e;
        }
    }

    public void resetPassword(String userId, String newPassword) {
        String adminToken = getAdminAccessToken();
        Map<String, Object> credential = Map.of(
                "type", "password",
                "value", newPassword,
                "temporary", false
        );
        restClient.put()
                .uri(serverUrl + "/admin/realms/" + realm + "/users/" + userId + "/reset-password")
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .contentType(MediaType.APPLICATION_JSON)
                .body(credential)
                .retrieve()
                .toBodilessEntity();
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
