// One-time, explicit migration of Argon2 password hashes, never plaintext.
// Usage: java ... MigrateKeycloakCredentials <private-export.json> [--apply]
// Export must contain only users from this project's realm. Keep it outside Git.
import java.nio.file.*;
import java.sql.*;
import java.util.*;
import tools.jackson.databind.*;
import tools.jackson.databind.json.JsonMapper;

class MigrateKeycloakCredentials {
 static final JsonMapper JSON=JsonMapper.builder().build();
 static final Properties config=new Properties();
 static String setting(String name,String env){String value=System.getenv(env);if(value==null)value=config.getProperty(name);if(value!=null&&value.startsWith("${")&&value.endsWith("}")){String[] parts=value.substring(2,value.length()-1).split(":",2);value=System.getenv(parts[0]);if(value==null&&parts.length>1)value=parts[1];}return value;}
 static Connection connect()throws SQLException{var auth=new Properties();auth.setProperty("user",setting("spring.datasource.username","SPRING_DATASOURCE_USERNAME"));auth.setProperty("password",setting("spring.datasource.password","SPRING_DATASOURCE_PASSWORD"));auth.setProperty("connectTimeout","10");auth.setProperty("socketTimeout","20");auth.setProperty("prepareThreshold","0");return DriverManager.getConnection(setting("spring.datasource.url","SPRING_DATASOURCE_URL"),auth);}
 public static void main(String[] args){
  try{
   if(args.length<1)throw new IllegalArgumentException("Supply a private credential export path");
   try(var reader=Files.newBufferedReader(Path.of("backend/src/main/resources/application.properties"))){config.load(reader);}
   String url=setting("spring.datasource.url","SPRING_DATASOURCE_URL");
   config.setProperty("spring.datasource.url",url.replace("pooler.supabase.com:5432/","pooler.supabase.com:6543/"));
   JsonNode exported=JSON.readTree(Files.readString(Path.of(args[0])));
   boolean apply=Arrays.asList(args).contains("--apply");
   try(var db=connect()){
    db.setAutoCommit(false);
    try{
     if(apply){try(var statement=db.createStatement()){statement.execute(Files.readString(Path.of("database/migrations/019_database_authentication.sql")));}}
     int matched=0,unmatched=0;
     for(var item:exported){
      var credential=item.path("credential");var secret=item.path("secret");var params=credential.path("additionalParameters");
      if(!"argon2".equals(credential.path("algorithm").asString())||!"id".equals(params.path("type").path(0).asString())||!"1.3".equals(params.path("version").path(0).asString()))throw new IllegalStateException("Unsupported credential format; no passwords changed");
      String salt=secret.path("salt").asString().replace("=","");String hash=secret.path("value").asString().replace("=","");
      Base64.getDecoder().decode(salt);Base64.getDecoder().decode(hash);
      String encoded="$argon2id$v=19$m="+params.path("memory").path(0).asString()+",t="+credential.path("hashIterations").asInt()+",p="+params.path("parallelism").path(0).asString()+"$"+salt+"$"+hash;
      try(var find=db.prepareStatement("SELECT id FROM users WHERE keycloak_user_id=? AND lower(username)=lower(?) AND lower(email)=lower(?) FOR UPDATE")){
       find.setString(1,item.path("subject").asString());find.setString(2,item.path("username").asString());find.setString(3,item.path("email").asString());
       try(var rows=find.executeQuery()){
        if(!rows.next()){unmatched++;continue;}
        long id=rows.getLong(1);if(rows.next())throw new IllegalStateException("Ambiguous account mapping");
        matched++;
        if(apply)try(var update=db.prepareStatement("UPDATE users SET password_hash=?,auth_failed_attempts=0,auth_locked_until=NULL WHERE id=?")){update.setString(1,encoded);update.setLong(2,id);update.executeUpdate();}
       }
      }
     }
     if(apply)db.commit();else db.rollback();
     System.out.println("credentialMigration="+(apply?"applied":"dry-run")+" matched="+matched+" unmatched="+unmatched);
     if(apply)try(var query=db.createStatement();var result=query.executeQuery("SELECT count(*) FILTER(WHERE password_hash IS NOT NULL AND password_hash<>''),count(*) FILTER(WHERE password_hash IS NULL OR password_hash='') FROM users")){result.next();System.out.println("accountsWithPassword="+result.getInt(1)+" accountsNeedingReset="+result.getInt(2));}
    }catch(Exception failure){db.rollback();throw failure;}
   }
  }catch(Exception failure){System.err.println("CREDENTIAL_MIGRATION_FAILED "+failure.getClass().getSimpleName());if(failure instanceof SQLException sql)System.err.println("SQLSTATE="+sql.getSQLState());System.exit(2);}
 }
}
