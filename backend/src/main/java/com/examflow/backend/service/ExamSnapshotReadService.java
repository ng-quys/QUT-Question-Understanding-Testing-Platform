package com.examflow.backend.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

/**
 * Read-only snapshot access layer for the future ID-only exam runtime.
 * Uses Main DB exclusively; never fetches questions/answers from legacy tables.
 * Not yet wired into StudentService: existing production flows remain unchanged.
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

    public ExamSnapshotReadService(JdbcTemplate main, ObjectMapper mapper) {
        this.main = main;
        this.mapper = mapper;
    }

    public Optional<Snapshot> find(long examQuestionId) {
        return main.query("""
            select exam_question_id, question_id, clo_id, question_content,
                   coalesce(question_explanation, ''), correct_answer_id, options::text
            from public.exam_question_snapshots where exam_question_id = ?
            """, rs -> {
            if (!rs.next()) return Optional.empty();
            try {
                JsonNode array = mapper.readTree(rs.getString(7));
                if (!array.isArray() || array.size() != 4) {
                    throw new IllegalStateException("Snapshot must contain exactly 4 options");
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
}
