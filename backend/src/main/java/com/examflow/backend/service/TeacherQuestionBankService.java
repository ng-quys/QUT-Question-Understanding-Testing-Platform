package com.examflow.backend.service;

import java.math.BigDecimal;
import java.sql.PreparedStatement;
import java.sql.Timestamp;
import java.util.List;
import java.util.Locale;

import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import javax.sql.DataSource;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.jdbc.support.KeyHolder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.stereotype.Service;

import com.examflow.backend.dto.QuestionResponse;
import com.examflow.backend.dto.SaveQuestionRequest;
import com.examflow.backend.exception.ApiException;

@Service
public class TeacherQuestionBankService {
    private final JdbcTemplate jdbc; // Main DB: ownership, course metadata, exam references
    private final JdbcTemplate bank; // Question Bank DB: questions and answers
    private final TransactionTemplate bankTx;
    private final CurrentUserService currentUserService;

    public TeacherQuestionBankService(JdbcTemplate jdbc, @Qualifier("questionBankDataSource") DataSource questionBankDataSource, CurrentUserService currentUserService) {
        this.jdbc = jdbc;
        this.bank = new JdbcTemplate(questionBankDataSource);
        this.bankTx = new TransactionTemplate(new DataSourceTransactionManager(questionBankDataSource));
        this.currentUserService = currentUserService;
    }

    private long userId(Jwt jwt) { return currentUserService.getCurrentUser(jwt).getId(); }

    private void requireOwnedCourse(long courseId, Jwt jwt) {
        Long count = jdbc.queryForObject(
            "select count(*) from courses c left join course_faculties cf on cf.course_id=c.id " +
            "where c.id=? and (c.created_by=? or cf.faculty_id=?)",
            Long.class, courseId, userId(jwt), userId(jwt));
        if (count == null || count == 0) throw new ApiException(HttpStatus.FORBIDDEN, "Bạn không có quyền quản lý ngân hàng câu hỏi của học phần này");
    }

    private long requireQuestion(long questionId, Jwt jwt) {
        Long courseId = bank.query("select course_id from questions where id=?", rs -> rs.next() ? rs.getLong(1) : null, questionId);
        if (courseId == null) throw new ApiException(HttpStatus.NOT_FOUND, "Không tìm thấy câu hỏi");
        requireOwnedCourse(courseId, jwt);
        return courseId;
    }

    private void requireNotUsedInExam(long id) {
        Long used = jdbc.queryForObject("select count(*) from exam_questions where question_id=?", Long.class, id);
        if (used != null && used > 0) throw new ApiException(HttpStatus.CONFLICT,
            "Câu hỏi đã nằm trong đề thi. Không thể sửa/xóa để bảo vệ bài thi cũ.");
    }

    private static String clean(String s) { return s == null ? null : s.trim(); }

    private short cognitiveId(String bloom) {
        String value = clean(bloom);
        if (value == null || value.isBlank()) value = "understand";
        List<Short> ids = jdbc.query(
            "select id from cognitive_levels where lower(code)=lower(?) or lower(name)=lower(?) order by level_order limit 1",
            (rs, n) -> rs.getShort(1), value, value);
        if (!ids.isEmpty()) return ids.get(0);
        int order = switch (value.toLowerCase(Locale.ROOT)) { case "remember" -> 1; case "apply" -> 3; default -> 2; };
        Short id = jdbc.queryForObject("select id from cognitive_levels order by abs(level_order-?) limit 1", Short.class, order);
        if (id == null) throw new ApiException(HttpStatus.BAD_REQUEST, "Chưa cấu hình mức độ nhận thức");
        return id;
    }

    private short difficultyId(String difficulty) {
        String value = clean(difficulty);
        if (value == null || value.isBlank()) value = "medium";
        List<Short> ids = jdbc.query(
            "select id from difficulty_levels where lower(code)=lower(?) or lower(name)=lower(?) order by level_order limit 1",
            (rs, n) -> rs.getShort(1), value, value);
        if (!ids.isEmpty()) return ids.get(0);
        Short id = jdbc.queryForObject("select id from difficulty_levels order by abs(level_order-2) limit 1", Short.class);
        if (id == null) throw new ApiException(HttpStatus.BAD_REQUEST, "Chưa cấu hình độ khó");
        return id;
    }

