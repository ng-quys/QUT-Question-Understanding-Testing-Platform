package com.examflow.backend.service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Random;
import java.util.Set;
import java.util.stream.Collectors;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

import com.examflow.backend.dto.ExamSummaryDto;
import com.examflow.backend.dto.QuickExamRequest;
import com.examflow.backend.dto.QuickExamResult;
import com.examflow.backend.entity.Course;
import com.examflow.backend.entity.DifficultyLevel;
import com.examflow.backend.entity.Exam;
import com.examflow.backend.entity.ExamQuestion;
import com.examflow.backend.entity.Question;
import com.examflow.backend.exception.ApiException;
import com.examflow.backend.repository.CourseRepository;
import com.examflow.backend.repository.DifficultyLevelRepository;
import com.examflow.backend.repository.ExamQuestionRepository;
import com.examflow.backend.repository.ExamRepository;
import com.examflow.backend.repository.QuestionRepository;

import jakarta.transaction.Transactional;

@Service
public class TeacherExamService {
    private final CourseRepository courseRepository;
    private final QuestionRepository questionRepository;
    private final ExamRepository examRepository;
    private final ExamQuestionRepository examQuestionRepository;
    private final DifficultyLevelRepository difficultyLevelRepository;

    public TeacherExamService(CourseRepository courseRepository, QuestionRepository questionRepository,
                              ExamRepository examRepository, ExamQuestionRepository examQuestionRepository, DifficultyLevelRepository difficultyLevelRepository) {
        this.courseRepository = courseRepository; this.questionRepository = questionRepository;
        this.examRepository = examRepository; this.examQuestionRepository = examQuestionRepository; this.difficultyLevelRepository = difficultyLevelRepository;
    }

    @Transactional
    public List<ExamSummaryDto> list() {
        return examRepository.findAllByOrderByCreatedAtDesc().stream().map(this::summary).toList();
    }

    @Transactional public ExamSummaryDto setStatus(Long id,String status){ if(!Set.of("draft","upcoming","ongoing","completed","cancelled").contains(status)) throw new ApiException(HttpStatus.BAD_REQUEST,"Trạng thái đề không hợp lệ"); Exam e=examRepository.findById(id).orElseThrow(()->new ApiException(HttpStatus.NOT_FOUND,"Không tìm thấy đề thi")); e.setStatus(status); return summary(examRepository.save(e)); }
    @Transactional public void delete(Long id){ Exam e=examRepository.findById(id).orElseThrow(()->new ApiException(HttpStatus.NOT_FOUND,"Không tìm thấy đề thi")); if(!"draft".equalsIgnoreCase(e.getStatus())) throw new ApiException(HttpStatus.CONFLICT,"Chỉ được xóa đề ở trạng thái nháp"); examQuestionRepository.deleteAll(examQuestionRepository.findByExamIdWithQuestion(id)); examRepository.delete(e); }

