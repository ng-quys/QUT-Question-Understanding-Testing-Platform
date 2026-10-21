package com.examflow.backend.dto;
import java.util.List;
@com.fasterxml.jackson.annotation.JsonInclude(com.fasterxml.jackson.annotation.JsonInclude.Include.NON_NULL)
public record AiQuestionDto(String content, List<String> options, int correctIndex,
    String explanation, String bloom, Long chapterId, Long cloId, String evidenceQuote) {
    public AiQuestionDto(String content,List<String> options,int correctIndex,String explanation,String bloom,Long chapterId,Long cloId) {
        this(content,options,correctIndex,explanation,bloom,chapterId,cloId,null);
    }
}
