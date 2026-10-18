package com.examflow.backend.service;

import java.util.List;

import org.springframework.http.HttpStatus;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.examflow.backend.dto.CreateCourseRequest;
import com.examflow.backend.dto.TeacherCourseDto;
import com.examflow.backend.entity.Course;
import com.examflow.backend.entity.UserEntity;
import com.examflow.backend.exception.ApiException;
import com.examflow.backend.repository.ChapterRepository;
import com.examflow.backend.repository.CloRepository;
import com.examflow.backend.repository.CourseRepository;

@Service
public class TeacherCourseService {

    private final CourseRepository courseRepository;
    private final ChapterRepository chapterRepository;
    private final CloRepository cloRepository;
    private final QuestionBankStatsService questionBankStats;
    private final CurrentUserService currentUserService;

    public TeacherCourseService(
            CourseRepository courseRepository,
            ChapterRepository chapterRepository,
            CloRepository cloRepository,
            QuestionBankStatsService questionBankStats,
            CurrentUserService currentUserService
    ) {
        this.courseRepository = courseRepository;
        this.chapterRepository = chapterRepository;
        this.cloRepository = cloRepository;
        this.questionBankStats = questionBankStats;
        this.currentUserService = currentUserService;
    }

    /**
     * Lấy danh sách học phần do giảng viên hiện tại tạo.
     */
    @Transactional(readOnly = true)
    public List<TeacherCourseDto> getCourses(Jwt jwt) {

        UserEntity currentUser =
                currentUserService.getCurrentUser(jwt);

        List<Course> courses =
                courseRepository.findByCreatedByOrderByIdAsc(
                        currentUser.getId()
                );

        return courses.stream()
                .map(this::toDto)
                .toList();
    }

    /**
     * Tạo học phần mới.
     */
    @Transactional
    public TeacherCourseDto createCourse(
            Jwt jwt,
            CreateCourseRequest request
    ) {

        UserEntity currentUser =
                currentUserService.getCurrentUser(jwt);

        // Validate mã học phần
        if (
                request.code() == null ||
                request.code().isBlank()
        ) {
            throw new ApiException(
                    HttpStatus.BAD_REQUEST,
                    "Mã học phần không được để trống"
            );
        }

        // Validate tên học phần
        if (
                request.name() == null ||
                request.name().isBlank()
        ) {
            throw new ApiException(
                    HttpStatus.BAD_REQUEST,
                    "Tên học phần không được để trống"
            );
        }

        String normalizedCode =
                request.code()
                        .trim()
                        .toUpperCase();

        // Không cho trùng mã học phần
        if (
                courseRepository.existsByCodeIgnoreCase(
                        normalizedCode
                )
        ) {
            throw new ApiException(
                    HttpStatus.CONFLICT,
                    "Mã học phần đã tồn tại"
            );
        }

        Course course = new Course();

        course.setCode(normalizedCode);

        course.setName(
                request.name().trim()
        );

        course.setCredits(
                request.credits() != null
                        ? request.credits()
                        : (short) 3
        );

        course.setDepartment(
                request.department() == null
                        ? null
                        : request.department().trim()
        );

        course.setStatus("active");

        // Course thuộc teacher đang login
        course.setCreatedBy(
                currentUser.getId()
        );

        Course savedCourse =
                courseRepository.save(course);

        return toDto(savedCourse);
    }

    /**
     * Convert Course entity -> DTO trả về frontend.
     */
    private TeacherCourseDto toDto(
            Course course
    ) {

        long chapterCount =
                chapterRepository.countByCourseId(
                        course.getId()
                );

        long cloCount =
                cloRepository.countByCourse_Id(
                        course.getId()
                );

        long questionCount =
                questionBankStats.countByCourse(
                        course.getId()
                );

        return new TeacherCourseDto(
                course.getId(),
                course.getCode(),
                course.getName(),
                course.getCredits(),
                course.getDepartment(),
                chapterCount,
                cloCount,
                questionCount
        );
    }
}