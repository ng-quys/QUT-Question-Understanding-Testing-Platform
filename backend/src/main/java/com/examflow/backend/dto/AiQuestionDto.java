package com.examflow.backend.dto;
import java.util.List;
@com.fasterxml.jackson.annotation.JsonInclude(com.fasterxml.jackson.annotation.JsonInclude.Include.NON_NULL)
public record AiQuestionDto(String content, List<String> options, int correctIndex,
    String explanation, String bloom, Long chapterId, Long cloId, String evidenceQuote,
    DuplicateWarning duplicateWarning) {
    public record DuplicateWarning(Long questionId,String content,Double similarity,String matchType,String source,Double threshold) {}
    public AiQuestionDto(String content,List<String> options,int correctIndex,String explanation,String bloom,Long chapterId,Long cloId) {
        this(content,options,correctIndex,explanation,bloom,chapterId,cloId,null,null);
    }
    public AiQuestionDto(String content,List<String> options,int correctIndex,String explanation,String bloom,Long chapterId,Long cloId,String evidenceQuote) {
        this(content,options,correctIndex,explanation,bloom,chapterId,cloId,evidenceQuote,null);
    }
}
