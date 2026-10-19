package com.examflow.backend;

import com.examflow.backend.entity.UserEntity;
import com.examflow.backend.exception.ApiException;
import com.examflow.backend.repository.*;
import com.examflow.backend.service.*;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.io.TempDir;
import org.junit.jupiter.api.parallel.ResourceLock;
import org.springframework.http.HttpStatus;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.transaction.support.*;
import javax.imageio.ImageIO;
import java.awt.image.BufferedImage;
import java.io.*;
import java.nio.file.*;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class StudentProfilePhotoTests {
    @TempDir Path directory;
    final UserRepository users = mock(UserRepository.class);
    final ExamAttemptRepository attempts = mock(ExamAttemptRepository.class);
    final SupabaseStudentPhotoStorage storage = mock(SupabaseStudentPhotoStorage.class);
    final UserEntity student = new UserEntity();
    final Map<String, byte[]> objects = new HashMap<>();
    StudentProfileService service;
    @BeforeEach void setup() {
        student.setId(26L); student.setRole("student"); student.setStatus("active");
        when(users.findById(26L)).thenReturn(Optional.of(student));
        when(users.findForPhotoUpdate(26L)).thenReturn(Optional.of(student));
        when(storage.bucket()).thenReturn("student-photos");
        when(storage.newKey(26L)).thenAnswer(call -> "student-26/" + UUID.randomUUID() + ".jpg");
        doAnswer(call -> { objects.put(call.getArgument(1), call.getArgument(2)); return null; })
                .when(storage).upload(eq(26L), anyString(), any());
        when(storage.download(eq(26L), eq("student-photos"), anyString())).thenAnswer(call -> objects.get(call.getArgument(2)));
        service = new StudentProfileService(users, directory.toString(), storage, attempts);
        org.springframework.test.util.ReflectionTestUtils.setField(service,"entityManager",mock(jakarta.persistence.EntityManager.class));
        TransactionSynchronizationManager.initSynchronization();
    }
    @AfterEach void clearSynchronization() {
        if (TransactionSynchronizationManager.isSynchronizationActive()) TransactionSynchronizationManager.clearSynchronization();
    }
    void complete(int status) {
        var callbacks = TransactionSynchronizationManager.getSynchronizations();
        TransactionSynchronizationManager.clearSynchronization();
        callbacks.forEach(callback -> callback.afterCompletion(status));
    }
    MockMultipartFile image(int type, String format) throws Exception {
        var output = new ByteArrayOutputStream();
        assertTrue(ImageIO.write(new BufferedImage(16,16,type), format, output));
        return new MockMultipartFile("file", "photo."+format, format.equals("jpg") ? "image/jpeg" : "image/png", output.toByteArray());
    }
    @Test void transparentPngUploadsAsJpegOnWhiteAndStoresOnlyObjectLocation() throws Exception {
        service.saveFacePhoto(26L, image(BufferedImage.TYPE_INT_ARGB,"png"));
        assertEquals("student-photos", student.getPhotoBucket());
        assertTrue(student.getPhotoKey().startsWith("student-26/"));
        var decoded = ImageIO.read(new ByteArrayInputStream(service.getFacePhoto(26L)));
        assertNotNull(decoded); assertEquals(0xffffff, decoded.getRGB(0,0) & 0xffffff);
        assertFalse(Files.exists(directory.resolve("26.jpg"))); verify(users).saveAndFlush(student);
    }
    @Test void cloudPhotoIsAvailableOnAnotherMachineWithoutLocalFiles() throws Exception {
        service.saveFacePhoto(26L,image(BufferedImage.TYPE_BYTE_GRAY,"jpg"));
        var secondMachine = new StudentProfileService(users,directory.resolve("another-machine").toString(),storage,attempts);
        assertTrue(secondMachine.getProfile(26L).hasFacePhoto());
        assertArrayEquals(objects.get(student.getPhotoKey()),secondMachine.getFacePhoto(26L));
    }
    @Test void legacyLocalPhotoRemainsReadableWithoutUploadingIt() throws Exception {
        byte[] previous = image(BufferedImage.TYPE_BYTE_GRAY,"jpg").getBytes();
        Files.write(directory.resolve("26.jpg"),previous);
        assertTrue(service.getProfile(26L).hasFacePhoto());
        assertArrayEquals(previous,service.getFacePhoto(26L)); verifyNoInteractions(storage);
    }
    @Test void invalidImageDoesNotOverwritePreviousPhoto() {
        student.setPhotoBucket("student-photos"); student.setPhotoKey("previous");
        assertThrows(ApiException.class, () -> service.saveFacePhoto(26L,
                new MockMultipartFile("file","bad.png","image/png",new byte[]{1,2,3})));
        assertEquals("previous", student.getPhotoKey()); verifyNoInteractions(storage); verify(users,never()).saveAndFlush(any());
    }
    @Test void uploadFailurePreservesOldReferenceAndLocalPhoto() throws Exception {
        student.setPhotoBucket("student-photos"); student.setPhotoKey("previous");
        byte[] local = image(BufferedImage.TYPE_INT_RGB,"jpg").getBytes(); Files.write(directory.resolve("26.jpg"),local);
        doThrow(new ApiException(HttpStatus.BAD_GATEWAY,"Storage offline")).when(storage).upload(any(),any(),any());
        assertThrows(ApiException.class,()->service.saveFacePhoto(26L,image(BufferedImage.TYPE_INT_RGB,"jpg")));
        complete(TransactionSynchronization.STATUS_ROLLED_BACK);
        assertEquals("previous",student.getPhotoKey()); assertArrayEquals(local,Files.readAllBytes(directory.resolve("26.jpg")));
        verify(storage,never()).delete(26L,"student-photos","previous"); verify(users,never()).saveAndFlush(any());
    }
    @Test void previousObjectIsDeletedOnlyAfterCommit() throws Exception {
        student.setPhotoBucket("student-photos"); student.setPhotoKey("previous");
        service.saveFacePhoto(26L,image(BufferedImage.TYPE_INT_RGB,"jpg"));
        verify(storage,never()).delete(any(),any(),any());
        complete(TransactionSynchronization.STATUS_COMMITTED);
        verify(storage).delete(26L,"student-photos","previous");
    }
    @Test void databaseFailureCleansNewObjectAndKeepsOldObject() throws Exception {
        student.setPhotoBucket("student-photos"); student.setPhotoKey("previous");
        doThrow(new IllegalStateException("database offline")).when(users).saveAndFlush(any());
        assertThrows(IllegalStateException.class,()->service.saveFacePhoto(26L,image(BufferedImage.TYPE_INT_RGB,"jpg")));
        String newKey=student.getPhotoKey(); // JPA rolls fields back in the real transaction.
        complete(TransactionSynchronization.STATUS_ROLLED_BACK);
        verify(storage).delete(26L,"student-photos",newKey);
        verify(storage,never()).delete(26L,"student-photos","previous");
    }
    @Test void activeAttemptPreventsAnyUpload() throws Exception {
        when(attempts.existsByStudentIdAndStatus(26L,"in_progress")).thenReturn(true);
        assertEquals(HttpStatus.CONFLICT,assertThrows(ApiException.class,
                ()->service.saveFacePhoto(26L,image(BufferedImage.TYPE_INT_RGB,"jpg"))).getStatus());
        verifyNoInteractions(storage);
    }
    @Test void otherRoleAndInactiveAccountAreRejected() throws Exception {
        student.setRole("teacher");
        assertThrows(ApiException.class,()->service.saveFacePhoto(26L,image(BufferedImage.TYPE_INT_RGB,"jpg")));
        student.setRole("student"); student.setStatus("inactive");
        assertThrows(ApiException.class,()->service.saveFacePhoto(26L,image(BufferedImage.TYPE_INT_RGB,"jpg")));
        verifyNoInteractions(storage);
    }
    @Test @ResourceLock("java.lang.System.properties") void autoDirectoryStillFindsLegacyPhotos() throws Exception {
        Files.createDirectories(directory.resolve("backend")); Files.createDirectories(directory.resolve("anticheating/app"));
        String previous=System.getProperty("user.dir");
        var resolver=StudentProfileService.class.getDeclaredMethod("resolveProfileDir",String.class);resolver.setAccessible(true);
        try {
            for(Path cwd:new Path[]{directory,directory.resolve("backend")}) {
                System.setProperty("user.dir",cwd.toString());
                assertEquals(directory.resolve("anticheating/student-profiles"),resolver.invoke(null,"auto"));
            }
        } finally { System.setProperty("user.dir",previous); }
    }
}