    private void validateReferences(SaveQuestionRequest r) {
        if (r.chapterId() != null) {
            Long n = jdbc.queryForObject("select count(*) from chapters where id=? and course_id=?", Long.class, r.chapterId(), r.courseId());
            if (n == null || n == 0) throw new ApiException(HttpStatus.BAD_REQUEST, "Chương không thuộc học phần đã chọn");
        }
        if (r.topicId() != null) {
            Long n = jdbc.queryForObject("select count(*) from topics where id=? and course_id=? and (? is null or chapter_id=?)", Long.class, r.topicId(), r.courseId(), r.chapterId(), r.chapterId());
            if (n == null || n == 0) throw new ApiException(HttpStatus.BAD_REQUEST, "Chủ đề không thuộc học phần/chương đã chọn");
        }
        if (r.cloId() != null) {
            Long n = jdbc.queryForObject("select count(*) from clos where id=? and course_id=?", Long.class, r.cloId(), r.courseId());
            if (n == null || n == 0) throw new ApiException(HttpStatus.BAD_REQUEST, "CLO không thuộc học phần đã chọn");
        }
        if (r.answers() == null || r.answers().size() < 2 || r.answers().size() > 6)
            throw new ApiException(HttpStatus.BAD_REQUEST, "Câu hỏi phải có từ 2 đến 6 đáp án");
        long correct = r.answers().stream().filter(a -> a.correct()).count();
        if (correct != 1) throw new ApiException(HttpStatus.BAD_REQUEST, "Câu hỏi trắc nghiệm phải có đúng 1 đáp án đúng");
    }

    public List<QuestionResponse> list(Long courseId, String status, String search, Jwt jwt) {
        // Course ownership must be resolved in Main DB, never via cross-database JOIN.
        long uid = userId(jwt);
        List<Long> owned = jdbc.query(
            "select distinct c.id from courses c left join course_faculties cf on cf.course_id=c.id " +
            "where c.created_by=? or cf.faculty_id=?", (rs,n) -> rs.getLong(1), uid, uid);
        if (owned.isEmpty()) return List.of();
        if (courseId != null) {
            if (!owned.contains(courseId)) throw new ApiException(HttpStatus.FORBIDDEN, "Không có quyền quản lý học phần");
            owned = List.of(courseId);
        }
        String placeholders = String.join(",", java.util.Collections.nCopies(owned.size(), "?"));
        StringBuilder sql = new StringBuilder("select id,course_id,chapter_id,topic_id,clo_id,cognitive_level_id,difficulty_level_id,content,explanation,status,source,default_score,updated_at from questions where course_id in ("+placeholders+")");
        List<Object> args = new java.util.ArrayList<>(owned);
        if (status != null && !status.isBlank() && !"all".equalsIgnoreCase(status)) {
            sql.append(" and status=?"); args.add(status);
        }
        if (search != null && !search.isBlank()) {
            sql.append(" and lower(content) like ?"); args.add("%"+search.trim().toLowerCase(Locale.ROOT)+"%");
        }
        sql.append(" order by id desc");
        return bank.query(sql.toString(), (rs,n) -> mapBankRow(rs), args.toArray());
    }

    private String lookupCode(String table, short id) {
        // Hardcoded trusted table names; no user-controlled SQL identifiers.
        return jdbc.query("select code from " + table + " where id=?", rs -> rs.next() ? rs.getString(1) : Short.toString(id), id);
    }

    private QuestionResponse mapBankRow(java.sql.ResultSet rs) throws java.sql.SQLException {
        return mapRow(rs.getLong("id"), rs.getLong("course_id"), nullableLong(rs,"chapter_id"),
            nullableLong(rs,"topic_id"), nullableLong(rs,"clo_id"),
            lookupCode("cognitive_levels", rs.getShort("cognitive_level_id")),
            lookupCode("difficulty_levels", rs.getShort("difficulty_level_id")),
            rs.getString("content"), rs.getString("explanation"), rs.getString("status"),
            rs.getString("source"), rs.getBigDecimal("default_score"), rs.getTimestamp("updated_at"));
    }

    private static Long nullableLong(java.sql.ResultSet rs, String name) throws java.sql.SQLException { long v=rs.getLong(name); return rs.wasNull()?null:v; }

    private QuestionResponse mapRow(long id,long courseId,Long chapterId,Long topicId,Long cloId,String bloom,String difficulty,String content,String explanation,String status,String source,BigDecimal score,Timestamp updated) {
        List<QuestionResponse.AnswerResponse> answers = bank.query("select id,label,content,is_correct,position from answers where question_id=? order by position", (rs,n)->new QuestionResponse.AnswerResponse(rs.getLong("id"),rs.getString("label").trim(),rs.getString("content"),rs.getBoolean("is_correct"),rs.getInt("position")), id);
        return new QuestionResponse(id,courseId,chapterId,topicId,cloId,bloom,difficulty,content,explanation,status,source,score,updated==null?null:updated.toLocalDateTime(),answers);
    }

