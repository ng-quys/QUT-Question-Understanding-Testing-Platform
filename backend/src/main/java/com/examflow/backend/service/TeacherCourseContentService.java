package com.examflow.backend.service;



import java.sql.PreparedStatement;

import java.sql.Statement;

import java.util.List;



import org.springframework.http.HttpStatus;

import org.springframework.jdbc.core.JdbcTemplate;

import org.springframework.jdbc.support.GeneratedKeyHolder;

import org.springframework.jdbc.support.KeyHolder;

import org.springframework.security.oauth2.jwt.Jwt;

import org.springframework.stereotype.Service;

import org.springframework.transaction.annotation.Transactional;



import com.examflow.backend.dto.*;

import com.examflow.backend.exception.ApiException;



@Service

public class TeacherCourseContentService {

    private final JdbcTemplate jdbc;
    private final QuestionBankStatsService questionBankStats;

    private final CurrentUserService currentUserService;



    public TeacherCourseContentService(JdbcTemplate jdbc, CurrentUserService currentUserService, QuestionBankStatsService questionBankStats) {
        this.questionBankStats = questionBankStats;

        this.jdbc = jdbc;

        this.currentUserService = currentUserService;

    }



    private long userId(Jwt jwt) { return currentUserService.getCurrentUser(jwt).getId(); }



    private void requireCourseOwner(long courseId, Jwt jwt) {

        Long count = jdbc.queryForObject(

            "select count(*) from courses where id = ? and created_by = ?",

            Long.class, courseId, userId(jwt));

        if (count == null || count == 0) throw new ApiException(HttpStatus.NOT_FOUND, "Không tìm thấy học phần hoặc bạn không có quyền quản lý học phần này");

    }



    private void requireChapter(long courseId, long chapterId) {

        Long count = jdbc.queryForObject("select count(*) from chapters where id = ? and course_id = ?", Long.class, chapterId, courseId);

        if (count == null || count == 0) throw new ApiException(HttpStatus.NOT_FOUND, "Không tìm thấy chương");

    }



    private void requireTopic(long courseId, long chapterId, long topicId) {

        Long count = jdbc.queryForObject("select count(*) from topics where id = ? and chapter_id = ? and course_id = ?", Long.class, topicId, chapterId, courseId);

        if (count == null || count == 0) throw new ApiException(HttpStatus.NOT_FOUND, "Không tìm thấy chủ đề");

    }



    private static String required(String value, String message) {

        if (value == null || value.isBlank()) throw new ApiException(HttpStatus.BAD_REQUEST, message);

        return value.trim();

    }



    @Transactional(readOnly = true)

    public List<CourseChapterDto> getStructure(long courseId, Jwt jwt) {

        requireCourseOwner(courseId, jwt);

        return jdbc.query(

            "select id, course_id, chapter_order, code, name from chapters where course_id = ? order by chapter_order, id",

            (rs, n) -> {

                long chapterId = rs.getLong("id");

                List<CourseTopicDto> topics = jdbc.query(

                    "select t.id, t.chapter_id, t.code, t.name " +

                    "from topics t where t.chapter_id = ? and t.course_id = ? order by t.topic_order, t.id",

                    (tr, x) -> new CourseTopicDto(tr.getLong("id"), tr.getLong("chapter_id"), tr.getString("code"), tr.getString("name"), questionBankStats.countByTopic(courseId, tr.getLong("id"))),

                    chapterId, courseId);

                return new CourseChapterDto(chapterId, rs.getLong("course_id"), rs.getInt("chapter_order"), rs.getString("code"), rs.getString("name"), topics);

            }, courseId);

    }



    @Transactional

    public CourseChapterDto createChapter(long courseId, CreateChapterRequest request, Jwt jwt) {

        requireCourseOwner(courseId, jwt);

        String name = required(request.name(), "Tên chương không được để trống");

        Integer nextOrder = jdbc.queryForObject("select coalesce(max(chapter_order), 0) + 1 from chapters where course_id = ?", Integer.class, courseId);

        String code = request.code() == null || request.code().isBlank() ? "Chương " + nextOrder : request.code().trim();

        KeyHolder key = new GeneratedKeyHolder();

        jdbc.update(con -> {

            PreparedStatement ps = con.prepareStatement(

                "insert into chapters(course_id, code, name, chapter_order) values (?, ?, ?, ?)", Statement.RETURN_GENERATED_KEYS);

            ps.setLong(1, courseId); ps.setString(2, code); ps.setString(3, name); ps.setInt(4, nextOrder); return ps;

        }, key);

        Number generatedId = (Number) key.getKeys().get("id");
        if (generatedId == null) {
            throw new IllegalStateException("Không lấy được ID của chương vừa tạo");
        }
        long id = generatedId.longValue();

        return new CourseChapterDto(id, courseId, nextOrder, code, name, List.of());

    }



