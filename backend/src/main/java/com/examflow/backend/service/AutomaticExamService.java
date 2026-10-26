package com.examflow.backend.service;

import com.examflow.backend.dto.AutomaticExamDto.*;
import com.examflow.backend.entity.*;
import com.examflow.backend.exception.ApiException;
import com.examflow.backend.repository.*;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import java.math.*;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicBoolean;

@Service
public class AutomaticExamService {
    @org.springframework.beans.factory.annotation.Autowired private org.springframework.jdbc.core.JdbcTemplate jdbc;
    public List<CourseChoice> availableCourses(UserEntity actor) {
        boolean admin="admin".equals(actor.getRole());
        return jdbc.query("select c.id,c.code,c.name from courses c where (? or c.created_by=? or exists (select 1 from course_faculties f where f.course_id=c.id and f.faculty_id=?) or exists (select 1 from exam_sitting_groups g join exam_sittings s on s.id=g.sitting_id where s.course_id=c.id and g.teacher_id=? and g.status<>'cancelled')) order by c.code,c.id",
            (rs,n)->new CourseChoice(rs.getLong("id"),rs.getString("code"),rs.getString("name")),admin,actor.getId(),actor.getId(),actor.getId());
    }
    public void requireCourse(UserEntity actor,long courseId) {
        if(availableCourses(actor).stream().noneMatch(c->c.id()==courseId))
            throw new ApiException(HttpStatus.FORBIDDEN,"Bạn chưa được phân công tạo đề cho học phần này hoặc phân công đã bị hủy.");
    }
    private final QuestionBankExamBridge bank;
    private final HybridExamOptimizer optimizer;
    private final CourseRepository courses;
    private final ExamRepository exams;
    private final ExamQuestionRepository questions;
    private final Semaphore slots=new Semaphore(2);
    private final Set<Long> activeActors=ConcurrentHashMap.newKeySet();
    private final Map<String,Draft> drafts=new ConcurrentHashMap<>();
    private static final long TTL=15*60*1000L;
    private static class Draft {
        final long actor,created=System.currentTimeMillis(); final Request request; final Preview preview;
        final AtomicBoolean saving=new AtomicBoolean(); volatile List<Long> saved;
        Draft(long actor,Request request,Preview preview){this.actor=actor;this.request=request;this.preview=preview;}
    }
    public AutomaticExamService(QuestionBankExamBridge bank,HybridExamOptimizer optimizer,CourseRepository courses,
            ExamRepository exams,ExamQuestionRepository questions) {
        this.bank=bank;this.optimizer=optimizer;this.courses=courses;this.exams=exams;this.questions=questions;
    }
    public Bank bank(long courseId) {
        var pool=bank.automaticPool(courseId);return new Bank(pool.size(),bank.automaticChoices(courseId,pool));
    }
    public Check check(Request r) { var pool=bank.automaticPool(r.courseId()); return check(r,pool); }

