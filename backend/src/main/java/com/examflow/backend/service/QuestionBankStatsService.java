package com.examflow.backend.service;

import javax.sql.DataSource;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

/** Read-only counts from the dedicated Question Bank database. */
@Service
public class QuestionBankStatsService {
    private final JdbcTemplate bank;
    public QuestionBankStatsService(@Qualifier("questionBankDataSource") DataSource dataSource) {
        this.bank = new JdbcTemplate(dataSource);
    }
    public long countByCourse(long courseId) {
        Long count = bank.queryForObject("select count(*) from public.questions where course_id=?", Long.class, courseId);
        return count == null ? 0 : count;
    }
    public long countByTopic(long courseId, long topicId) {
        Long count = bank.queryForObject("select count(*) from public.questions where course_id=? and topic_id=?", Long.class, courseId, topicId);
        return count == null ? 0 : count;
    }
    public long countByChapter(long courseId, long chapterId) {
        Long count = bank.queryForObject("select count(*) from public.questions where course_id=? and chapter_id=?", Long.class, courseId, chapterId);
        return count == null ? 0 : count;
    }
    public long countByClo(long courseId, long cloId) {
        Long count = bank.queryForObject("select count(*) from public.questions where course_id=? and clo_id=?", Long.class, courseId, cloId);
        return count == null ? 0 : count;
    }
}
