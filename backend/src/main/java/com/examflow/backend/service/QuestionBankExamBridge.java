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
