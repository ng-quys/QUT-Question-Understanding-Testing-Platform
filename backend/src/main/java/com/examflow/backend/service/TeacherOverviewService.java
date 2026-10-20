package com.examflow.backend.service;

import com.examflow.backend.entity.UserEntity;
import com.examflow.backend.exception.ApiException;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import java.util.*;

@Service
public class TeacherOverviewService {
    private final AutomaticExamService courses;
    private final TeacherAssignedExamService assignments;
    private final QuestionBankStatsService bank;
    private final JdbcTemplate jdbc;
    public TeacherOverviewService(AutomaticExamService courses,TeacherAssignedExamService assignments,QuestionBankStatsService bank,JdbcTemplate jdbc){this.courses=courses;this.assignments=assignments;this.bank=bank;this.jdbc=jdbc;}
    public Map<String,Object> overview(UserEntity actor) {
        if(!Set.of("teacher","faculty").contains(actor.getRole())||!"active".equals(actor.getStatus()))throw new ApiException(HttpStatus.FORBIDDEN,"Yêu cầu tài khoản giảng viên đang hoạt động.");
        var permitted=courses.availableCourses(actor);var groups=assignments.list(actor);
        var result=new LinkedHashMap<String,Object>();result.put("courses",permitted.size());
        try{result.put("questions",bank.countByCourses(permitted.stream().map(c->c.id()).toList()).values().stream().mapToLong(Long::longValue).sum());result.put("bankUnavailable",false);}
        catch(org.springframework.dao.DataAccessException failure){result.put("questions",null);result.put("bankUnavailable",true);}
        result.put("exams",jdbc.queryForObject("SELECT COUNT(*) FROM exams WHERE created_by=?",Long.class,actor.getId()));
        result.put("sessions",groups.stream().map(TeacherAssignedExamService.Group::sittingId).distinct().count());result.put("assignedGroups",groups.size());
        result.put("upcoming",groups.stream().filter(g->"scheduled".equals(g.status())).sorted(Comparator.comparing(TeacherAssignedExamService.Group::startTime)).limit(5).toList());
        result.put("recentExams",jdbc.query("SELECT id,code,title FROM exams WHERE created_by=? ORDER BY created_at DESC,id DESC LIMIT 5",(rs,n)->Map.of("id",rs.getLong(1),"code",rs.getString(2),"title",rs.getString(3)),actor.getId()));
        return result;
    }
}
