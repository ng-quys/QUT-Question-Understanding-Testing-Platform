package com.examflow.backend.service;

import com.examflow.backend.exception.ApiException;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Locale;
import java.util.Set;

@Service
public class AdminEvidenceService {
    private final Path root;
    public AdminEvidenceService(@Value("${app.anticheat.evidence-dir:}") String configured) {
        Path cwd = Path.of("").toAbsolutePath();
        root = configured.isBlank()
                ? (Files.isDirectory(cwd.resolve("anticheating")) ? cwd.resolve("anticheating/evidence") : cwd.resolve("../anticheating/evidence")).normalize()
                : Path.of(configured).toAbsolutePath().normalize();
    }
    public Path resolve(Long attemptId, String storedPath) {
        try {
            Path realRoot = root.toRealPath();
            Path attemptRoot = realRoot.resolve("attempt-" + attemptId).toRealPath();
            Path candidate = Path.of(storedPath);
            if (!candidate.isAbsolute()) candidate = realRoot.resolve(candidate);
            Path realFile = candidate.toRealPath();
            if (!attemptRoot.startsWith(realRoot) || !realFile.startsWith(attemptRoot) || !Files.isRegularFile(realFile))
                throw new ApiException(HttpStatus.FORBIDDEN, "Tệp bằng chứng không thuộc lượt thi này");
            String name = realFile.getFileName().toString().toLowerCase(Locale.ROOT);
            if (Set.of(".jpg", ".jpeg", ".png", ".webp", ".mp4", ".webm", ".wav").stream().noneMatch(name::endsWith))
                throw new ApiException(HttpStatus.UNSUPPORTED_MEDIA_TYPE, "Định dạng bằng chứng chưa được hỗ trợ");
            if (Files.size(realFile) > 25L * 1024 * 1024)
                throw new ApiException(HttpStatus.PAYLOAD_TOO_LARGE, "Tệp bằng chứng vượt quá 25 MB");
            return realFile;
        } catch (IOException | IllegalArgumentException error) {
            throw new ApiException(HttpStatus.NOT_FOUND, "Không tìm thấy bằng chứng trên máy chủ. Kiểm tra thư mục evidence đã cấu hình.");
        }
    }
}
