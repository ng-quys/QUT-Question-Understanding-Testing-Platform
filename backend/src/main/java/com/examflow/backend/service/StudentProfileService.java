package com.examflow.backend.service;

import com.examflow.backend.dto.StudentProfileDto;
import com.examflow.backend.entity.UserEntity;
import com.examflow.backend.exception.ApiException;
import com.examflow.backend.repository.UserRepository;
import com.examflow.backend.repository.ExamAttemptRepository;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import javax.imageio.ImageIO;
import java.awt.Color;
import java.awt.Graphics2D;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import java.util.Set;
import java.util.logging.Level;
import java.util.logging.Logger;

@Service
public class StudentProfileService {
    @jakarta.persistence.PersistenceContext private jakarta.persistence.EntityManager entityManager;
    private static final Logger LOGGER = Logger.getLogger(StudentProfileService.class.getName());
    private static final Set<String> ALLOWED_TYPES = Set.of(
            "image/jpeg", "image/png", "image/webp"
    );

    private final UserRepository userRepository;
    private final Path profileDir;
    private final SupabaseStudentPhotoStorage storage;
    private final ExamAttemptRepository attempts;

    public StudentProfileService(
            UserRepository userRepository,
            @Value("${app.student-profile-dir:auto}") String profileDir,
            SupabaseStudentPhotoStorage storage,
            ExamAttemptRepository attempts) {
        this.userRepository = userRepository;
        this.profileDir = resolveProfileDir(profileDir);
        this.storage = storage;
        this.attempts = attempts;
        LOGGER.info("Student profile directory: " + this.profileDir);
    }

    private static Path resolveProfileDir(String configured) {
        if (!"auto".equalsIgnoreCase(configured)
                && !"../anticheating/student-profiles".equals(configured.replace('\\', '/'))) {
            return Path.of(configured).toAbsolutePath().normalize();
        }
        Path base = Path.of(System.getProperty("user.dir")).toAbsolutePath().normalize();
        Path project = findProjectRoot(base);
        if (project == null) {
            try {
                Path codeLocation = Path.of(StudentProfileService.class.getProtectionDomain()
                        .getCodeSource().getLocation().toURI());
                project = findProjectRoot(codeLocation);
            } catch (Exception ignored) {
                // A custom directory can still be supplied for legacy local photos.
            }
        }
        if (project == null) {
            // Cloud photos do not require a checkout/shared disk. This path is legacy fallback only.
            return base.resolve("student-profiles");
        }
        return project.resolve("anticheating/student-profiles");
    }

    private static Path findProjectRoot(Path base) {
        for (Path current = base; current != null; current = current.getParent()) {
            if (Files.isDirectory(current.resolve("backend"))
                    && Files.isDirectory(current.resolve("anticheating/app"))) {
                return current;
            }
        }
        return null;
    }

    @Transactional(readOnly = true)
    public StudentProfileDto getProfile(Long studentId) {
        UserEntity student = requireStudent(studentId);
        return new StudentProfileDto(
                student.getId(),
                student.getUsername(),
                student.getEmail(),
                student.getFullName(),
                student.getDepartment(),
                student.getStatus(),
                student.getPhotoKey() != null || Files.isRegularFile(photoPath(studentId)),
                student.getStudentClassId()==null?null:(String)entityManager.createNativeQuery("SELECT name FROM student_classes WHERE id=:id").setParameter("id",student.getStudentClassId()).getSingleResult()
        );
    }