    @Transactional
    public QuickExamResult createQuick(QuickExamRequest r) {
        if (Math.abs(r.mediumPercent() + r.goodPercent() + r.excellentPercent() - 100.0) > 0.001)
            throw new ApiException(HttpStatus.BAD_REQUEST, "Tổng tỷ lệ độ khó phải bằng 100%.");
        if (examRepository.existsByCodeIgnoreCase(r.code()))
            throw new ApiException(HttpStatus.CONFLICT, "Mã đề đã tồn tại.");

        Course course = courseRepository.findById(r.courseId())
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Không tìm thấy môn học."));
        List<Long> clos = r.cloIds() == null ? List.of() : r.cloIds();
        List<Question> pool = questionRepository.findApprovedPool(r.courseId(), clos.isEmpty() ? List.of(-1L) : clos, clos.isEmpty());

        int[] counts = allocate(r.totalQuestions(), new double[]{r.mediumPercent(), r.goodPercent(), r.excellentPercent()});
        short mediumId = difficultyLevelRepository.findByLevelOrder((short)1).orElseThrow(() -> new ApiException(HttpStatus.BAD_REQUEST, "Thiếu difficulty level bậc 1 (Trung bình)." )).getId();
        short goodId = difficultyLevelRepository.findByLevelOrder((short)2).orElseThrow(() -> new ApiException(HttpStatus.BAD_REQUEST, "Thiếu difficulty level bậc 2 (Khá)." )).getId();
        short excellentId = difficultyLevelRepository.findByLevelOrder((short)3).orElseThrow(() -> new ApiException(HttpStatus.BAD_REQUEST, "Thiếu difficulty level bậc 3 (Giỏi)." )).getId();
        Map<Short, Integer> need = Map.of(mediumId, counts[0], goodId, counts[1], excellentId, counts[2]);
        Map<Short, List<Question>> byDifficulty = pool.stream().collect(Collectors.groupingBy(Question::getDifficultyLevelId));
        for (var e : need.entrySet()) {
            int available = byDifficulty.getOrDefault(e.getKey(), List.of()).size();
            if (available < e.getValue())
                throw new ApiException(HttpStatus.BAD_REQUEST, "Ngân hàng câu hỏi không đủ mức độ " + difficultyName(e.getKey()) + ": cần " + e.getValue() + ", có " + available + ".");
        }

        List<Object[]> pairs = examQuestionRepository.findExamQuestionPairsByCourse(r.courseId());
        Map<Long, Set<Long>> oldExams = new HashMap<>();
        for (Object[] p : pairs) oldExams.computeIfAbsent((Long)p[0], k -> new HashSet<>()).add((Long)p[1]);
        int maxOverlap = (int)Math.floor(r.totalQuestions() * r.maxOverlapPercent() / 100.0);

        List<Question> selected = selectWithOverlapLimit(byDifficulty, need, oldExams, maxOverlap, r.totalQuestions());
        if (selected == null)
            throw new ApiException(HttpStatus.BAD_REQUEST, "Không thể tạo đề thỏa giới hạn trùng " + r.maxOverlapPercent() + "%. Hãy tăng ngân hàng câu hỏi hoặc nới tỷ lệ trùng.");
        Collections.shuffle(selected);

        Exam exam = new Exam(); exam.setCourse(course); exam.setCode(r.code().trim()); exam.setTitle(r.title().trim());
        exam.setDurationMinutes(r.durationMinutes()); exam.setTotalQuestions(r.totalQuestions()); exam.setTotalPoints(BigDecimal.TEN);
        exam.setStatus("draft"); exam.setShuffleQuestions(r.shuffleQuestions()); exam.setShuffleAnswers(r.shuffleAnswers()); exam.setAntiCheatMode(r.antiCheatMode());
        exam = examRepository.save(exam);

        BigDecimal each = BigDecimal.TEN.divide(BigDecimal.valueOf(r.totalQuestions()), 4, RoundingMode.HALF_UP);
        for (int i=0;i<selected.size();i++) { ExamQuestion eq = new ExamQuestion(); eq.setExam(exam); eq.setQuestion(selected.get(i)); eq.setPosition(i+1); eq.setPoints(each); examQuestionRepository.save(eq); }

        int actualMax = oldExams.values().stream().mapToInt(s -> (int)selected.stream().filter(q -> s.contains(q.getId())).count()).max().orElse(0);
        return new QuickExamResult(summary(exam), counts[0], counts[1], counts[2], maxOverlap, actualMax,
                selected.stream().map(Question::getId).toList(), List.of());
    }

    private List<Question> selectWithOverlapLimit(Map<Short,List<Question>> grouped, Map<Short,Integer> need,
                                                   Map<Long,Set<Long>> oldExams, int maxOverlap, int total) {
        Random random = new Random();
        for (int attempt=0; attempt<500; attempt++) {
            List<Question> pick = new ArrayList<>();
            for (var entry : need.entrySet()) { List<Question> copy = new ArrayList<>(grouped.getOrDefault(entry.getKey(),List.of())); Collections.shuffle(copy, random); pick.addAll(copy.subList(0, entry.getValue())); }
            boolean ok = oldExams.values().stream().allMatch(old -> pick.stream().filter(q -> old.contains(q.getId())).count() <= maxOverlap);
            if (ok && pick.size()==total) return pick;
        }
        return null;
    }

    private int[] allocate(int total, double[] pct) {
        int[] base = new int[pct.length]; double[] rem = new double[pct.length]; int sum=0;
        for(int i=0;i<pct.length;i++){ double exact=total*pct[i]/100.0; base[i]=(int)Math.floor(exact); rem[i]=exact-base[i]; sum+=base[i]; }
        while(sum<total){ int best=0; for(int i=1;i<rem.length;i++) if(rem[i]>rem[best]) best=i; base[best]++; rem[best]=-1; sum++; }
        return base;
    }
    private String difficultyName(short d){ return difficultyLevelRepository.findById(d).map(DifficultyLevel::getName).orElse("#"+d); }
    private ExamSummaryDto summary(Exam e){ return new ExamSummaryDto(e.getId(),e.getCode(),e.getTitle(),e.getCourse().getId(),e.getCourse().getCode(),e.getCourse().getName(),e.getDurationMinutes(),e.getTotalQuestions(),e.getStatus(),e.getExamDate(),Boolean.TRUE.equals(e.getShuffleQuestions()),Boolean.TRUE.equals(e.getShuffleAnswers()),Boolean.TRUE.equals(e.getAntiCheatMode())); }
}
