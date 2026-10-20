package com.examflow.backend.service;

import org.junit.jupiter.api.Test;
import java.time.LocalDateTime;
import static org.junit.jupiter.api.Assertions.*;

class TeacherAssignedExamPolicyTests {
    final LocalDateTime now=LocalDateTime.of(2030,1,1,8,0);
    @Test void futureUnpublishedGroupCanChooseAndReplaceExam(){assertEquals("",TeacherAssignedExamService.changeRestriction("scheduled",now.plusHours(1),false,null,0,now));}
    @Test void scheduledStartIsAnExactBoundary(){assertFalse(TeacherAssignedExamService.changeRestriction("scheduled",now,false,null,0,now).isEmpty());assertFalse(TeacherAssignedExamService.changeRestriction("ongoing",now.minusSeconds(1),false,null,0,now).isEmpty());}
    @Test void publishedOrAlreadyMaterializedSessionCannotChangeExam(){assertFalse(TeacherAssignedExamService.changeRestriction("scheduled",now.plusHours(1),true,10L,0,now).isEmpty());assertFalse(TeacherAssignedExamService.changeRestriction("scheduled",now.plusHours(1),false,10L,0,now).isEmpty());}
    @Test void existingAttemptsLockEvenAnUnpublishedFutureGroup(){assertFalse(TeacherAssignedExamService.changeRestriction("scheduled",now.plusHours(1),false,null,1,now).isEmpty());}
    @Test void cancelledAndCompletedGroupsRemainLocked(){for(String status:new String[]{"cancelled","completed"})assertFalse(TeacherAssignedExamService.changeRestriction(status,now.plusHours(1),false,null,0,now).isEmpty());}
}
