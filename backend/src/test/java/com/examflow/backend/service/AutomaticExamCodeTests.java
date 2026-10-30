package com.examflow.backend.service;

import com.examflow.backend.dto.AutomaticExamDto.*;
import com.examflow.backend.entity.*;
import com.examflow.backend.repository.*;
import org.junit.jupiter.api.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicLong;
import java.util.concurrent.locks.ReentrantLock;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class AutomaticExamCodeTests {
    final ExamRepository exams=mock(ExamRepository.class);
    final CourseRepository courses=mock(CourseRepository.class);
    final ExamQuestionRepository questions=mock(ExamQuestionRepository.class);
    final QuestionBankExamBridge bank=mock(QuestionBankExamBridge.class);
    final HybridExamOptimizer optimizer=mock(HybridExamOptimizer.class);
    final JdbcTemplate jdbc=mock(JdbcTemplate.class);
    final AutomaticExamService service=new AutomaticExamService(bank,optimizer,courses,exams,questions);
    final Set<String> existing=ConcurrentHashMap.newKeySet();
    final AtomicLong ids=new AtomicLong();
    final List<Item> pool=List.of(new Item(12,"Nội dung","Giải thích","1","none","none","none",List.of()));

    static Request request(int count){return new Request(1,"Đề kiểm thử","CSDL_CK",count,1,100,List.of(),false,false,false);}
    @BeforeEach void setup(){
        ReflectionTestUtils.setField(service,"jdbc",jdbc);
        when(exams.existsByCodeIgnoreCase(anyString())).thenAnswer(c->existing.contains(c.<String>getArgument(0).toLowerCase(Locale.ROOT)));
        when(bank.automaticPool(1)).thenReturn(pool);when(bank.automaticChoices(1,pool)).thenReturn(List.of());
        when(courses.findById(1L)).thenReturn(Optional.of(new Course()));
        when(optimizer.optimize(eq(pool),any())).thenAnswer(c->{
            Request r=c.getArgument(1);boolean[][] selected=new boolean[r.variants()][1];for(var row:selected)row[0]=true;
            return new HybridExamOptimizer.Result(selected,0,"OPTIMAL",true);
        });
        when(exams.saveAndFlush(any())).thenAnswer(c->{Exam e=c.getArgument(0);assertTrue(existing.add(e.getCode().toLowerCase(Locale.ROOT)));e.setId(ids.incrementAndGet());return e;});
        when(questions.saveAndFlush(any())).thenAnswer(c->{ExamQuestion q=c.getArgument(0);q.setId(ids.incrementAndGet());return q;});
    }
    @Test void unusedCodesKeepExistingFormat(){assertEquals(List.of("CSDL_CK-001","CSDL_CK-002"),service.availableCodes(request(2)));}
    @Test void duplicatesAreSkippedCaseInsensitivelyIncludingGaps(){
        existing.addAll(List.of("csdl_ck-001","csdl_ck-002","csdl_ck-003","csdl_ck-005"));
        assertEquals(List.of("CSDL_CK-004","CSDL_CK-006"),service.availableCodes(request(2)));
    }
    @Test void freePreviewCodesRemainUnchangedEvenIfEarlierCodeWasDeleted(){
        assertEquals(List.of("CSDL_CK-003","CSDL_CK-004"),service.availableCodes(request(2),List.of("CSDL_CK-003","CSDL_CK-004")));
    }
    @Test void onlyCollidingPreviewCodeChangesAndNeverTakesAnotherVariantsCode(){
        existing.add("csdl_ck-001");
        assertEquals(List.of("CSDL_CK-003","CSDL_CK-002"),service.availableCodes(request(2),List.of("CSDL_CK-001","CSDL_CK-002")));
    }
    @Test void previewAndOverlapLabelsUseAvailableCodesWithoutChangingQuestions(){
        existing.addAll(List.of("csdl_ck-001","csdl_ck-002"));
        assertTrue(service.check(request(2)).valid());
        var preview=service.generate(7,request(2));
        assertEquals(List.of("CSDL_CK-003","CSDL_CK-004"),preview.variants().stream().map(Variant::code).toList());
        assertEquals("CSDL_CK-003",preview.pairs().get(0).first());assertEquals("CSDL_CK-004",preview.pairs().get(0).second());
        assertEquals(pool,preview.variants().get(0).questions());verify(optimizer).optimize(pool,request(2));
    }
    @Test void saveRechecksAfterLockAndRetryReturnsSameIds(){
        var preview=service.generate(7,request(2));existing.add("csdl_ck-001");
        TransactionSynchronizationManager.initSynchronization();
        try {
            var saved=service.save(7,preview.previewId());
            var order=inOrder(jdbc,exams);order.verify(jdbc).execute("LOCK TABLE public.exams IN SHARE ROW EXCLUSIVE MODE");order.verify(exams).existsByCodeIgnoreCase("CSDL_CK-001");
            assertTrue(existing.containsAll(List.of("csdl_ck-002","csdl_ck-003")));
            var syncs=TransactionSynchronizationManager.getSynchronizations();syncs.forEach(TransactionSynchronization::afterCommit);syncs.forEach(s->s.afterCompletion(TransactionSynchronization.STATUS_COMMITTED));
            assertEquals(saved,service.save(7,preview.previewId()));verify(exams,times(2)).saveAndFlush(any());
        }finally{TransactionSynchronizationManager.clearSynchronization();}
    }
    @Test void simultaneousSavesWithSamePreviewCodesAreReallocatedUnderTransactionLock()throws Exception{
        var first=service.generate(7,request(2));var second=service.generate(8,request(2));
        // Unit simulation of PostgreSQL's transaction-scoped table lock. Real lock coverage is opt-in.
        var lock=new ReentrantLock();
        doAnswer(c->{lock.lock();TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization(){
            @Override public void afterCompletion(int status){lock.unlock();}
        });return null;}).when(jdbc).execute(anyString());
        var ready=new CountDownLatch(2);var start=new CountDownLatch(1);var executor=Executors.newFixedThreadPool(2);
        try {
            List<Future<List<Long>>> results=new ArrayList<>();
            for(int i=0;i<2;i++){final int index=i;results.add(executor.submit(()->{
                TransactionSynchronizationManager.initSynchronization();ready.countDown();assertTrue(start.await(5,TimeUnit.SECONDS));
                try {
                    var result=service.save(index==0?7:8,index==0?first.previewId():second.previewId());
                    TransactionSynchronizationManager.getSynchronizations().forEach(TransactionSynchronization::afterCommit);return result;
                } finally {
                    TransactionSynchronizationManager.getSynchronizations().forEach(s->s.afterCompletion(TransactionSynchronization.STATUS_COMMITTED));
                    TransactionSynchronizationManager.clearSynchronization();
                }
            }));}
            assertTrue(ready.await(5,TimeUnit.SECONDS));start.countDown();
            assertEquals(2,results.get(0).get(5,TimeUnit.SECONDS).size());assertEquals(2,results.get(1).get(5,TimeUnit.SECONDS).size());
            assertEquals(Set.of("csdl_ck-001","csdl_ck-002","csdl_ck-003","csdl_ck-004"),existing);
        }finally{executor.shutdownNow();}
    }
}