    @Transactional

    public CourseChapterDto updateChapter(long courseId, long chapterId, UpdateChapterRequest request, Jwt jwt) {

        requireCourseOwner(courseId, jwt); requireChapter(courseId, chapterId);

        String name = required(request.name(), "Tên chương không được để trống");

        String code = request.code() == null || request.code().isBlank()

            ? jdbc.queryForObject("select code from chapters where id = ?", String.class, chapterId)

            : request.code().trim();

        jdbc.update("update chapters set code = ?, name = ? where id = ? and course_id = ?", code, name, chapterId, courseId);

        return getStructure(courseId, jwt).stream().filter(c -> c.id() == chapterId).findFirst().orElseThrow();

    }



    @Transactional

    public void deleteChapter(long courseId, long chapterId, Jwt jwt) {

        requireCourseOwner(courseId, jwt); requireChapter(courseId, chapterId);

        if (questionBankStats.countByChapter(courseId, chapterId) > 0)
            throw new ApiException(HttpStatus.CONFLICT, "Chương còn câu hỏi trong Question Bank; hãy chuyển câu hỏi sang chương khác trước khi xóa.");

        jdbc.update("delete from topics where course_id = ? and chapter_id = ?", courseId, chapterId);

        jdbc.update("delete from chapters where id = ? and course_id = ?", chapterId, courseId);

    }



    @Transactional

    public CourseTopicDto createTopic(long courseId, long chapterId, CreateTopicRequest request, Jwt jwt) {

        requireCourseOwner(courseId, jwt); requireChapter(courseId, chapterId);

        String name = required(request.name(), "Tên chủ đề không được để trống");

        Integer nextOrder = jdbc.queryForObject("select coalesce(max(topic_order), 0) + 1 from topics where chapter_id = ?", Integer.class, chapterId);

        String code = request.code() == null || request.code().isBlank() ? String.valueOf(nextOrder) : request.code().trim();

        KeyHolder key = new GeneratedKeyHolder();

        jdbc.update(con -> {

            PreparedStatement ps = con.prepareStatement(

                "insert into topics(chapter_id, course_id, code, name, topic_order) values (?, ?, ?, ?, ?)", Statement.RETURN_GENERATED_KEYS);

            ps.setLong(1, chapterId); ps.setLong(2, courseId); ps.setString(3, code); ps.setString(4, name); ps.setInt(5, nextOrder); return ps;

        }, key);

        Number generatedId = (Number) key.getKeys().get("id");
        if (generatedId == null) {
            throw new IllegalStateException("Không lấy được ID của chủ đề vừa tạo");
        }
        return new CourseTopicDto(generatedId.longValue(), chapterId, code, name, 0);

    }



    @Transactional

    public CourseTopicDto updateTopic(long courseId, long chapterId, long topicId, UpdateTopicRequest request, Jwt jwt) {

        requireCourseOwner(courseId, jwt); requireChapter(courseId, chapterId); requireTopic(courseId, chapterId, topicId);

        String name = required(request.name(), "Tên chủ đề không được để trống");

        String code = request.code() == null || request.code().isBlank()

            ? jdbc.queryForObject("select code from topics where id = ?", String.class, topicId)

            : request.code().trim();

        jdbc.update("update topics set code = ?, name = ? where id = ? and chapter_id = ? and course_id = ?", code, name, topicId, chapterId, courseId);

        Long count = questionBankStats.countByTopic(courseId, topicId);

        return new CourseTopicDto(topicId, chapterId, code, name, count == null ? 0 : count);

    }



    @Transactional

    public void deleteTopic(long courseId, long chapterId, long topicId, Jwt jwt) {

        requireCourseOwner(courseId, jwt); requireTopic(courseId, chapterId, topicId);

        if (questionBankStats.countByTopic(courseId, topicId) > 0)
            throw new ApiException(HttpStatus.CONFLICT, "Chủ đề còn câu hỏi trong Question Bank; hãy chuyển câu hỏi sang chủ đề khác trước khi xóa.");

        jdbc.update("delete from topics where id = ? and chapter_id = ? and course_id = ?", topicId, chapterId, courseId);

    }



