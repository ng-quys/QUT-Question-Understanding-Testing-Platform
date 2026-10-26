package com.examflow.backend.service;

import com.examflow.backend.dto.*;
import com.examflow.backend.dto.CourseOutline.*;
import com.examflow.backend.exception.ApiException;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.text.Normalizer;
import java.util.*;

/** Main datasource only. Preview is read-only; all confirmation writes share one transaction. */
@Service
public class CourseOutlineImportService {
    private final JdbcTemplate db;
    private final CurrentUserService users;
    private final TeacherCourseService courses;
    private final TeacherCourseContentService content;
    public CourseOutlineImportService(JdbcTemplate db,CurrentUserService users,TeacherCourseService courses,TeacherCourseContentService content) {
        this.db=db;this.users=users;this.courses=courses;this.content=content;
    }
    static String text(String value) {return Normalizer.normalize(value==null?"":value,Normalizer.Form.NFC).replaceAll("(?U)\\s+"," ").strip();}
    static String key(String value) {return text(value).toLowerCase(Locale.ROOT);}
    // Codes remain strings, including leading zeroes and CLO asterisks.
    static String codeKey(String value) {return key(value).replaceAll("\\s+","");}
    private static List<String> topicParts(String code) {
        String value=text(code);
        if(!value.matches("\\d+(\\s*\\.\\s*\\d+)+"))return null;
        return Arrays.stream(value.split("\\.")).map(String::strip).toList();
    }
    private static String required(String value,int max,String label) {
        String result=text(value);
        if(result.isEmpty()||result.length()>max)throw new ApiException(HttpStatus.BAD_REQUEST,label+" bị trống hoặc quá dài (tối đa "+max+" ký tự).");
        return result;
    }
    private long actor(Jwt jwt) {
        var user=users.getCurrentUser(jwt);
        if(!List.of("teacher","faculty","admin").contains(user.getRole().toLowerCase(Locale.ROOT)))throw new ApiException(HttpStatus.FORBIDDEN,"Chỉ giảng viên được nhập đề cương.");
        return user.getId();
    }
    public void authorize(Jwt jwt) {actor(jwt);}
    static void validate(CourseOutline outline) {
        if(outline==null||outline.course()==null||outline.chapters()==null||outline.clos()==null)throw new ApiException(HttpStatus.BAD_REQUEST,"Thiếu cấu trúc đề cương.");
        var meta=outline.course();
        String code=required(meta.code(),80,"Mã học phần");required(meta.name(),255,"Tên học phần");
        if(!code.matches("[\\p{L}\\p{N}_.-]+"))throw new ApiException(HttpStatus.BAD_REQUEST,"Mã học phần chỉ gồm chữ, số, dấu chấm, gạch ngang hoặc gạch dưới.");
        if(meta.credits()==null||meta.credits()<1||meta.credits()>30)throw new ApiException(HttpStatus.BAD_REQUEST,"Số tín chỉ phải từ 1 đến 30.");
        if(text(meta.department()).length()>255)throw new ApiException(HttpStatus.BAD_REQUEST,"Đơn vị phụ trách quá dài.");
        if(outline.chapters().size()>100||outline.clos().size()>200||outline.chapters().stream().filter(Objects::nonNull).mapToInt(c->c.topics()==null?0:c.topics().size()).sum()>2000)throw new ApiException(HttpStatus.BAD_REQUEST,"Đề cương vượt giới hạn 100 chương, 2000 chủ đề hoặc 200 CLO.");
        var chapterCodes=new HashSet<String>();var chapterNames=new HashSet<String>();var cloCodes=new HashSet<String>();
        for(var chapter:outline.chapters()) {
            if(chapter==null||chapter.topics()==null)throw new ApiException(HttpStatus.BAD_REQUEST,"Chương không hợp lệ.");
            required(chapter.code(),80,"Mã chương");required(chapter.name(),255,"Tên chương");
            unique(chapterCodes,codeKey(chapter.code()),"Mã chương bị trùng: "+chapter.code());unique(chapterNames,key(chapter.name()),"Tên chương bị trùng: "+chapter.name());
            var topicCodes=new HashSet<String>();
            var chapterNumber=java.util.regex.Pattern.compile("^(?:Chương\\s*)?(\\d+)\\.?$",java.util.regex.Pattern.CASE_INSENSITIVE|java.util.regex.Pattern.UNICODE_CASE).matcher(text(chapter.code()));
            String expectedChapter=chapterNumber.matches()?chapterNumber.group(1):null;
            for(var topic:chapter.topics()) {
                if(topic==null)throw new ApiException(HttpStatus.BAD_REQUEST,"Chủ đề không hợp lệ.");
                required(topic.code(),80,"Mã chủ đề");required(topic.name(),255,"Tên chủ đề");
                var parts=topicParts(topic.code());
                if(parts==null)throw new ApiException(HttpStatus.BAD_REQUEST,"Mã chủ đề không hợp lệ: "+topic.code()+". Dùng mã đánh số như 2.1, 2.1.1.");
                if(expectedChapter!=null&&!expectedChapter.equals(parts.get(0)))throw new ApiException(HttpStatus.BAD_REQUEST,"Chủ đề "+topic.code()+" không thuộc mã "+chapter.code()+".");
                unique(topicCodes,String.join(".",parts),"Mã chủ đề bị trùng trong "+chapter.code()+": "+topic.code());
            }
            for(var topic:chapter.topics()) {
                var parts=topicParts(topic.code());
                if(parts.size()>2&&!topicCodes.contains(String.join(".",parts.subList(0,parts.size()-1))))
                    throw new ApiException(HttpStatus.BAD_REQUEST,"Chủ đề "+topic.code()+": thiếu chủ đề cha "+String.join(".",parts.subList(0,parts.size()-1))+" trong bản xem trước. Hãy bổ sung hoặc loại bỏ trước khi lưu.");
            }
        }
        for(var clo:outline.clos()) {
            if(clo==null)throw new ApiException(HttpStatus.BAD_REQUEST,"CLO không hợp lệ.");
            required(clo.code(),80,"Mã CLO");required(clo.description(),10000,"Mô tả CLO");
            if(!codeKey(clo.code()).matches("clo\\d+(\\.\\d+)*\\*?"))throw new ApiException(HttpStatus.BAD_REQUEST,"Mã CLO không hợp lệ: "+clo.code());
            unique(cloCodes,codeKey(clo.code()),"Mã CLO bị trùng: "+clo.code());
        }
    }
    private static void unique(Set<String> keys,String value,String error) {if(!keys.add(value))throw new ApiException(HttpStatus.BAD_REQUEST,error);}
    private List<Map<String,Object>> chapters(long id) {return db.queryForList("SELECT id,code,name FROM chapters WHERE course_id=? ORDER BY chapter_order,id",id);}
    private List<Map<String,Object>> topics(long id) {return db.queryForList("SELECT id,chapter_id,code,name FROM topics WHERE course_id=? ORDER BY topic_order,id",id);}
    private List<Map<String,Object>> clos(long id) {return db.queryForList("SELECT id,code,description FROM clos WHERE course_id=? ORDER BY clo_order,id",id);}
    private Map<String,Object> match(List<Map<String,Object>> rows,String code,String name,String field,List<String> conflicts,String label) {
        var candidates=rows.stream().filter(row->codeKey(Objects.toString(row.get("code"),"")).equals(codeKey(code))||key(Objects.toString(row.get(field),"")).equals(key(name))).toList();
        if(candidates.isEmpty())return null;
        var row=candidates.get(0);
        if(candidates.size()>1||!codeKey(Objects.toString(row.get("code"),"")).equals(codeKey(code))||!key(Objects.toString(row.get(field),"")).equals(key(name)))conflicts.add(label+" trùng mã/tên nhưng khác nội dung: "+code+". Hãy sửa hoặc loại bỏ mục này; dữ liệu cũ không bị ghi đè.");
        return row;
    }
    private Map<String,Object> matchTopic(List<Map<String,Object>> rows,String code,String name,List<String> conflicts) {
        // Repeated titles in distinct branches are legitimate; identity is the full dotted code.
        return match(rows.stream().filter(row->codeKey(Objects.toString(row.get("code"),"")).equals(codeKey(code))).toList(),code,name,"name",conflicts,"Chủ đề");
    }
    @Transactional(readOnly=true)
    public Plan preview(Jwt jwt,CourseOutline outline) {return plan(actor(jwt),outline);}
    private Plan plan(long actor,CourseOutline outline) {
        validate(outline);
        var meta=outline.course();var conflicts=new ArrayList<String>();
        var existing=db.queryForList("SELECT id,code,name,credits,created_by FROM courses WHERE lower(trim(code))=lower(?)",text(meta.code()));
        Long id=null;
        if(!existing.isEmpty()) {
            var row=existing.get(0);
            if(existing.size()!=1||row.get("created_by")==null||((Number)row.get("created_by")).longValue()!=actor) {
                return new Plan(null,true,new Counts(0,0,0),new Counts(0,0,0),List.of("Mã học phần đã tồn tại và không thuộc quyền sở hữu của bạn. Hãy chọn mã khác."));
            }
            id=((Number)row.get("id")).longValue();
            if(!key(meta.name()).equals(key(row.get("name").toString()))||meta.credits()!=((Number)row.get("credits")).intValue())conflicts.add("Tên hoặc số tín chỉ không khớp học phần đã có. Hệ thống không ghi đè thông tin học phần.");
        }
        List<Map<String,Object>> oldChapters=id==null?List.of():chapters(id),oldTopics=id==null?List.of():topics(id),oldClos=id==null?List.of():clos(id);
        int createdCh=0,createdT=0,createdC=0,skippedCh=0,skippedT=0,skippedC=0;
        for(var chapter:outline.chapters()) {
            var old=match(oldChapters,chapter.code(),chapter.name(),"name",conflicts,"Chương");
            if(old==null)createdCh++;else skippedCh++;
            var scoped=old==null?List.<Map<String,Object>>of():oldTopics.stream().filter(t->((Number)t.get("chapter_id")).longValue()==((Number)old.get("id")).longValue()).toList();
            for(var topic:chapter.topics())if(matchTopic(scoped,topic.code(),topic.name(),conflicts)==null)createdT++;else skippedT++;
        }
        for(var clo:outline.clos())if(match(oldClos,clo.code(),clo.description(),"description",conflicts,"CLO")==null)createdC++;else skippedC++;
        return new Plan(id,id!=null,new Counts(createdCh,createdT,createdC),new Counts(skippedCh,skippedT,skippedC),conflicts);
    }
    @Transactional(rollbackFor=Exception.class)
    public Plan confirm(Jwt jwt,Confirmation request) {
        if(request==null)throw new ApiException(HttpStatus.BAD_REQUEST,"Thiếu xác nhận nhập đề cương.");
        long actor=actor(jwt);CourseOutline outline=request.outline();validate(outline);
        // Serialize imports of the same code. Session/transaction ends release the lock automatically.
        db.queryForObject("SELECT pg_advisory_xact_lock(hashtextextended(?,0))",Object.class,"examflow-course-outline:"+codeKey(outline.course().code()));
        Plan plan=plan(actor,outline);
        if(!plan.conflicts().isEmpty())throw new ApiException(HttpStatus.CONFLICT,String.join("\n",plan.conflicts()));
        if(plan.existing()&&!request.appendExisting())throw new ApiException(HttpStatus.CONFLICT,"Học phần đã tồn tại. Hãy kiểm tra preview và xác nhận chỉ bổ sung mục còn thiếu.");
        long courseId;
        if(plan.existing()) {
            courseId=plan.courseId();
            db.queryForObject("SELECT id FROM courses WHERE id=? AND created_by=? FOR UPDATE",Long.class,courseId,actor);
            // Revalidate after lock; never apply an old preview blindly.
            plan=plan(actor,outline);
            if(!plan.conflicts().isEmpty()||!Objects.equals(plan.courseId(),courseId))throw new ApiException(HttpStatus.CONFLICT,"Dữ liệu học phần đã thay đổi. Hãy kiểm tra preview lại.");
        } else {
            var meta=outline.course();
            courseId=courses.createCourse(jwt,new CreateCourseRequest(text(meta.code()),text(meta.name()),meta.credits().shortValue(),text(meta.department()))).id();
        }
        var oldChapters=chapters(courseId);var oldTopics=topics(courseId);var oldClos=clos(courseId);
        for(var chapter:outline.chapters()) {
            var old=match(oldChapters,chapter.code(),chapter.name(),"name",new ArrayList<>(),"Chương");
            long chapterId=old==null?content.createChapter(courseId,new CreateChapterRequest(text(chapter.code()),text(chapter.name())),jwt).id():((Number)old.get("id")).longValue();
            var scoped=oldTopics.stream().filter(t->((Number)t.get("chapter_id")).longValue()==chapterId).toList();
            for(var topic:chapter.topics())if(matchTopic(scoped,topic.code(),topic.name(),new ArrayList<>())==null)content.createTopic(courseId,chapterId,new CreateTopicRequest(text(topic.code()),text(topic.name())),jwt);
        }
        for(var clo:outline.clos())if(match(oldClos,clo.code(),clo.description(),"description",new ArrayList<>(),"CLO")==null) {
            // Existing API requires a default Bloom; remember is its storage default, not inferred from the document.
            content.createClo(courseId,new SaveCourseCloRequest(text(clo.code()),text(clo.description()),null,"active",null),jwt);
        }
        return new Plan(courseId,plan.existing(),plan.created(),plan.skipped(),List.of());
    }
}
