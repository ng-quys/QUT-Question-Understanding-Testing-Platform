package com.examflow.backend.service;

import com.examflow.backend.entity.*;
import com.examflow.backend.exception.ApiException;
import jakarta.persistence.*;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.math.BigDecimal;
import java.util.*;

@Service
public class AdminExamContentService {
    @org.springframework.beans.factory.annotation.Autowired private ExamSnapshotReadService snapshots;
    @org.springframework.beans.factory.annotation.Autowired private AdminCodeGenerator codes;
    @PersistenceContext private EntityManager em;
    private final AdminCatalogService catalog;
    private final AdminService audit;
    public AdminExamContentService(AdminCatalogService catalog,AdminService audit){this.catalog=catalog;this.audit=audit;}
    public record AnswerInput(@NotBlank @Size(max=10000) String content,boolean correct){}
    public record QuestionInput(Long id,@NotBlank @Size(max=20000) String content,
        @NotNull @DecimalMin("0.01") @DecimalMax("100") @Digits(integer=3,fraction=2) BigDecimal points,
        @NotNull @Size(min=2,max=10) List<@Valid AnswerInput> answers){}
    public record Input(@NotBlank String expectedToken,@NotBlank @Size(max=200) String title,
        @NotNull @Size(min=1,max=500) List<@Valid QuestionInput> questions){}
    private static ApiException bad(String message){return new ApiException(HttpStatus.BAD_REQUEST,message);}
    private static ApiException conflict(String message){return new ApiException(HttpStatus.CONFLICT,message);}
    static String token(Map<String,Object> review){
        // Stable content token, independent of transient permission/status flags.
        StringBuilder value=new StringBuilder();
        for(String key:List.of("id","code","title","totalPoints","questions")){
            append(value,review.get(key));
        }return CourseAllocationService.hash(value.toString());
    }
    private static void append(StringBuilder target,Object value){
        if(value instanceof Map<?,?> map){target.append('{');var keys=map.keySet().stream().map(Object::toString).sorted().toList();for(String key:keys){append(target,key);append(target,map.get(key));}target.append('}');}
        else if(value instanceof Collection<?> list){target.append('[');list.forEach(item->append(target,item));target.append(']');}
        else{String text=value instanceof Number?new BigDecimal(value.toString()).stripTrailingZeros().toPlainString():String.valueOf(value);target.append(text.length()).append(':').append(text);}
    }
    @Transactional
    public Map<String,Object> save(long actor,long id,Input input,boolean copy){
        Exam source=em.find(Exam.class,id,LockModeType.PESSIMISTIC_WRITE);
        if(source==null)throw new ApiException(HttpStatus.NOT_FOUND,"Không tìm thấy đề thi");
        var original=catalog.reviewExam(id);
        if(!Objects.equals(original.get("revisionToken"),input.expectedToken()))throw conflict("Đề đã được thay đổi. Tải lại đề trước khi chỉnh sửa tiếp.");
        if(!copy&&!Boolean.TRUE.equals(original.get("canEdit")))throw conflict("Đề đã được sử dụng. Chọn Tạo bản chỉnh sửa để giữ nguyên bài làm cũ.");
        if(input.questions()==null||input.questions().isEmpty()||input.questions().size()>500)throw bad("Đề cần từ 1 đến 500 câu hỏi");
        Map<Long,Question> originals=new HashMap<>();
        boolean snapshotMode=snapshots!=null&&snapshots.usesSnapshots(id);
        Map<Long,ExamSnapshotReadService.Snapshot> frozen=new HashMap<>();
        if(snapshotMode){for(ExamQuestion link:em.createQuery("SELECT eq FROM ExamQuestion eq WHERE eq.exam.id=:id",ExamQuestion.class).setParameter("id",id).getResultList())frozen.put(link.getQuestionId(),snapshots.find(link.getId()).orElseThrow(()->conflict("Đề thiếu bản lưu câu hỏi")));}
        else for(Question q:em.createQuery("SELECT q FROM Question q WHERE q.id IN (SELECT eq.questionId FROM ExamQuestion eq WHERE eq.exam.id=:id)",Question.class).setParameter("id",id).getResultList())originals.put(q.getId(),q);
        Set<Long> seen=new HashSet<>();BigDecimal total=BigDecimal.ZERO;
        for(var q:input.questions()){
            if(q.id()!=null&&(!(snapshotMode?frozen.containsKey(q.id()):originals.containsKey(q.id()))||!seen.add(q.id())))throw bad("Danh sách câu hỏi không khớp đề đang chỉnh sửa");
            if(q.content()==null||q.content().isBlank()||q.points()==null||q.points().signum()<=0||q.points().compareTo(BigDecimal.valueOf(100))>0)throw bad("Nội dung và điểm câu hỏi không hợp lệ");
            if(q.answers()==null||q.answers().size()<2||q.answers().size()>10||q.answers().stream().filter(AnswerInput::correct).count()!=1||q.answers().stream().anyMatch(a->a.content()==null||a.content().isBlank()))throw bad("Mỗi câu cần 2–10 lựa chọn và đúng một đáp án đúng");
            total=total.add(q.points());
        }
        if(total.compareTo(BigDecimal.valueOf(100))>0)throw bad("Tổng điểm đề tối đa 100 điểm");
        Exam target=source;
        if(copy){
            target=new Exam();target.setCourse(source.getCourse());target.setCode(codes.next(AdminCodeGenerator.Kind.EXAM));target.setStatus("draft");
            target.setCreatedBy(source.getCreatedBy()==null?source.getCourse().getCreatedBy():source.getCreatedBy());target.setShuffleQuestions(source.getShuffleQuestions());target.setShuffleAnswers(source.getShuffleAnswers());target.setAntiCheatMode(source.getAntiCheatMode());
        }
        target.setTitle(input.title().trim());target.setTotalQuestions(input.questions().size());target.setTotalPoints(total);
        if(copy){em.persist(target);em.flush();em.createNativeQuery("INSERT INTO exam_ai_policies(exam_id,enabled) SELECT :target,COALESCE((SELECT enabled FROM exam_ai_policies WHERE exam_id=:source),TRUE)").setParameter("target",target.getId()).setParameter("source",id).executeUpdate();}
        else {
            if(snapshotMode)em.createNativeQuery("DELETE FROM exam_question_snapshots WHERE exam_id=:id").setParameter("id",id).executeUpdate();
            em.createNativeQuery("DELETE FROM exam_questions WHERE exam_id=:id").setParameter("id",id).executeUpdate();
        }
        int position=0;
        for(var item:input.questions()){
            if(snapshotMode){
                ExamQuestion link=new ExamQuestion();link.setExam(target);link.setQuestionId(item.id()==null?1:item.id());link.setPosition(++position);link.setPoints(item.points());em.persist(link);em.flush();
                link.setQuestionId(-link.getId());em.flush();
                snapshots.saveAdminSnapshot(link.getId(),target.getId(),source.getCourse().getId(),item.id()==null?null:frozen.get(item.id()),item.content(),item.answers());
                continue;
            }
            Question old=item.id()==null?null:originals.get(item.id());Question question=new Question();question.setCourse(source.getCourse());question.setContent(item.content().trim());question.setStatus("approved");question.setSource("manual");question.setDefaultScore(item.points());
            question.setCognitiveLevelId(old==null?(short)1:old.getCognitiveLevelId());question.setDifficultyLevelId(old==null?(short)1:old.getDifficultyLevelId());
            if(old!=null){question.setChapterId(old.getChapterId());question.setTopicId(old.getTopicId());question.setClo(old.getClo());question.setExplanation(old.getExplanation());}
            em.persist(question);short answerPosition=0;
            for(var answer:item.answers()){Answer entity=new Answer();entity.setQuestion(question);entity.setContent(answer.content().trim());entity.setCorrect(answer.correct());entity.setLabel(String.valueOf((char)('A'+answerPosition)));entity.setPosition(++answerPosition);em.persist(entity);}
            ExamQuestion link=new ExamQuestion();link.setExam(target);link.setQuestionId(question.getId());link.setPosition(++position);link.setPoints(item.points());em.persist(link);
        }
        em.flush();audit.audit(actor,copy?"REVISE_EXAM":"EDIT_EXAM_CONTENT","EXAM",target.getId(),"sourceExamId="+id+"; questions="+position);
        return catalog.reviewExam(target.getId());
    }
}