    private Check check(Request r,List<Item> pool) {
        List<String> errors=new ArrayList<>(),warnings=new ArrayList<>();
        List<GroupCheck> groups=new ArrayList<>();var choices=bank.automaticChoices(r.courseId(),pool);
        if(!Double.isFinite(r.overlapPercent())) errors.add("Tỷ lệ trùng phải là số hữu hạn.");
        if(pool.size()<r.questions()) errors.add("Ngân hàng chỉ có "+pool.size()+" câu hợp lệ, cần "+r.questions()+" câu mỗi đề.");
        if((long)pool.size()*(r.variants()+(long)r.variants()*(r.variants()-1)/2)>120_000)
            errors.add("Cấu hình vượt giới hạn xử lý hiện tại. Hãy giảm số mã đề hoặc thu gọn ngân hàng của học phần.");
        var keys=new HashSet<String>();
        for(Group g:r.groups()) {
            String key=g.dimension()+":"+g.value();
            var choice=choices.stream().filter(c->c.dimension().equals(g.dimension())&&c.value().equals(g.value())).findFirst();
            if(!keys.add(key)) errors.add("Một nhóm ma trận bị khai báo lặp: "+key);
            if(choice.isEmpty()){errors.add("Nhóm ma trận không thuộc dữ liệu học phần: "+key);continue;}
            int available=choice.get().available();String label=choice.get().label();
            groups.add(new GroupCheck(g.dimension(),g.value(),label,g.count(),available));
            if(g.count()>r.questions()||g.count()>available)errors.add(label+": cần "+g.count()+" câu, khả dụng "+available+"; số yêu cầu không được vượt số câu mỗi đề.");
            // Necessary pairwise bound for this group, including scarce groups inside overlapping dimensions.
            if(r.variants()>1 && Math.max(0,2*g.count()-available)>HybridExamOptimizer.maximumOverlap(r))
                errors.add(label+": thiếu câu để giữ giới hạn trùng giữa hai mã đề.");
        }
        for(String dimension:List.of("difficulty","chapter","topic","clo")) {
            var configured=r.groups().stream().filter(g->dimension.equals(g.dimension())).toList();
            if(configured.isEmpty())continue;
            // Values within one dimension are mutually exclusive; dimensions overlap one another.
            int sum=configured.stream().mapToInt(Group::count).sum();
            if(sum>r.questions())errors.add("Tổng số câu của nhóm "+dimensionName(dimension)+" vượt số câu mỗi đề.");
            boolean covers=pool.stream().allMatch(q->configured.stream().anyMatch(g->g.value().equals(q.value(dimension))));
            if(covers&&sum!=r.questions()) errors.add("Các nhóm "+dimensionName(dimension)+" phủ toàn bộ ngân hàng nên tổng số câu phải bằng "+r.questions()+".");
            int remaining=(int)pool.stream().filter(q->configured.stream().noneMatch(g->g.value().equals(q.value(dimension)))).count();
            if(r.questions()-sum>remaining)errors.add("Không đủ câu ngoài các nhóm "+dimensionName(dimension)+" đã cấu hình.");
        }
        if(r.variants()>1 && 2L*r.questions()-pool.size()>HybridExamOptimizer.maximumOverlap(r))
            errors.add("Ngân hàng quá ít câu để hai mã đề giữ giới hạn trùng đã chọn.");
        warnings.add("Kiểm tra sơ bộ chỉ phát hiện điều kiện cần. Khả năng thỏa đồng thời các nhóm chồng lấn sẽ được xác định khi tạo đề.");
        return new Check(errors.isEmpty(),pool.size(),HybridExamOptimizer.maximumOverlap(r),List.copyOf(groups),List.copyOf(errors),List.copyOf(warnings));
    }
    private String dimensionName(String d){return switch(d){case "difficulty"->"độ khó";case "chapter"->"chương";case "topic"->"chủ đề";default->"CLO";};}
    List<String> availableCodes(Request r) {
        return availableCodes(r,Collections.nCopies(r.variants(),null));
    }
    List<String> availableCodes(Request r,List<String> preferred) {
        List<String> result=new ArrayList<>(Collections.nCopies(r.variants(),null));
        Set<String> reserved=new HashSet<>();
        for(int i=0;i<r.variants();i++) {
            String value=preferred.get(i);
            if(value!=null&&!exams.existsByCodeIgnoreCase(value)&&reserved.add(value.toLowerCase(Locale.ROOT)))result.set(i,value);
        }
        long number=1;
        for(int i=0;i<result.size();i++)if(result.get(i)==null) {
            while(true) {
                String candidate=r.code().trim()+"-"+String.format(Locale.ROOT,"%03d",number++);
                if(!reserved.contains(candidate.toLowerCase(Locale.ROOT))&&!exams.existsByCodeIgnoreCase(candidate)) {
                    result.set(i,candidate);reserved.add(candidate.toLowerCase(Locale.ROOT));break;
                }
            }
        }
        return List.copyOf(result);
    }
    public List<String> savedCodes(List<Long> ids) {
        return ids.stream().map(id->exams.findById(id).orElseThrow().getCode()).toList();
    }

