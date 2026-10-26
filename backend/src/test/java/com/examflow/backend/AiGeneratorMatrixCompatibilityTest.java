package com.examflow.backend;

import com.examflow.backend.dto.AutomaticExamDto.*;
import com.examflow.backend.service.HybridExamOptimizer;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.Assumptions;
import java.util.List;
import static org.junit.jupiter.api.Assertions.*;

/** Synthetic in-memory bank only: no database, live questions or schema changes. */
class AiGeneratorMatrixCompatibilityTest {
    private List<Item> pool() {
        return List.of(
            new Item(1,"q1","","medium","1","1","CLO1",List.of()),
            new Item(2,"q2","","medium","1","1","CLO1",List.of()),
            new Item(3,"q3","","medium","2","2","CLO2",List.of()),
            new Item(4,"q4","","medium","2","2","CLO2",List.of()));
    }
    private Request request() {
        return new Request(1,"Synthetic exam","TEST",2,2,0,
            List.of(new Group("clo","CLO1",1),new Group("clo","CLO2",1)),true,true,false);
    }
    @Test void matrixConstraintsAndZeroOverlapValidationStillWork() {
        assertTrue(HybridExamOptimizer.valid(pool(),request(),new boolean[][]{{true,false,true,false},{false,true,false,true}}));
        assertFalse(HybridExamOptimizer.valid(pool(),request(),new boolean[][]{{true,true,false,false},{false,false,true,true}}));
        assertFalse(HybridExamOptimizer.valid(pool(),request(),new boolean[][]{{true,false,true,false},{true,false,true,false}}));
    }
    @Test void nativeOptimizerHonorsMatrixWhenNativeLibraryIsAvailable() {
        HybridExamOptimizer.Result result;
        try { result=new HybridExamOptimizer().optimize(pool(),request()); }
        catch (LinkageError error) {
            Assumptions.assumeTrue(false,"OR-Tools native library unavailable/incompatible in test environment: "+error.getClass().getSimpleName());
            return;
        }
        assertTrue(HybridExamOptimizer.valid(pool(),request(),result.selected()));
        assertEquals(0,result.objective());
    }
}
