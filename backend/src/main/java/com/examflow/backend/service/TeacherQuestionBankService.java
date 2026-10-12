package com.examflow.backend.service;

import java.math.BigDecimal;
import java.sql.PreparedStatement;
import java.sql.Statement;
import java.sql.Timestamp;
import java.util.List;
import java.util.Locale;

import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.jdbc.support.KeyHolder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.examflow.backend.dto.QuestionResponse;
import com.examflow.backend.dto.SaveQuestionRequest;
import com.examflow.backend.exception.ApiException;

@Service
public class TeacherQuestionBankService {
    private final JdbcTemplate jdbc;
    private final CurrentUserService currentUserService;

    public TeacherQuestionBankService(JdbcTemplate jdbc, CurrentUserService currentUserService) {
        this.jdbc = jdbc;
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

    private void requireQuestion(long questionId, Jwt jwt) {
        Long count = jdbc.queryForObject(
            "select count(*) from questions q join courses c on c.id=q.course_id left join course_faculties cf on cf.course_id=c.id " +
            "where q.id=? and (c.created_by=? or cf.faculty_id=?)",
            Long.class, questionId, userId(jwt), userId(jwt));
        if (count == null || count == 0) throw new ApiException(HttpStatus.NOT_FOUND, "Không tìm thấy câu hỏi hoặc bạn không có quyền chỉnh sửa");
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

    @Transactional(readOnly = true)
    public List<QuestionResponse> list(Long courseId, String status, String search, Jwt jwt) {
        long uid = userId(jwt);
        String sql = "select q.id,q.course_id,q.chapter_id,q.topic_id,q.clo_id,coalesce(cl.code, cast(q.cognitive_level_id as text)) bloom," +
            "coalesce(dl.code, cast(q.difficulty_level_id as text)) difficulty,q.content,q.explanation,q.status,q.source,q.default_score,q.updated_at " +
            "from questions q join courses c on c.id=q.course_id left join course_faculties cf on cf.course_id=c.id " +
            "left join cognitive_levels cl on cl.id=q.cognitive_level_id left join difficulty_levels dl on dl.id=q.difficulty_level_id " +
            "where (c.created_by=? or cf.faculty_id=?) " +
"and (cast(? as bigint) is null or q.course_id=?) " +
"and (cast(? as varchar) is null or q.status=?) " +
"and (cast(? as varchar) is null or lower(q.content) like lower('%'||?||'%')) " ;
        String st = status == null || status.isBlank() || "all".equalsIgnoreCase(status) ? null : status;
        String q = search == null || search.isBlank() ? null : search.trim();
        return jdbc.query(sql, (rs, n) -> mapRow(rs.getLong("id"), rs.getLong("course_id"), nullableLong(rs,"chapter_id"), nullableLong(rs,"topic_id"), nullableLong(rs,"clo_id"), rs.getString("bloom"), rs.getString("difficulty"), rs.getString("content"), rs.getString("explanation"), rs.getString("status"), rs.getString("source"), rs.getBigDecimal("default_score"), rs.getTimestamp("updated_at")), uid, uid, courseId, courseId, st, st, q, q);
    }

    private static Long nullableLong(java.sql.ResultSet rs, String name) throws java.sql.SQLException { long v=rs.getLong(name); return rs.wasNull()?null:v; }

    private QuestionResponse mapRow(long id,long courseId,Long chapterId,Long topicId,Long cloId,String bloom,String difficulty,String content,String explanation,String status,String source,BigDecimal score,Timestamp updated) {
        List<QuestionResponse.AnswerResponse> answers = jdbc.query("select id,label,content,is_correct,position from answers where question_id=? order by position", (rs,n)->new QuestionResponse.AnswerResponse(rs.getLong("id"),rs.getString("label").trim(),rs.getString("content"),rs.getBoolean("is_correct"),rs.getInt("position")), id);
        return new QuestionResponse(id,courseId,chapterId,topicId,cloId,bloom,difficulty,content,explanation,status,source,score,updated==null?null:updated.toLocalDateTime(),answers);
    }

    @Transactional
    public QuestionResponse create(SaveQuestionRequest r, Jwt jwt) {
        requireOwnedCourse(r.courseId(), jwt); validateReferences(r);
        short cognitive = cognitiveId(r.bloom()); short difficulty = difficultyId(r.difficulty());
        String status = r.status()==null || r.status().isBlank()?"approved":r.status();
        if (!List.of("approved","pending","rejected").contains(status)) throw new ApiException(HttpStatus.BAD_REQUEST,"Trạng thái câu hỏi không hợp lệ");
        BigDecimal score = r.defaultScore()==null?BigDecimal.ONE:r.defaultScore();
        KeyHolder key = new GeneratedKeyHolder();
        long uid = userId(jwt);
        jdbc.update(con->{ PreparedStatement ps=con.prepareStatement("insert into questions(course_id,chapter_id,topic_id,clo_id,cognitive_level_id,difficulty_level_id,content,explanation,status,source,created_by,default_score,created_at,updated_at) values (?,?,?,?,?,?,?,?,?,'manual',?,?,current_timestamp,current_timestamp)", Statement.RETURN_GENERATED_KEYS); ps.setLong(1,r.courseId()); setLong(ps,2,r.chapterId()); setLong(ps,3,r.topicId()); setLong(ps,4,r.cloId()); ps.setShort(5,cognitive); ps.setShort(6,difficulty); ps.setString(7,r.content().trim()); ps.setString(8,clean(r.explanation())); ps.setString(9,status); ps.setLong(10,uid); ps.setBigDecimal(11,score); return ps;},key);
        Number generated=(Number)key.getKeys().get("id"); if(generated==null) throw new IllegalStateException("Không lấy được ID câu hỏi");
        long id=generated.longValue(); saveAnswers(id,r); return get(id,jwt);
    }

    private static void setLong(PreparedStatement ps,int index,Long value) throws java.sql.SQLException { if(value==null) ps.setNull(index,java.sql.Types.BIGINT); else ps.setLong(index,value); }
    private void saveAnswers(long questionId, SaveQuestionRequest r) { char label='A'; int pos=1; for(var a:r.answers()){ jdbc.update("insert into answers(question_id,label,content,is_correct,position) values (?,?,?,?,?)",questionId,String.valueOf(label++),a.content().trim(),a.correct(),pos++); } }

    @Transactional(readOnly=true)
    public QuestionResponse get(long id, Jwt jwt) {
        requireQuestion(id,jwt);
        return jdbc.queryForObject("select q.id,q.course_id,q.chapter_id,q.topic_id,q.clo_id,coalesce(cl.code, cast(q.cognitive_level_id as text)) bloom,coalesce(dl.code, cast(q.difficulty_level_id as text)) difficulty,q.content,q.explanation,q.status,q.source,q.default_score,q.updated_at from questions q left join cognitive_levels cl on cl.id=q.cognitive_level_id left join difficulty_levels dl on dl.id=q.difficulty_level_id where q.id=?",(rs,n)->mapRow(rs.getLong("id"),rs.getLong("course_id"),nullableLong(rs,"chapter_id"),nullableLong(rs,"topic_id"),nullableLong(rs,"clo_id"),rs.getString("bloom"),rs.getString("difficulty"),rs.getString("content"),rs.getString("explanation"),rs.getString("status"),rs.getString("source"),rs.getBigDecimal("default_score"),rs.getTimestamp("updated_at")),id);
    }

    @Transactional
    public QuestionResponse update(long id, SaveQuestionRequest r, Jwt jwt) {
        requireQuestion(id,jwt); requireOwnedCourse(r.courseId(),jwt); validateReferences(r);
        jdbc.update("update questions set course_id=?,chapter_id=?,topic_id=?,clo_id=?,cognitive_level_id=?,difficulty_level_id=?,content=?,explanation=?,status=?,default_score=?,updated_at=current_timestamp where id=?",r.courseId(),r.chapterId(),r.topicId(),r.cloId(),cognitiveId(r.bloom()),difficultyId(r.difficulty()),r.content().trim(),clean(r.explanation()),r.status()==null?"approved":r.status(),r.defaultScore()==null?BigDecimal.ONE:r.defaultScore(),id);
        jdbc.update("delete from answers where question_id=?",id); saveAnswers(id,r); return get(id,jwt);
    }

    @Transactional
    public QuestionResponse setStatus(long id,String status,Jwt jwt) { requireQuestion(id,jwt); if(!List.of("approved","pending","rejected").contains(status)) throw new ApiException(HttpStatus.BAD_REQUEST,"Trạng thái không hợp lệ"); jdbc.update("update questions set status=?,updated_at=current_timestamp where id=?",status,id); return get(id,jwt); }

    @Transactional
    public void delete(long id,Jwt jwt) { requireQuestion(id,jwt); Long used=jdbc.queryForObject("select count(*) from exam_questions where question_id=?",Long.class,id); if(used!=null&&used>0) throw new ApiException(HttpStatus.CONFLICT,"Câu hỏi đã được dùng trong đề thi nên không thể xóa"); jdbc.update("delete from answers where question_id=?",id); jdbc.update("delete from questions where id=?",id); }
}