    public QuestionResponse create(SaveQuestionRequest r, Jwt jwt) {
        requireOwnedCourse(r.courseId(), jwt); validateReferences(r);
        short cognitive = cognitiveId(r.bloom()); short difficulty = difficultyId(r.difficulty());
        String status = r.status()==null || r.status().isBlank()?"approved":r.status();
        if (!List.of("approved","pending","rejected").contains(status)) throw new ApiException(HttpStatus.BAD_REQUEST,"Trạng thái câu hỏi không hợp lệ");
        BigDecimal score = r.defaultScore()==null?BigDecimal.ONE:r.defaultScore();
        long uid = userId(jwt);
        Long id = bankTx.execute(tx -> {
            KeyHolder key = new GeneratedKeyHolder();
            bank.update(con->{ PreparedStatement ps=con.prepareStatement("insert into questions(course_id,chapter_id,topic_id,clo_id,cognitive_level_id,difficulty_level_id,content,explanation,status,source,created_by,default_score,created_at,updated_at) values (?,?,?,?,?,?,?,?,?,'manual',?,?,current_timestamp,current_timestamp)", new String[]{"id"}); ps.setLong(1,r.courseId()); setLong(ps,2,r.chapterId()); setLong(ps,3,r.topicId()); setLong(ps,4,r.cloId()); ps.setShort(5,cognitive); ps.setShort(6,difficulty); ps.setString(7,r.content().trim()); ps.setString(8,clean(r.explanation())); ps.setString(9,status); ps.setLong(10,uid); ps.setBigDecimal(11,score); return ps;},key);
            Number generated = key.getKey();
            if (generated == null) throw new IllegalStateException("Không lấy được ID câu hỏi");
            saveAnswers(generated.longValue(),r);
            return generated.longValue();
        });
        return get(id,jwt);
    }

    private static void setLong(PreparedStatement ps,int index,Long value) throws java.sql.SQLException { if(value==null) ps.setNull(index,java.sql.Types.BIGINT); else ps.setLong(index,value); }
    private void saveAnswers(long questionId, SaveQuestionRequest r) { char label='A'; int pos=1; for(var a:r.answers()){ bank.update("insert into answers(question_id,label,content,is_correct,position) values (?,?,?,?,?)",questionId,String.valueOf(label++),a.content().trim(),a.correct(),pos++); } }

    public QuestionResponse get(long id, Jwt jwt) {
        requireQuestion(id,jwt);
        return bank.queryForObject("select id,course_id,chapter_id,topic_id,clo_id,cognitive_level_id,difficulty_level_id,content,explanation,status,source,default_score,updated_at from questions where id=?",
            (rs,n)->mapBankRow(rs),id);
    }

    public QuestionResponse update(long id, SaveQuestionRequest r, Jwt jwt) {
        requireQuestion(id,jwt); requireNotUsedInExam(id); requireOwnedCourse(r.courseId(),jwt); validateReferences(r);
        String status = r.status()==null || r.status().isBlank()?"approved":r.status();
        if (!List.of("approved","pending","rejected").contains(status)) throw new ApiException(HttpStatus.BAD_REQUEST,"Trạng thái câu hỏi không hợp lệ");
        short cognitive = cognitiveId(r.bloom()); short difficulty = difficultyId(r.difficulty());
        bankTx.executeWithoutResult(tx -> {
            bank.update("update questions set course_id=?,chapter_id=?,topic_id=?,clo_id=?,cognitive_level_id=?,difficulty_level_id=?,content=?,explanation=?,status=?,default_score=?,updated_at=current_timestamp where id=?",
                r.courseId(),r.chapterId(),r.topicId(),r.cloId(),cognitive,difficulty,r.content().trim(),clean(r.explanation()),status,r.defaultScore()==null?BigDecimal.ONE:r.defaultScore(),id);
            bank.update("delete from answers where question_id=?",id);
            saveAnswers(id,r);
        });
        return get(id,jwt);
    }

    public QuestionResponse setStatus(long id,String status,Jwt jwt) {
        requireQuestion(id,jwt);
        if(!List.of("approved","pending","rejected").contains(status)) throw new ApiException(HttpStatus.BAD_REQUEST,"Trạng thái không hợp lệ");
        bank.update("update questions set status=?,updated_at=current_timestamp where id=?",status,id);
        return get(id,jwt);
    }

    public void delete(long id,Jwt jwt) {
        requireQuestion(id,jwt); requireNotUsedInExam(id);
        bankTx.executeWithoutResult(tx -> {
            bank.update("delete from answers where question_id=?",id);
            bank.update("delete from questions where id=?",id);
        });
    }
}
