package com.qut.backend.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public record RegisterRequest(

        String username,

        @NotBlank(message = "Email không được để trống")
        @Email(message = "Email không đúng định dạng")
        String email,

        @NotBlank(message = "Mật khẩu không được để trống")
        @Size(min = 6, message = "Mật khẩu phải từ 6 ký tự trở lên")
        String password,

        String fullName,

        String firstName,

        String lastName,

        @NotNull(message = "Vai trò không được để trống")
        RegistrationRole role

) {
}