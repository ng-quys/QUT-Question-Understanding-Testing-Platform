import java.net.URI;
import java.net.http.*;
import java.time.Duration;
import java.nio.file.*;
import org.springframework.boot.*;
import org.springframework.context.annotation.Configuration;
import tools.jackson.databind.json.JsonMapper;

/** No component scan, auto-configuration, web server, datasource or upload. */
@Configuration(proxyBeanMethods=false)
public class SavedDocumentsStorageAudit {
  public static void main(String[] args) {
    try {
      var app=new SpringApplication(SavedDocumentsStorageAudit.class);
      app.setWebApplicationType(WebApplicationType.NONE);
      app.setLogStartupInfo(false);
      var options=new java.util.ArrayList<String>();
      options.add("--spring.main.banner-mode=off");options.add("--logging.level.root=OFF");
      options.addAll(java.util.Arrays.asList(args));
      try(var ctx=app.run(options.toArray(String[]::new))) {
        var env=ctx.getEnvironment();
        var file=new java.util.Properties();
        try(var in=Files.newInputStream(Path.of("../.env.storage"))){file.load(in);}
        String base=env.getProperty("SUPABASE_URL","");
        String key=env.getProperty("SUPABASE_SECRET_KEY",env.getProperty("SUPABASE_SERVICE_ROLE_KEY",""));
        String bucket=env.getProperty("SUPABASE_AI_DOCUMENTS_BUCKET","ai-source-documents");
        System.out.println("effective_storage_matches_canonical_file="+
          (base.equals(file.getProperty("SUPABASE_URL")) && key.equals(file.getProperty("SUPABASE_SECRET_KEY",file.getProperty("SUPABASE_SERVICE_ROLE_KEY","")))));
        System.out.println("backend_saved_documents_enabled="+env.getProperty("ai.saved-documents.enabled","false"));
        if(Boolean.parseBoolean(env.getProperty("audit.jobs","false"))){
          try(var connection=java.sql.DriverManager.getConnection(env.getProperty("spring.datasource.url"),
                env.getProperty("spring.datasource.username"),env.getProperty("spring.datasource.password"))){
            connection.setReadOnly(true);connection.setAutoCommit(false);
            try(var statement=connection.createStatement()){
              statement.setQueryTimeout(10);
              try(var result=statement.executeQuery("SELECT credit_state,count(*) FROM public.ai_generation_requests WHERE credit_state IN ('reserved','running','cancel_requested','unknown') GROUP BY credit_state ORDER BY credit_state")){
                long count=0;
                while(result.next()){long n=result.getLong(2);count+=n;System.out.println("main_job_count_"+result.getString(1)+"="+n);}
                System.out.println("main_active_or_unknown_total="+count);
              }
              try(var result=statement.executeQuery("SELECT count(*) FROM public.users u WHERE u.role IN ('teacher','faculty') AND u.status='active' AND NOT EXISTS(SELECT 1 FROM public.ai_credit_months m WHERE m.user_id=u.id AND m.month_start=date_trunc('month',current_timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh')::date)")){
                result.next();System.out.println("pending_monthly_allocations="+result.getLong(1));
              }
            } finally {connection.rollback();}
          }catch(Exception failure){System.out.println("main_job_audit_failed="+failure.getClass().getSimpleName());}
        }
        if(!bucket.equals("ai-source-documents"))throw new IllegalStateException();
        var request=HttpRequest.newBuilder(URI.create(base.replaceAll("/+$","")+"/storage/v1/bucket/"+bucket))
          .timeout(Duration.ofSeconds(15)).header("apikey",key);
        if(key.split("\\.").length==3)request.header("Authorization","Bearer "+key);
        var client=HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build();
        var response=client.send(request.GET().build(),HttpResponse.BodyHandlers.ofString());
        System.out.println("bucket_metadata_http="+response.statusCode());
        if(response.statusCode()==200){
          var data=JsonMapper.builder().build().readTree(response.body());
          System.out.println("bucket_private="+!data.path("public").asBoolean(true));
          System.out.println("bucket_20MiB="+(data.path("file_size_limit").asLong()==20971520));
        }
      }
    } catch(Exception e){
      System.out.println("storage_audit_failed="+e.getClass().getSimpleName());
      for(Throwable cause=e;cause!=null;cause=cause.getCause()){
        var message=String.valueOf(cause.getMessage());
        System.out.println("placeholder_circular="+message.toLowerCase().contains("circular"));
        System.out.println("placeholder_mentions_ai_bucket="+message.contains("SUPABASE_AI_DOCUMENTS_BUCKET"));
        var matcher=java.util.regex.Pattern.compile("Could not resolve placeholder '([A-Za-z_][A-Za-z0-9_.-]*)'").matcher(String.valueOf(cause.getMessage()));
        if(matcher.find())System.out.println("unresolved_property_name="+matcher.group(1));
      }
      System.exit(1);
    }
  }
}
