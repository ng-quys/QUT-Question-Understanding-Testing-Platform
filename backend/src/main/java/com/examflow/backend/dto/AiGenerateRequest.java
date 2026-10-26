package com.examflow.backend.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.*;

import java.util.List;

public record AiGenerateRequest(
    @NotNull Long courseId,
    @NotBlank String provider,
    String instruction,
    String sourceText,
    List<@Valid AiUnitDto> units,
    String sourceProof,
    @DecimalMin("0.0") Double defaultScore,
    @com.fasterxml.jackson.annotation.JsonInclude(com.fasterxml.jackson.annotation.JsonInclude.Include.NON_NULL) List<Long> cloIds,
    @com.fasterxml.jackson.annotation.JsonInclude(com.fasterxml.jackson.annotation.JsonInclude.Include.NON_NULL)
    @com.fasterxml.jackson.databind.annotation.JsonDeserialize(using=StrictCount.class) Integer questionCount,
    @com.fasterxml.jackson.annotation.JsonInclude(com.fasterxml.jackson.annotation.JsonInclude.Include.NON_NULL) List<AiCloDto> selectedClos,
    @com.fasterxml.jackson.annotation.JsonInclude(com.fasterxml.jackson.annotation.JsonInclude.Include.NON_NULL) Integer batchSize,
    @com.fasterxml.jackson.annotation.JsonInclude(com.fasterxml.jackson.annotation.JsonInclude.Include.NON_NULL)
    List<@Valid AiDocumentRefDto> documentRefs,
    @com.fasterxml.jackson.annotation.JsonInclude(com.fasterxml.jackson.annotation.JsonInclude.Include.NON_NULL)
    @com.fasterxml.jackson.databind.annotation.JsonDeserialize(using=StrictCount.class) Integer inferenceBatchSize
) {
    public AiGenerateRequest(Long courseId,String provider,String instruction,String sourceText,List<AiUnitDto> units,String sourceProof,Double defaultScore) {
        this(courseId,provider,instruction,sourceText,units,sourceProof,defaultScore,null,null,null,null,null,null);
    }
    public AiGenerateRequest(Long courseId,String provider,String instruction,String sourceText,List<AiUnitDto> units,String sourceProof,
                             Double defaultScore,List<Long> cloIds,Integer questionCount,List<AiCloDto> selectedClos) {
        this(courseId,provider,instruction,sourceText,units,sourceProof,defaultScore,cloIds,questionCount,selectedClos,null,null,null);
    }
    public AiGenerateRequest(Long courseId,String provider,String instruction,String sourceText,List<AiUnitDto> units,String sourceProof,
                             Double defaultScore,List<Long> cloIds,Integer questionCount,List<AiCloDto> selectedClos,Integer batchSize) {
        this(courseId,provider,instruction,sourceText,units,sourceProof,defaultScore,cloIds,questionCount,selectedClos,batchSize,null,null);
    }
    public AiGenerateRequest(Long courseId,String provider,String instruction,String sourceText,List<AiUnitDto> units,String sourceProof,
                             Double defaultScore,List<Long> cloIds,Integer questionCount,List<AiCloDto> selectedClos,Integer batchSize,
                             List<AiDocumentRefDto> documentRefs) {
        this(courseId,provider,instruction,sourceText,units,sourceProof,defaultScore,cloIds,questionCount,selectedClos,batchSize,documentRefs,null);
    }
    public boolean automatic() { return questionCount!=null || cloIds!=null; }
    public int effectiveBatchSize() { return batchSize==null?5:batchSize; }
    public int effectiveInferenceBatchSize() { return inferenceBatchSize==null?1:inferenceBatchSize; }
    public record AiCloDto(Long id,String code,String description) {}
    public record AiDocumentRefDto(
        @NotNull java.util.UUID documentId,
        @Min(1) int revision,
        @NotNull java.util.UUID indexId,
        @NotBlank @Pattern(regexp="[0-9a-f]{64}") String configHash
    ) {}
    public static class StrictCount extends com.fasterxml.jackson.databind.JsonDeserializer<Integer> {
        @Override public Integer deserialize(com.fasterxml.jackson.core.JsonParser parser,com.fasterxml.jackson.databind.DeserializationContext context) throws java.io.IOException {
            if(parser.currentToken()!=com.fasterxml.jackson.core.JsonToken.VALUE_NUMBER_INT)
                return (Integer)context.handleUnexpectedToken(Integer.class,parser);
            return parser.getIntValue();
        }
    }
    public record AiUnitDto(
        String name,
        Long chapterId,
        Long cloId,
        @Min(0) int nb,
        @Min(0) int th,
        @Min(0) int vd
    ) {}
}