    @Transactional(readOnly = true)
public List<CourseCloDto> getClos(long courseId, Jwt jwt) {
    requireCourseOwner(courseId, jwt);

    return jdbc.query(
        """
        select
            id,
            course_id,
            code,
            description,
            coalesce(default_bloom, 'remember') as default_bloom,
            coalesce(status, 'active') as status,
            notes
        from clos
        where course_id = ?
        order by clo_order, id
        """,
        (rs, n) -> new CourseCloDto(
            rs.getLong("id"),
            rs.getLong("course_id"),
            rs.getString("code"),
            rs.getString("description"),
            rs.getString("default_bloom"),
            rs.getString("status"),
            rs.getString("notes")
        ),
        courseId
    );
}



    @Transactional
public CourseCloDto createClo(
        long courseId,
        SaveCourseCloRequest request,
        Jwt jwt
) {
    requireCourseOwner(courseId, jwt);

    String code = required(
            request.code(),
            "Mã CLO không được để trống"
    );

    String description = required(
            request.description(),
            "Mô tả CLO không được để trống"
    );

    String bloom = request.defaultBloom() == null
            ? "remember"
            : request.defaultBloom();

    String status = request.status() == null
            ? "active"
            : request.status();

    // Tự động lấy thứ tự tiếp theo trong course
    Integer nextOrder = jdbc.queryForObject(
            """
            select coalesce(max(clo_order), 0) + 1
            from clos
            where course_id = ?
            """,
            Integer.class,
            courseId
    );

    KeyHolder key = new GeneratedKeyHolder();

    jdbc.update(con -> {
        PreparedStatement ps = con.prepareStatement(
                """
                insert into clos(
                    course_id,
                    code,
                    name,
                    description,
                    default_bloom,
                    status,
                    notes,
                    clo_order
                )
                values (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                Statement.RETURN_GENERATED_KEYS
        );

        ps.setLong(1, courseId);
        ps.setString(2, code);
        ps.setString(3, code);
        ps.setString(4, description);
        ps.setString(5, bloom);
        ps.setString(6, status);
        ps.setString(7, request.notes());
        ps.setInt(8, nextOrder == null ? 1 : nextOrder);

        return ps;
    }, key);

    Number generatedId = (Number) key.getKeys().get("id");

    if (generatedId == null) {
        throw new IllegalStateException(
                "Không lấy được ID của CLO vừa tạo"
        );
    }

    return new CourseCloDto(
            generatedId.longValue(),
            courseId,
            code,
            description,
            bloom,
            status,
            request.notes()
    );
}


    @Transactional

    public CourseCloDto updateClo(long courseId, long cloId, SaveCourseCloRequest request, Jwt jwt) {

        requireCourseOwner(courseId, jwt);

        Long count = jdbc.queryForObject("select count(*) from clos where id = ? and course_id = ?", Long.class, cloId, courseId);

        if (count == null || count == 0) throw new ApiException(HttpStatus.NOT_FOUND, "Không tìm thấy CLO");

        String code = required(request.code(), "Mã CLO không được để trống");

        String description = required(request.description(), "Mô tả CLO không được để trống");

        String bloom = request.defaultBloom() == null ? "remember" : request.defaultBloom();

        String status = request.status() == null ? "active" : request.status();

        jdbc.update("update clos set code = ?, name = ?, description = ?, default_bloom = ?, status = ?, notes = ? where id = ? and course_id = ?",

            code, code, description, bloom, status, request.notes(), cloId, courseId);

        return new CourseCloDto(cloId, courseId, code, description, bloom, status, request.notes());

    }



    @Transactional

    public void deleteClo(long courseId, long cloId, Jwt jwt) {

        requireCourseOwner(courseId, jwt);

        // Question Bank is authoritative. Never modify legacy Main.questions.
        // Refuse deletion while questions reference this CLO to avoid cross-DB inconsistency.
        if (questionBankStats.countByClo(courseId, cloId) > 0) {
            throw new ApiException(HttpStatus.CONFLICT,
                "CLO đang được sử dụng bởi câu hỏi trong Question Bank; hãy chuyển liên kết trước khi xóa.");
        }

        int deleted = jdbc.update("delete from clos where id = ? and course_id = ?", cloId, courseId);

        if (deleted == 0) throw new ApiException(HttpStatus.NOT_FOUND, "Không tìm thấy CLO");

    }

}
