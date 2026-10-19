package com.examflow.backend.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

/**
 * Main DB exam snapshots. Legacy exams without snapshots retain their existing local content.
 * Question Bank content is frozen at exam creation; runtime never joins to the remote bank.
 */
@Service
public class ExamSnapshotReadService {
    public record Option(long id, String label, String content) {}
    public record Snapshot(long examQuestionId, long questionId, Long cloId, String content,
                           String explanation, long correctAnswerId, List<Option> options) {
        public boolean containsAnswer(long answerId) {
            return options.stream().anyMatch(option -> option.id() == answerId);
        }
        public boolean isCorrect(long answerId) {
            return containsAnswer(answerId) && correctAnswerId == answerId;
        }
    }

    private final JdbcTemplate main;
    private final ObjectMapper mapper;
    private volatile Boolean snapshotTable;

    public ExamSnapshotReadService(JdbcTemplate main, ObjectMapper mapper) {
        this.main = main;
        this.mapper = mapper;
    }

    public Optional<Snapshot> find(long examQuestionId) {
        if (!hasSnapshotTable()) return legacy(examQuestionId);
        Optional<Snapshot> found = frozen(examQuestionId);
        return found.isPresent()?found:legacy(examQuestionId);
    }

    public boolean hasSnapshotTable() {
        if(snapshotTable==null)snapshotTable=Boolean.TRUE.equals(main.queryForObject("select to_regclass('public.exam_question_snapshots') is not null",Boolean.class));
        return snapshotTable;
    }
    public boolean usesSnapshots(long examId) {
        return hasSnapshotTable() && main.queryForObject("select count(*) from public.exam_question_snapshots where exam_id=?",Long.class,examId)>0;
    }

    private Optional<Snapshot> frozen(long examQuestionId) {
        return main.query("""
            select exam_question_id, question_id, clo_id, question_content,
                   coalesce(question_explanation, ''), correct_answer_id, options::text
            from public.exam_question_snapshots where exam_question_id = ?
            """, rs -> {
            if (!rs.next()) return Optional.empty();
            try {
                JsonNode array = mapper.readTree(rs.getString(7));
                if (!array.isArray() || array.size()<2 || array.size()>10) {
                    throw new IllegalStateException("Snapshot must contain 2–10 options");
                }
                List<Option> options = new ArrayList<>();
                for (JsonNode node : array) {
                    if (!node.hasNonNull("id") || !node.hasNonNull("content")) {
                        throw new IllegalStateException("Invalid snapshot option");
                    }
                    options.add(new Option(node.get("id").asLong(),
                            node.path("label").asText(""), node.get("content").asText()));
                }
                long correctId = rs.getLong(6);
                if (rs.wasNull() || options.stream().noneMatch(o -> o.id() == correctId)) {
                    throw new IllegalStateException("Snapshot correct answer missing from options");
                }
                return Optional.of(new Snapshot(rs.getLong(1), rs.getLong(2), (Long)rs.getObject(3), rs.getString(4),
                        rs.getString(5), correctId, List.copyOf(options)));
            } catch (com.fasterxml.jackson.core.JsonProcessingException ex) {
                throw new IllegalStateException("Invalid snapshot JSON", ex);
            }
        }, examQuestionId);
    }

    private Optional<Snapshot> legacy(long examQuestionId) {
        // Existing Main DB exams remain usable while databases are migrated separately.
        if(!Boolean.TRUE.equals(main.queryForObject("select to_regclass('public.questions') is not null and to_regclass('public.answers') is not null",Boolean.class)))return Optional.empty();
        return main.query("""
            select eq.id,q.id,q.clo_id,q.content,coalesce(q.explanation,'')
            from exam_questions eq join questions q on q.id=eq.question_id where eq.id=?
            """,rs->{
                if(!rs.next())return Optional.empty();
                long question=rs.getLong(2);Long clo=(Long)rs.getObject(3);
                var options=new ArrayList<Option>();var correct=new ArrayList<Long>();
                main.query("select id,label,content,is_correct from answers where question_id=? order by position,id",(org.springframework.jdbc.core.RowCallbackHandler)row->{
                    long id=row.getLong(1);options.add(new Option(id,row.getString(2).trim(),row.getString(3)));if(row.getBoolean(4))correct.add(id);
                },question);
                if(options.size()<2||correct.size()!=1)throw new IllegalStateException("Legacy exam question has invalid answers");
                return Optional.of(new Snapshot(rs.getLong(1),question,clo,rs.getString(4),rs.getString(5),correct.get(0),List.copyOf(options)));
            },examQuestionId);
    }

    public void saveAdminSnapshot(long linkId,long examId,long courseId,Snapshot source,String content,List<AdminExamContentService.AnswerInput> answers) {
        var options=new ArrayList<java.util.Map<String,Object>>();long correct=0;
        for(int i=0;i<answers.size();i++){
            var answer=answers.get(i);long answerId=i+1;
            options.add(java.util.Map.of("id",answerId,"label",String.valueOf((char)('A'+i)),"content",answer.content().trim(),"position",i+1,"is_correct",answer.correct()));
            if(answer.correct())correct=answerId;
        }
        try{
            // Negative question IDs belong exclusively to admin-authored exam snapshots, so they
            // cannot collide with positive Question Bank IDs. Main runtime stores scalar IDs only.
            main.update("insert into exam_question_snapshots(exam_question_id,exam_id,question_id,course_id,clo_id,question_content,question_explanation,options,correct_answer_id) values(?,?,?,?,?,?,?,cast(? as jsonb),?)",
                linkId,examId,-linkId,courseId,source==null?null:source.cloId(),content.trim(),source==null?"":source.explanation(),mapper.writeValueAsString(options),correct);
        }catch(com.fasterxml.jackson.core.JsonProcessingException failure){throw new IllegalStateException("Cannot save exam snapshot",failure);}
    }
}
