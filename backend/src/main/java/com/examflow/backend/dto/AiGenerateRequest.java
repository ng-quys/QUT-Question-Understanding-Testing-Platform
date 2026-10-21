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
    @com.fasterxml.jackson.annotation.JsonInclude(com.fasterxml.jackson.annotation.JsonInclude.Include.NON_NULL) List<AiCloDto> selectedClos
) {
    public AiGenerateRequest(Long courseId,String provider,String instruction,String sourceText,List<AiUnitDto> units,String sourceProof,Double defaultScore) {
        this(courseId,provider,instruction,sourceText,units,sourceProof,defaultScore,null,null,null);
    }
    public boolean automatic() { return questionCount!=null || cloIds!=null; }
    public record AiCloDto(Long id,String code,String description) {}
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
