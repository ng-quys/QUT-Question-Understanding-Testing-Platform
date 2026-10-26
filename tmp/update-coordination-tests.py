from pathlib import Path
root=Path(__file__).resolve().parents[1]
for name in ['AiCreditsSettlementTest.java','AiCreditRulesTest.java']:
 p=root/'backend/src/test/java/com/examflow/backend'/name
 s=p.read_text(encoding='utf-8')
 s=s.replace('new AiCreditsService(source,mapper)','new AiCreditsService(source,mapper,mock(com.examflow.backend.service.AiWorkerCoordinator.class))')
 s=s.replace('new AiCreditsService(datasource,new ObjectMapper())','new AiCreditsService(datasource,new ObjectMapper(),mock(com.examflow.backend.service.AiWorkerCoordinator.class))')
 s=s.replace('new AiCreditsService(mock(DataSource.class),mapper)','new AiCreditsService(mock(DataSource.class),mapper,mock(com.examflow.backend.service.AiWorkerCoordinator.class))')
 s=s.replace('new AiCreditsService(mock(DataSource.class),new ObjectMapper())','new AiCreditsService(mock(DataSource.class),new ObjectMapper(),mock(com.examflow.backend.service.AiWorkerCoordinator.class))')
 p.write_text(s,encoding='utf-8')
p=root/'backend/src/test/java/com/examflow/backend/AiJobTransportTest.java';s=p.read_text(encoding='utf-8')
s=s.replace('new AiCreditsWorker(credits,provider,mock(AiGenerationService.class))','worker(credits,provider,job)')
s=s.replace('var worker=worker(credits,provider,job);\n        ReflectionTestUtils.setField(worker,"workerEnabled",false);','var worker=worker(credits,provider,null);\n        ReflectionTestUtils.setField(worker,"workerEnabled",false);')
s=s.replace('new AiCreditsWorker(credits,ownerProvider,mock(AiGenerationService.class))','worker(credits,ownerProvider,shared)')
s=s.replace('new AiCreditsWorker(credits,otherProvider,mock(AiGenerationService.class))','worker(credits,otherProvider,shared)')
# Existing transport tests isolate coordination with a fixture; real PostgreSQL tests cover its boundary.
helper='''
    AiCreditsWorker worker(AiCreditsService credits,AiCreditsProvider provider,Map<String,Object> row) {
        var coordination=mock(AiWorkerCoordinator.class);
        try {
            when(provider.registryId()).thenReturn("00000000-0000-0000-0000-000000000001");
            doAnswer(i->{provider.start(i.getArgument(0),i.getArgument(1));return null;}).when(provider).start(any(),any(),anyString());
            when(provider.status(any(),anyString())).thenAnswer(i->provider.status(i.getArgument(0)));
            doAnswer(i->{provider.cancel(i.getArgument(0));return null;}).when(provider).cancel(any(),anyString());
        } catch(Exception e){throw new RuntimeException(e);}
        when(coordination.run(anyLong(),any(),anyString(),any())).thenAnswer(i->{
            java.util.function.Consumer<Map<String,Object>> action=i.getArgument(3);action.accept(row);return true;
        });
        doAnswer(i->{credits.checkpoint(i.getArgument(0),i.getArgument(1),i.getArgument(2));return null;}).when(credits).checkpointOwned(anyLong(),any(),anyList());
        doAnswer(i->{credits.unknown(i.getArgument(0),i.getArgument(1),i.getArgument(2));return null;}).when(credits).unknownOwned(anyLong(),any(),anyString());
        doAnswer(i->{credits.finish(i.getArgument(0),i.getArgument(1),i.getArgument(2),i.getArgument(3),i.getArgument(4),i.getArgument(5));return null;}).when(credits).finishOwned(anyLong(),any(),anyList(),anyBoolean(),any(),any());
        return new AiCreditsWorker(credits,provider,mock(AiGenerationService.class),coordination);
    }
'''
s=s.replace('    AiGenerateRequest request(){',helper+'    AiGenerateRequest request(){')
p.write_text(s,encoding='utf-8')
p=root/'ai-service/test_credits_runtime.py';s=p.read_text(encoding='utf-8')
s=s.replace("'require_internal', 'start_credit_job'","'require_internal', 'require_registry', 'start_credit_job'")
s=s.replace("('require_internal', 'credit_job_status', 'cancel_credit_job')","('require_internal', 'require_registry', 'credit_job_status', 'cancel_credit_job')")
p.write_text(s,encoding='utf-8')