    public Preview generate(long actor,Request r) {
        if(!activeActors.add(actor))throw new ApiException(HttpStatus.TOO_MANY_REQUESTS,"Bạn đang có một yêu cầu tạo đề được xử lý.");
        boolean acquired=false;
        try {
            acquired=slots.tryAcquire();if(!acquired)throw new ApiException(HttpStatus.TOO_MANY_REQUESTS,"Máy chủ đang xử lý tạo đề. Vui lòng thử lại sau.");
            long start=System.nanoTime();var pool=bank.automaticPool(r.courseId());var check=check(r,pool);
            if(!check.valid())throw new ApiException(HttpStatus.BAD_REQUEST,String.join(" ",check.errors()));
            var solution=optimizer.optimize(pool,r);List<Variant> variants=new ArrayList<>();
            var codes=availableCodes(r);
            for(int k=0;k<r.variants();k++) {
                List<Item> selected=new ArrayList<>();for(int i=0;i<pool.size();i++)if(solution.selected()[k][i])selected.add(pool.get(i));
                if(r.shuffleQuestions())Collections.shuffle(selected);
                variants.add(new Variant(codes.get(k),List.copyOf(selected)));
            }
            List<Pair> pairs=new ArrayList<>();double maximum=0;
            for(int k=0;k<variants.size();k++)for(int l=k+1;l<variants.size();l++) {
                var ids=variants.get(k).questions().stream().map(Item::id).collect(java.util.stream.Collectors.toSet());
                int overlap=(int)variants.get(l).questions().stream().filter(q->ids.contains(q.id())).count();
                double percent=100.0*overlap/r.questions();maximum=Math.max(maximum,percent);
                pairs.add(new Pair(codes.get(k),codes.get(l),overlap,percent));
            }
            String id=UUID.randomUUID().toString();List<String> warnings=new ArrayList<>();
            if(!solution.provenOptimal())warnings.add("Đã tìm được bộ đề hợp lệ trong thời gian cho phép; chưa chứng minh mức trùng là tối ưu toàn cục.");
            warnings.add("Bản xem trước có hiệu lực 15 phút. Chỉ lưu sau khi bạn xác nhận.");
            warnings.add("Mã đề dự kiến được kiểm tra lại khi lưu và tự chuyển sang số còn trống nếu có người khác sử dụng trước.");
            var preview=new Preview(id,List.copyOf(variants),List.copyOf(pairs),solution.objective(),maximum,
                TimeUnit.NANOSECONDS.toMillis(System.nanoTime()-start),solution.status(),solution.provenOptimal(),check.groups(),List.copyOf(warnings));
            drafts.entrySet().removeIf(e->System.currentTimeMillis()-e.getValue().created>TTL || (e.getValue().actor==actor&&!e.getValue().saving.get()));
            if(drafts.size()>=100)throw new ApiException(HttpStatus.TOO_MANY_REQUESTS,"Bộ nhớ xem trước đang đầy. Vui lòng thử lại sau.");
            drafts.put(id,new Draft(actor,r,preview));return preview;
        }finally{if(acquired)slots.release();activeActors.remove(actor);}
    }
    public long previewCourse(long actor,String id){return draft(actor,id).request.courseId();}
    private Draft draft(long actor,String id) {
        Draft d=drafts.get(id);
        if(d==null||d.actor!=actor||System.currentTimeMillis()-d.created>TTL)
            throw new ApiException(HttpStatus.CONFLICT,"Bản xem trước đã hết hạn hoặc không thuộc tài khoản này. Hãy tạo lại.");
        return d;
    }

    @Transactional
    public List<Long> save(long actor,String id) {
        Draft d=draft(actor,id);
        if(d.saved!=null)return d.saved;
        if(!d.saving.compareAndSet(false,true))throw new ApiException(HttpStatus.CONFLICT,"Bộ đề đang được lưu. Vui lòng chờ.");
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization(){
            @Override public void afterCompletion(int status){d.saving.set(false);}
        });
        Request r=d.request;var course=courses.findById(r.courseId()).orElseThrow(()->new ApiException(HttpStatus.NOT_FOUND,"Học phần không còn tồn tại."));
        var fresh=bank.automaticPool(r.courseId()).stream().collect(java.util.stream.Collectors.toMap(Item::id,q->q));
        for(var variant:d.preview.variants()) {
            for(var q:variant.questions())if(!q.equals(fresh.get(q.id())))throw new ApiException(HttpStatus.CONFLICT,"Ngân hàng đã thay đổi sau khi xem trước. Hãy tạo lại để kiểm tra câu hỏi và ma trận.");
        }
        List<Long> ids=new ArrayList<>();
        // PostgreSQL transaction lock also excludes INSERT/UPDATE from other writers and
        // other application instances. The existing UNIQUE(exams.code) remains the final guard.
        // Acquire only after validating snapshots, and hold until this transaction commits.
        jdbc.execute("LOCK TABLE public.exams IN SHARE ROW EXCLUSIVE MODE");
        var codes=availableCodes(r,d.preview.variants().stream().map(Variant::code).toList());
        int variantIndex=0;
        for(var variant:d.preview.variants()) {
            Exam e=new Exam();e.setCourse(course);e.setCreatedBy(actor);e.setCode(codes.get(variantIndex++));e.setTitle(r.title().trim());
            e.setTotalQuestions(r.questions());e.setTotalPoints(BigDecimal.TEN);e.setStatus("draft");
            e.setShuffleQuestions(r.shuffleQuestions());e.setShuffleAnswers(r.shuffleAnswers());e.setAntiCheatMode(r.antiCheatMode());
            e=exams.saveAndFlush(e);ids.add(e.getId());
            // Exact total of 10, including the final rounding remainder.
            BigDecimal each=BigDecimal.TEN.divide(BigDecimal.valueOf(r.questions()),4,RoundingMode.DOWN);
            for(int i=0;i<variant.questions().size();i++) {
                Item q=variant.questions().get(i);ExamQuestion eq=new ExamQuestion();eq.setExam(e);eq.setQuestionId(q.id());eq.setPosition(i+1);
                eq.setPoints(i==r.questions()-1?BigDecimal.TEN.subtract(each.multiply(BigDecimal.valueOf(i))):each);
                eq=questions.saveAndFlush(eq);bank.createAutomaticSnapshot(eq.getId(),e.getId(),r.courseId(),q);
            }
        }
        List<Long> result=List.copyOf(ids);
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization(){@Override public void afterCommit(){d.saved=result;}});
        return result;
    }
}
