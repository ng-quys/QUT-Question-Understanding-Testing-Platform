package com.examflow.backend.service;

import com.examflow.backend.entity.*;
import com.examflow.backend.exception.ApiException;
import jakarta.persistence.*;
import jakarta.validation.constraints.*;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.util.*;

@Service
@Transactional
public class TeacherExamLibraryService {
    @PersistenceContext private EntityManager em;
    private final JdbcTemplate jdbc;private final AdminCatalogService catalog;
    public TeacherExamLibraryService(JdbcTemplate jdbc,AdminCatalogService catalog){this.jdbc=jdbc;this.catalog=catalog;}
    public record Edit(@NotBlank @Size(max=200) String title,@NotBlank String expectedToken,boolean shuffleQuestions,boolean shuffleAnswers,boolean antiCheatMode){}
    private String token(Exam e,Map<String,Object> review){return CourseAllocationService.hash(review.get("revisionToken")+"|"+e.getShuffleQuestions()+"|"+e.getShuffleAnswers()+"|"+e.getAntiCheatMode());}
    private void teacher(UserEntity actor){if(!Set.of("teacher","faculty").contains(actor.getRole())||!"active".equals(actor.getStatus()))throw new ApiException(HttpStatus.FORBIDDEN,"Yêu cầu quyền giảng viên đang hoạt động.");}
    private Exam owned(UserEntity actor,long id,boolean lock){teacher(actor);Exam e=lock?em.find(Exam.class,id,LockModeType.PESSIMISTIC_WRITE):em.find(Exam.class,id);if(e==null||!Objects.equals(actor.getId(),e.getCreatedBy()))throw new ApiException(HttpStatus.FORBIDDEN,"Bạn chỉ được quản lý đề do mình tạo.");return e;}
    @Transactional(readOnly=true)
    public List<Map<String,Object>> list(UserEntity actor){
        teacher(actor);
        return jdbc.query("""
            SELECT e.id,e.code,e.title,e.course_id,c.code,c.name,e.total_questions,e.total_points,e.status,
              NOT EXISTS(SELECT 1 FROM exam_sessions s WHERE s.exam_id=e.id)
              AND NOT EXISTS(SELECT 1 FROM exam_attempts a WHERE a.exam_id=e.id)
              AND NOT EXISTS(SELECT 1 FROM exam_sitting_groups g WHERE g.exam_id=e.id) AS unused
            FROM exams e JOIN courses c ON c.id=e.course_id WHERE e.created_by=? ORDER BY e.created_at DESC,e.id DESC
            """,(rs,n)->{var row=new LinkedHashMap<String,Object>();String[] fields={"id","code","title","courseId","courseCode","courseName","totalQuestions","totalPoints","status"};for(int i=0;i<fields.length;i++)row.put(fields[i],rs.getObject(i+1));boolean editable=rs.getBoolean(10)&&"draft".equals(rs.getString(9));row.put("canEdit",editable);row.put("canDelete",editable);return row;},actor.getId());
    }
    @Transactional(readOnly=true)
    public Map<String,Object> detail(UserEntity actor,long id){
        Exam e=owned(actor,id,false);var review=catalog.reviewExam(id);var result=new LinkedHashMap<String,Object>();
        for(String key:List.of("id","code","title","courseName","totalPoints","questions","revisionToken","canEdit"))result.put(key,review.get(key));
        result.put("courseId",e.getCourse().getId());result.put("courseCode",e.getCourse().getCode());result.put("status",e.getStatus());
        result.put("shuffleQuestions",e.getShuffleQuestions());result.put("shuffleAnswers",e.getShuffleAnswers());result.put("antiCheatMode",e.getAntiCheatMode());
        result.put("canDelete",review.get("canEdit"));result.put("matrixAvailable",false);result.put("overlapAvailable",false);
        result.put("revisionToken",token(e,review));
        return result;
    }
    public Map<String,Object> edit(UserEntity actor,long id,Edit input){
        Exam e=owned(actor,id,true);var before=catalog.reviewExam(id);
        if(!Boolean.TRUE.equals(before.get("canEdit")))throw new ApiException(HttpStatus.CONFLICT,"Đề đã được gắn vào ca hoặc sử dụng, không được chỉnh sửa đề nguồn.");
        if(!Objects.equals(token(e,before),input.expectedToken()))throw new ApiException(HttpStatus.CONFLICT,"Đề đã thay đổi ở phiên khác. Hãy tải lại trước khi lưu.");
        e.setTitle(input.title().trim());e.setShuffleQuestions(input.shuffleQuestions());e.setShuffleAnswers(input.shuffleAnswers());e.setAntiCheatMode(input.antiCheatMode());em.flush();return detail(actor,id);
    }
    public void delete(UserEntity actor,long id){owned(actor,id,true);catalog.delete(actor.getId(),"exams",id);}
}
