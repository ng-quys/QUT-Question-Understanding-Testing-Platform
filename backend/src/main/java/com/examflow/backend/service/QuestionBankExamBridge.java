package com.examflow.backend.service;

import com.examflow.backend.exception.ApiException;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import javax.sql.DataSource;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/** Transitional bridge. Question Bank is authoritative; Main DB retains FK-compatible shadow rows. */
@Service
public class QuestionBankExamBridge {
    public List<com.examflow.backend.dto.AutomaticExamDto.Item> automaticPool(long courseId) {
        try { return loadAutomaticPool(courseId); }
        catch (org.springframework.dao.DataAccessException e) {
            throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE,
                "Chưa kết nối được ngân hàng câu hỏi. Quản trị viên cần kiểm tra kết nối và cấu hình QUESTION_BANK_DB_PASSWORD trên máy chủ.");
        }
    }

    private List<com.examflow.backend.dto.AutomaticExamDto.Item> loadAutomaticPool(long courseId) {
        // Match the existing immutable exam snapshot contract: four nonempty options, one correct.
        var options = new java.util.HashMap<Long,List<com.examflow.backend.dto.AutomaticExamDto.Option>>();
        bank.query("select a.* from public.answers a join public.questions q on q.id=a.question_id where q.course_id=? and q.status='approved' order by a.question_id,a.position,a.id",
            (org.springframework.jdbc.core.RowCallbackHandler) rs -> options.computeIfAbsent(rs.getLong("question_id"), k -> new ArrayList<>()).add(
                new com.examflow.backend.dto.AutomaticExamDto.Option(rs.getLong("id"), rs.getString("label") == null ? "" : rs.getString("label").trim(),
                    rs.getString("content"),rs.getBoolean("is_correct"),rs.getInt("position"))), courseId);
        return bank.query("select * from public.questions where course_id=? and status='approved' and nullif(trim(content),'') is not null order by id",
            (rs,n) -> new com.examflow.backend.dto.AutomaticExamDto.Item(rs.getLong("id"),rs.getString("content"),rs.getString("explanation"),
                String.valueOf(rs.getShort("difficulty_level_id")), dimensionValue(rs,"chapter_id"),dimensionValue(rs,"topic_id"),dimensionValue(rs,"clo_id"),
                List.copyOf(options.getOrDefault(rs.getLong("id"),List.of()))), courseId).stream()
            .filter(q -> q.answers().size()==4 && q.answers().stream().filter(com.examflow.backend.dto.AutomaticExamDto.Option::correct).count()==1
                && q.answers().stream().allMatch(a -> a.content()!=null&&!a.content().isBlank()&&!a.label().isBlank())
                && q.answers().stream().map(com.examflow.backend.dto.AutomaticExamDto.Option::label).distinct().count()==4).toList();
    }

    private static String dimensionValue(ResultSet rs,String column) throws SQLException {
        Long value=nullableLong(rs,column); return value==null ? "none" : value.toString();
    }

    public List<com.examflow.backend.dto.AutomaticExamDto.Choice> automaticChoices(long courseId,
            List<com.examflow.backend.dto.AutomaticExamDto.Item> pool) {
        var labels = new java.util.LinkedHashMap<String,String>();
        main.query("select id,name from difficulty_levels order by level_order", (org.springframework.jdbc.core.RowCallbackHandler)
            rs -> labels.put("difficulty:"+rs.getLong("id"),rs.getString("name")));
        for (String table : List.of("chapters","topics","clos")) {
            String dimension=switch(table){case "chapters" -> "chapter";case "topics" -> "topic";default -> "clo";};
            main.query("select id,code from "+table+" where course_id=? order by id", (org.springframework.jdbc.core.RowCallbackHandler)
                rs -> labels.put(dimension+":"+rs.getLong("id"),rs.getString("code")),courseId);
        }
        // Keep empty metadata groups visible so teachers can request zero or detect missing questions.
        for (var q:pool) for(String d:List.of("difficulty","chapter","topic","clo"))
            labels.putIfAbsent(d+":"+q.value(d),q.value(d).equals("none")?"Chưa phân loại":"#"+q.value(d));
        return labels.entrySet().stream().map(e -> {
            String[] key=e.getKey().split(":",2);
            int count=(int)pool.stream().filter(q -> key[1].equals(q.value(key[0]))).count();
            return new com.examflow.backend.dto.AutomaticExamDto.Choice(key[0],key[1],e.getValue(),count);
        }).toList();
    }

    /** Freeze exactly the approved content the teacher confirmed in the preview. */
    public void createAutomaticSnapshot(long examQuestionId,long examId,long courseId,
            com.examflow.backend.dto.AutomaticExamDto.Item q) {
        try {
            var options=q.answers().stream().map(a -> Map.<String,Object>of("id",a.id(),"label",a.label(),"content",a.content(),
                "position",a.position(),"is_correct",a.correct())).toList();
            long correct=q.answers().stream().filter(com.examflow.backend.dto.AutomaticExamDto.Option::correct).findFirst().orElseThrow().id();
            main.update("insert into public.exam_question_snapshots (exam_question_id,exam_id,question_id,course_id,clo_id,question_content,question_explanation,options,correct_answer_id) values (?,?,?,?,?,?,?,cast(? as jsonb),?)",
                examQuestionId,examId,q.id(),courseId,q.clo().equals("none")?null:Long.valueOf(q.clo()),q.content(),q.explanation(),json.writeValueAsString(options),correct);
        } catch(com.fasterxml.jackson.core.JsonProcessingException e) { throw new IllegalStateException("Không thể lưu snapshot câu hỏi",e); }
    }
    public record Candidate(long id, short difficultyLevelId) {}
    private record BankQuestion(long id, long courseId, Long chapterId, Long topicId, Long cloId,
                                short cognitive, short difficulty, String content, String explanation,
                                String status, String source, Long createdBy, java.math.BigDecimal score) {}
    private record BankAnswer(long id, long questionId, String label, String content, boolean correct, short position) {}

    private final JdbcTemplate main;
    private final JdbcTemplate bank;
    private final ObjectMapper json;

    public QuestionBankExamBridge(JdbcTemplate main,
            @Qualifier("questionBankDataSource") DataSource questionBankDataSource,
            ObjectMapper json) {
        this.main = main;
        this.bank = new JdbcTemplate(questionBankDataSource);
        this.json = json;
    }

    public List<Candidate> approvedPool(long courseId, List<Long> cloIds) {
        StringBuilder sql = new StringBuilder("select id,difficulty_level_id from public.questions where course_id=? and status='approved'");
        List<Object> args = new ArrayList<>();
        args.add(courseId);
        if (!cloIds.isEmpty()) {
            sql.append(" and clo_id in (");
            sql.append(String.join(",", java.util.Collections.nCopies(cloIds.size(), "?")));
            sql.append(")");
            args.addAll(cloIds);
        }
        return bank.query(sql.toString(), (rs, row) -> new Candidate(rs.getLong(1), rs.getShort(2)), args.toArray());
    }

    private static Long nullableLong(ResultSet rs, String column) throws SQLException {
        long value = rs.getLong(column);
        return rs.wasNull() ? null : value;
    }

    private BankQuestion getBankQuestion(long id) {
        return bank.query("select * from public.questions where id=?", rs -> {
            if (!rs.next()) throw new ApiException(HttpStatus.CONFLICT, "Câu hỏi đã bị xóa khỏi Question Bank");
            return new BankQuestion(rs.getLong("id"), rs.getLong("course_id"),
                nullableLong(rs,"chapter_id"), nullableLong(rs,"topic_id"), nullableLong(rs,"clo_id"),
                rs.getShort("cognitive_level_id"), rs.getShort("difficulty_level_id"),
                rs.getString("content"), rs.getString("explanation"), rs.getString("status"),
                rs.getString("source"), nullableLong(rs,"created_by"), rs.getBigDecimal("default_score"));
        }, id);
    }

    private List<BankAnswer> getBankAnswers(long questionId) {
        List<BankAnswer> answers = bank.query(
            "select id,question_id,label,content,is_correct,position from public.answers where question_id=? order by position,id",
            (rs,n) -> new BankAnswer(rs.getLong(1),rs.getLong(2),rs.getString(3).trim(),
                rs.getString(4),rs.getBoolean(5),rs.getShort(6)),questionId);
        if (answers.size() != 4 || answers.stream().filter(BankAnswer::correct).count() != 1)
            throw new ApiException(HttpStatus.CONFLICT,"Câu hỏi phải có 4 đáp án và đúng 1 đáp án chính xác");
        return answers;
    }

    /** Called inside TeacherExamService's Main DB transaction. */
    public void createSnapshot(long examQuestionId, long examId, long questionId) {
        BankQuestion q = getBankQuestion(questionId);
        List<BankAnswer> answers = getBankAnswers(questionId);
        try {
            List<Map<String,Object>> options = new ArrayList<>();
            Long correctId = null;
            for (BankAnswer a : answers) {
                options.add(Map.of("id",a.id(),"label",a.label(),"content",a.content(),
                    "position",a.position(),"is_correct",a.correct()));
                if (a.correct()) correctId = a.id();
            }
            main.update("insert into public.exam_question_snapshots (exam_question_id,exam_id,question_id,course_id,clo_id,question_content,question_explanation,options,correct_answer_id) values (?,?,?,?,?,?,?,cast(? as jsonb),?)",
                examQuestionId,examId,questionId,q.courseId(),q.cloId(),q.content(),q.explanation(),
                json.writeValueAsString(options),correctId);
        } catch (com.fasterxml.jackson.core.JsonProcessingException e) {
            throw new IllegalStateException("Không thể lưu snapshot câu hỏi",e);
        }
    }
}