    @Transactional
    public void saveFacePhoto(Long studentId, MultipartFile file) {
        UserEntity student = userRepository.findForPhotoUpdate(studentId).orElseThrow(() ->
                new ApiException(HttpStatus.NOT_FOUND, "Không tìm thấy sinh viên"));
        entityManager.refresh(student);
        if (!"student".equalsIgnoreCase(student.getRole()) || !"active".equalsIgnoreCase(student.getStatus()))
            throw new ApiException(HttpStatus.FORBIDDEN, "Tài khoản sinh viên không hoạt động");
        if (attempts.existsByStudentIdAndStatus(studentId, "in_progress"))
            throw new ApiException(HttpStatus.CONFLICT, "Không thể đổi ảnh khuôn mặt khi đang làm bài thi");

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
            BufferedImage image;
            try (var input = file.getInputStream()) {
                try (var imageInput = ImageIO.createImageInputStream(input)) {
                    var readers = ImageIO.getImageReaders(imageInput);
                    if (!readers.hasNext()) throw new ApiException(HttpStatus.BAD_REQUEST, "File không phải ảnh JPG/PNG hợp lệ hoặc định dạng không được hỗ trợ");
                    var reader = readers.next();
                    try {
                        reader.setInput(imageInput);
                        long pixels = (long) reader.getWidth(0) * reader.getHeight(0);
                        if (pixels <= 0 || pixels > 20_000_000L)
                            throw new ApiException(HttpStatus.BAD_REQUEST, "Ảnh khuôn mặt tối đa 20 triệu điểm ảnh");
                        image = reader.read(0);
                    } finally { reader.dispose(); }
                }
            }
            if (image == null) {
                throw new ApiException(HttpStatus.BAD_REQUEST, "File không phải ảnh hợp lệ");
            }

            // JPEG has no alpha channel. Flatten PNG transparency onto white.
            double scale = Math.min(1, 1600.0 / Math.max(image.getWidth(), image.getHeight()));
            BufferedImage rgb = new BufferedImage(Math.max(1, (int)(image.getWidth() * scale)), Math.max(1, (int)(image.getHeight() * scale)), BufferedImage.TYPE_INT_RGB);
            Graphics2D graphics = rgb.createGraphics();
            try {
                graphics.setColor(Color.WHITE);
                graphics.fillRect(0, 0, rgb.getWidth(), rgb.getHeight());
                graphics.drawImage(image, 0, 0, rgb.getWidth(), rgb.getHeight(), null);
            } finally {
                graphics.dispose();
            }
            ByteArrayOutputStream output = new ByteArrayOutputStream();
            if (!ImageIO.write(rgb, "jpg", output)) {
                throw new ApiException(HttpStatus.BAD_REQUEST, "Không thể xử lý ảnh khuôn mặt");
            }

            String oldBucket = student.getPhotoBucket(), oldKey = student.getPhotoKey();
            String newKey = storage.newKey(studentId), newBucket = storage.bucket();
            // Register before upload: even an ambiguous upload/DB failure retains the old reference.
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override public void afterCompletion(int status) {
                    if (status == STATUS_COMMITTED) {
                        if (oldKey != null) cleanup(studentId, oldBucket, oldKey);
                    } else if (status == STATUS_ROLLED_BACK) cleanup(studentId, newBucket, newKey);
                    else LOGGER.warning("Student photo transaction outcome unknown; object retained: " + newKey);
                }
            });
            storage.upload(studentId, newKey, output.toByteArray());
            student.setPhotoBucket(newBucket);
            student.setPhotoKey(newKey);
            userRepository.saveAndFlush(student);
        } catch (IOException e) {
            LOGGER.log(Level.SEVERE, "Cannot save face photo for student " + studentId
                    + " in " + profileDir + " (contentType=" + contentType + ")", e);
            throw new ApiException(
                    HttpStatus.INTERNAL_SERVER_ERROR,
                    "Không thể lưu ảnh khuôn mặt"
            );
        }
    }

    @Transactional(readOnly = true)
    public byte[] getFacePhoto(Long studentId) {
        UserEntity student = requireStudent(studentId);
        if (student.getPhotoKey() != null || student.getPhotoBucket() != null)
            return storage.download(studentId, student.getPhotoBucket(), student.getPhotoKey());
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

    @Transactional
    public byte[] getFacePhotoForExam(Long studentId) {
        // Serialize exam reference selection with profile replacement until the attempt commits.
        UserEntity student = userRepository.findForPhotoUpdate(studentId).orElseThrow(() ->
                new ApiException(HttpStatus.NOT_FOUND, "Không tìm thấy sinh viên"));
        entityManager.refresh(student);
        if (!"student".equalsIgnoreCase(student.getRole()) || !"active".equalsIgnoreCase(student.getStatus()))
            throw new ApiException(HttpStatus.FORBIDDEN, "Tài khoản sinh viên không hoạt động");
        return getFacePhoto(studentId);
    }

    private Path photoPath(Long studentId) {
        return profileDir.resolve(studentId + ".jpg");
    }

    private void cleanup(Long studentId, String bucket, String key) {
        try { storage.delete(studentId, bucket, key); }
        catch (Exception ex) {
            // A failed cleanup must not hide a committed update. Keep key for manual recovery.
            LOGGER.warning("Student photo cleanup pending: student=" + studentId + ", object=" + key);
        }
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
