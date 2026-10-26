package com.examflow.backend.service;

import com.examflow.backend.dto.CourseOutline;
import com.examflow.backend.exception.ApiException;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.file.*;
import java.util.Locale;
import java.util.concurrent.Semaphore;
import java.util.concurrent.TimeUnit;

/** Isolated local parser process. Never invokes AI Service, Ollama or credits APIs. */
@Service
public class CourseOutlineExtractionService {
    @Value("${course.outline.python:}") private String python;
    @Value("${course.outline.script:../scripts/course-outline/extract.py}") private String script;
    private final ObjectMapper json;
    private final Semaphore readers = new Semaphore(2);
    public CourseOutlineExtractionService(ObjectMapper json) { this.json=json; }

    public CourseOutline extract(MultipartFile file) {
        String name=file.getOriginalFilename()==null?"":file.getOriginalFilename().toLowerCase(Locale.ROOT);
        String suffix=name.endsWith(".pdf")?".pdf":name.endsWith(".docx")?".docx":null;
        if(suffix==null)throw new ApiException(HttpStatus.UNSUPPORTED_MEDIA_TYPE,"Chỉ hỗ trợ PDF có text layer hoặc DOCX.");
        if(file.isEmpty()||file.getSize()>20*1024*1024)throw new ApiException(HttpStatus.BAD_REQUEST,"File phải có nội dung và không vượt quá 20 MB.");
        if(!readers.tryAcquire())throw new ApiException(HttpStatus.TOO_MANY_REQUESTS,"Bộ đọc đang bận. Hãy thử lại sau.");
        Path input=null,output=null;Process process=null;
        try {
            Path parser=Path.of(script).toAbsolutePath().normalize();
            String executable=python;
            if(executable==null||executable.isBlank()) {
                Path venv=parser.getParent().resolve(System.getProperty("os.name").startsWith("Windows")?".venv/Scripts/python.exe":".venv/bin/python");
                if(!Files.isRegularFile(venv))throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE,"Chưa cài bộ đọc đề cương. Xem scripts/course-outline/README.md.");
                executable=venv.toString();
            }
            if(!Files.isRegularFile(parser))throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE,"Không tìm thấy bộ đọc đề cương.");
            input=Files.createTempFile("examflow-outline-",suffix);output=Files.createTempFile("examflow-outline-result-",".json");
            file.transferTo(input);
            process=new ProcessBuilder(executable,parser.toString(),input.toString())
                .redirectOutput(output.toFile()).redirectError(ProcessBuilder.Redirect.DISCARD).start();
            if(!process.waitFor(40,TimeUnit.SECONDS))throw new ApiException(HttpStatus.UNPROCESSABLE_ENTITY,"Đọc tài liệu quá 40 giây. Hãy chọn file ngắn hơn.");
            if(Files.size(output)>4*1024*1024)throw new ApiException(HttpStatus.UNPROCESSABLE_ENTITY,"Cấu trúc tài liệu quá lớn.");
            var tree=json.readTree(Files.readString(output));
            if(process.exitValue()!=0||tree.has("error"))throw new ApiException(
                process.exitValue()==2?HttpStatus.SERVICE_UNAVAILABLE:HttpStatus.UNPROCESSABLE_ENTITY,
                tree.path("error").asText("Không đọc được cấu trúc đề cương."));
            return json.treeToValue(tree,CourseOutline.class);
        } catch(ApiException e){throw e;}
        catch(InterruptedException e){Thread.currentThread().interrupt();throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE,"Đọc đề cương bị gián đoạn.");}
        catch(Exception e){throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE,"Không chạy được bộ đọc đề cương. Kiểm tra cấu hình Python và dependencies.");}
        finally {
            if(process!=null&&process.isAlive()){process.destroyForcibly();try{process.waitFor(3,TimeUnit.SECONDS);}catch(InterruptedException e){Thread.currentThread().interrupt();}}
            for(Path path:new Path[]{input,output})if(path!=null)try{Files.deleteIfExists(path);}catch(Exception ignored){}
            readers.release();
        }
    }
}
