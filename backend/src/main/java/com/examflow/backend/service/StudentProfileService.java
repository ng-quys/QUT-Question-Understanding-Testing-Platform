package com.examflow.backend.service;

import com.examflow.backend.dto.StudentProfileDto;
import com.examflow.backend.entity.UserEntity;
import com.examflow.backend.exception.ApiException;
import com.examflow.backend.repository.UserRepository;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import javax.imageio.ImageIO;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;
import java.util.Set;

@Service
public class StudentProfileService {
    private static final Set<String> ALLOWED_TYPES = Set.of(
            "image/jpeg", "image/png", "image/webp"
    );

    private final UserRepository userRepository;
    private final Path profileDir;

    public StudentProfileService(
            UserRepository userRepository,
            @Value("${app.student-profile-dir:../anticheating/student-profiles}") String profileDir) {
        this.userRepository = userRepository;
        this.profileDir = Path.of(profileDir).toAbsolutePath().normalize();
    }

    public StudentProfileDto getProfile(Long studentId) {
        UserEntity student = requireStudent(studentId);
        return new StudentProfileDto(
                student.getId(),
                student.getUsername(),
                student.getEmail(),
                student.getFullName(),
                student.getDepartment(),
                student.getStatus(),
                Files.exists(photoPath(studentId))
        );
    }

    public void saveFacePhoto(Long studentId, MultipartFile file) {
        requireStudent(studentId);

        if (file == null || file.isEmpty()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Vui lòng chọn ảnh khuôn mặt");
        }

        String contentType = file.getContentType() == null
                ? ""
                : file.getContentType().toLowerCase();

        if (!ALLOWED_TYPES.contains(contentType)) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Chỉ hỗ trợ ảnh JPG, PNG hoặc WEBP");
        }

        if (file.getSize() > 5 * 1024 * 1024) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Ảnh khuôn mặt tối đa 5MB");
        }

        try {
            BufferedImage image = ImageIO.read(file.getInputStream());
            if (image == null) {
                throw new ApiException(HttpStatus.BAD_REQUEST, "File không phải ảnh hợp lệ");
            }

            Files.createDirectories(profileDir);

            Path target = photoPath(studentId);
            ByteArrayOutputStream output = new ByteArrayOutputStream();
            if (!ImageIO.write(image, "jpg", output)) {
                throw new ApiException(HttpStatus.BAD_REQUEST, "Không thể xử lý ảnh khuôn mặt");
            }

            Files.write(
                    target,
                    output.toByteArray(),
                    StandardOpenOption.CREATE,
                    StandardOpenOption.TRUNCATE_EXISTING,
                    StandardOpenOption.WRITE
            );
        } catch (IOException e) {
            throw new ApiException(
                    HttpStatus.INTERNAL_SERVER_ERROR,
                    "Không thể lưu ảnh khuôn mặt"
            );
        }
    }

    public byte[] getFacePhoto(Long studentId) {
        requireStudent(studentId);
        Path target = photoPath(studentId);

        if (!Files.exists(target)) {
            throw new ApiException(HttpStatus.NOT_FOUND, "Sinh viên chưa có ảnh khuôn mặt");
        }

        try {
            return Files.readAllBytes(target);
        } catch (IOException e) {
            throw new ApiException(
                    HttpStatus.INTERNAL_SERVER_ERROR,
                    "Không thể đọc ảnh khuôn mặt"
            );
        }
    }

    private Path photoPath(Long studentId) {
        return profileDir.resolve(studentId + ".jpg");
    }

    private UserEntity requireStudent(Long studentId) {
        UserEntity user = userRepository.findById(studentId)
                .orElseThrow(() -> new ApiException(
                        HttpStatus.NOT_FOUND,
                        "Không tìm thấy sinh viên"
                ));

        if (!"student".equalsIgnoreCase(user.getRole())) {
            throw new ApiException(
                    HttpStatus.FORBIDDEN,
                    "Tài khoản không phải sinh viên"
            );
        }

        return user;
    }
}
