package com.examflow.backend.service;

import com.examflow.backend.repository.ExamRepository;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfSystemProperty;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.*;
import org.springframework.transaction.support.TransactionTemplate;
import java.util.*;
import java.util.concurrent.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

/** Opt-in: mvnw -Dtest=AutomaticExamPostgresTests -Dqut.automatic.postgres=true test.
 * Creates a disposable Docker PostgreSQL only; never reads application datasource configuration.
 */
@EnabledIfSystemProperty(named="qut.automatic.postgres",matches="true")
class AutomaticExamPostgresTests {
    static String container;
    static DriverManagerDataSource source;
    static JdbcTemplate jdbc;
    static String docker(String...args)throws Exception{return AdminCatalogPostgresTests.docker(args);}
    @BeforeAll static void start()throws Exception{
        container="qut-auto-"+UUID.randomUUID().toString().substring(0,8);
        try {
            docker("run","-d","--rm","--name",container,"-e","POSTGRES_PASSWORD=synthetic-auto-test","-p","127.0.0.1::5432","postgres:16-alpine");
            boolean ready=false;
            for(int i=0;i<40;i++){try{docker("exec",container,"pg_isready","-U","postgres");ready=true;break;}catch(Exception e){Thread.sleep(250);}}
            assertTrue(ready,"Disposable PostgreSQL did not become ready");
            String port=docker("port",container,"5432/tcp").trim().replace("127.0.0.1:","");
            source=new DriverManagerDataSource("jdbc:postgresql://127.0.0.1:"+port+"/postgres","postgres","synthetic-auto-test");
            jdbc=new JdbcTemplate(source);
            jdbc.execute("create table public.exams(id bigserial primary key,code text not null unique)");
        }catch(Exception|Error e){stop();throw e;}
    }
    @AfterAll static void stop()throws Exception{if(container!=null){try{docker("stop",container);}finally{container=null;}}}
    @Test void competingTransactionsAndApplicationInstancesProduceUniqueCodes()throws Exception{
        jdbc.update("insert into exams(code) values ('csdl_ck-001'),('CSDL_CK-003')");
        var executor=Executors.newFixedThreadPool(4);var gate=new CountDownLatch(1);
        try {
            List<Future<List<String>>> tasks=new ArrayList<>();
            for(int i=0;i<4;i++)tasks.add(executor.submit(()->{
                var repository=mock(ExamRepository.class);
                when(repository.existsByCodeIgnoreCase(anyString())).thenAnswer(c->jdbc.queryForObject("select exists(select 1 from exams where lower(code)=lower(?))",Boolean.class,c.<String>getArgument(0)));
                var service=new AutomaticExamService(null,null,null,repository,null);
                gate.await();
                return new TransactionTemplate(new DataSourceTransactionManager(source)).execute(tx->{
                    jdbc.execute("LOCK TABLE public.exams IN SHARE ROW EXCLUSIVE MODE");
                    var codes=service.availableCodes(AutomaticExamCodeTests.request(2),List.of("CSDL_CK-001","CSDL_CK-002"));
                    codes.forEach(code->jdbc.update("insert into exams(code) values (?)",code));return codes;
                });
            }));
            gate.countDown();Set<String> allocated=new HashSet<>();
            for(var task:tasks)for(String code:task.get(20,TimeUnit.SECONDS))assertTrue(allocated.add(code.toLowerCase(Locale.ROOT)));
            assertEquals(8,allocated.size());assertFalse(allocated.contains("csdl_ck-001"));assertFalse(allocated.contains("csdl_ck-003"));
            assertEquals(10,jdbc.queryForObject("select count(*) from exams",Integer.class));
            assertThrows(org.springframework.dao.DuplicateKeyException.class,()->jdbc.update("insert into exams(code) values ('CSDL_CK-003')"));
        }finally{executor.shutdownNow();}
    }
}
