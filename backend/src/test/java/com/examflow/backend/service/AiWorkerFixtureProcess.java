package com.examflow.backend.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.test.util.ReflectionTestUtils;

/** Standalone fixture JVM. Cannot accept a Production URL. No Spring server or real model. */
public class AiWorkerFixtureProcess {
    public static void validateUrl(String url) {
        if(!url.equals("jdbc:postgresql://127.0.0.1:55439/examflow_worker_test"))
            throw new IllegalArgumentException("Only isolated loopback fixture DB is allowed");
    }
    public static void main(String[] args)throws Exception {
        validateUrl(args[0]);
        var source=new DriverManagerDataSource(args[0],"examflow_test_owner","");
        var properties=new java.util.Properties();properties.setProperty("ApplicationName","ExamFlow-Main/ai-worker-v1-fixture");source.setConnectionProperties(properties);
        var json=new ObjectMapper();var coordination=new AiWorkerCoordinator(source,json);
        ReflectionTestUtils.setField(coordination,"clusterReady",true);
        var credits=new AiCreditsService(source,json,coordination){@Override public void allocateCurrentMonth(){}};
        ReflectionTestUtils.setField(credits,"enabled",true);
        var provider=new AiCreditsProvider(json);
        ReflectionTestUtils.setField(provider,"url",args[1]);
        ReflectionTestUtils.setField(provider,"key","fixture-only-internal-key-at-least-32-characters");
        var worker=new AiCreditsWorker(credits,provider,null,coordination);
        ReflectionTestUtils.setField(worker,"timeoutMinutes",120L);
        try {
            for(int i=0;i<Integer.parseInt(args[2]);i++) {
                worker.tick();Thread.sleep(100);
                if(AiCreditsService.terminal(credits.raw(101)))break;
            }
        }finally{worker.close();}
    }
}
