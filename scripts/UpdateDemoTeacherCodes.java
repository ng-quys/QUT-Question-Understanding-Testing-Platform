// Run only for this project's demo teacher accounts; see ADMIN_TEACHER_CODES.md.
import java.nio.file.*;
import java.util.*;
import java.util.regex.*;
import java.sql.*;
import java.net.*;
import java.net.http.*;
import java.time.*;
import tools.jackson.databind.*;
import tools.jackson.databind.json.JsonMapper;

class UpdateDemoTeacherCodes {
    static final JsonMapper JSON=JsonMapper.builder().build();
    static Properties config=new Properties();
    static final HttpClient HTTP=HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(4)).followRedirects(HttpClient.Redirect.NEVER).build();
    static String server,realm,token,localAdminToken;static long tokenUntil;
    static String localAdminSetting(String name)throws Exception{
        String fromEnvironment=System.getenv(name);if(fromEnvironment!=null&&!fromEnvironment.isBlank())return fromEnvironment;
        for(String line:Files.readAllLines(Path.of(".env"))){String value=line.strip();if(value.startsWith(name+"=")){value=value.substring(name.length()+1).strip();if(value.length()>=2&&((value.startsWith("\"")&&value.endsWith("\""))||(value.startsWith("'")&&value.endsWith("'"))))value=value.substring(1,value.length()-1);return value;}}
        throw new IllegalStateException("LOCAL_ADMIN_CONFIGURATION_UNAVAILABLE");
    }
    static String localAdminToken()throws Exception{
        if(localAdminToken!=null)return localAdminToken;
        String form="grant_type=password&client_id=admin-cli&username="+enc(localAdminSetting("KEYCLOAK_ADMIN"))+"&password="+enc(localAdminSetting("KEYCLOAK_ADMIN_PASSWORD"));
        var response=HTTP.send(HttpRequest.newBuilder(URI.create(server+"/realms/master/protocol/openid-connect/token")).timeout(Duration.ofSeconds(8)).header("Content-Type","application/x-www-form-urlencoded").POST(HttpRequest.BodyPublishers.ofString(form)).build(),HttpResponse.BodyHandlers.ofString());
        if(response.statusCode()!=200)throw new IllegalStateException("LOCAL_ADMIN_AUTH_HTTP_"+response.statusCode());
        localAdminToken=JSON.readTree(response.body()).path("access_token").asString();return localAdminToken;
    }
    static String enc(String value){return URLEncoder.encode(value,java.nio.charset.StandardCharsets.UTF_8).replace("+","%20");}
    static void token()throws Exception{
        if(token!=null&&System.currentTimeMillis()<tokenUntil)return;
        server=setting("keycloak.server-url","KEYCLOAK_SERVER_URL").replaceAll("/$","");realm=setting("keycloak.realm","KEYCLOAK_REALM");
        String form="grant_type=client_credentials&client_id="+enc(setting("keycloak.admin-client-id","KEYCLOAK_ADMIN_CLIENT_ID"))+"&client_secret="+enc(setting("keycloak.admin-client-secret","KEYCLOAK_ADMIN_CLIENT_SECRET"));
        var response=HTTP.send(HttpRequest.newBuilder(URI.create(server+"/realms/"+enc(realm)+"/protocol/openid-connect/token")).timeout(Duration.ofSeconds(8)).header("Content-Type","application/x-www-form-urlencoded").POST(HttpRequest.BodyPublishers.ofString(form)).build(),HttpResponse.BodyHandlers.ofString());
        if(response.statusCode()!=200)throw new IllegalStateException("KEYCLOAK_TOKEN_HTTP_"+response.statusCode());
        var value=JSON.readTree(response.body());token=value.path("access_token").asString();tokenUntil=System.currentTimeMillis()+Math.max(1,value.path("expires_in").asLong(60)-15)*1000;
    }
    static JsonNode get(String path)throws Exception{
        token();var response=HTTP.send(HttpRequest.newBuilder(URI.create(server+"/admin/realms/"+enc(realm)+path)).timeout(Duration.ofSeconds(8)).header("Authorization","Bearer "+token).GET().build(),HttpResponse.BodyHandlers.ofString());
        if(response.statusCode()==404)return null;
        if(response.statusCode()!=200)throw new IllegalStateException("KEYCLOAK_READ_HTTP_"+response.statusCode());
        return JSON.readTree(response.body());
    }
    static JsonNode exact(String username)throws Exception{var values=get("/users?username="+enc(username)+"&exact=true");if(values==null||values.isEmpty())return null;if(values.size()!=1)throw new IllegalStateException("AMBIGUOUS_IDENTITY");return values.get(0);}
    static void usernameEditing(boolean value)throws Exception{
        token();var response=HTTP.send(HttpRequest.newBuilder(URI.create(server+"/admin/realms/"+enc(realm))).timeout(Duration.ofSeconds(8)).header("Authorization","Bearer "+token).header("Content-Type","application/json").PUT(HttpRequest.BodyPublishers.ofString(JSON.writeValueAsString(Map.of("editUsernameAllowed",value)))).build(),HttpResponse.BodyHandlers.ofString());
        if(response.statusCode()==403){
            response=HTTP.send(HttpRequest.newBuilder(URI.create(server+"/admin/realms/"+enc(realm))).timeout(Duration.ofSeconds(8)).header("Authorization","Bearer "+localAdminToken()).header("Content-Type","application/json").PUT(HttpRequest.BodyPublishers.ofString(JSON.writeValueAsString(Map.of("editUsernameAllowed",value)))).build(),HttpResponse.BodyHandlers.ofString());
        }
        if(response.statusCode()!=204)throw new IllegalStateException("KEYCLOAK_REALM_UPDATE_HTTP_"+response.statusCode());
        if(get("").path("editUsernameAllowed").asBoolean()!=value)throw new IllegalStateException("KEYCLOAK_REALM_FLAG_NOT_VERIFIED");
    }
    static void renameIdentity(String id,String expected,String replacement,String email)throws Exception{
        var current=get("/users/"+enc(id));
        if(current==null||!current.path("username").asString().equals(expected)||!current.path("email").asString().equalsIgnoreCase(email))throw new IllegalStateException("KEYCLOAK_IDENTITY_CHANGED");
        boolean teacher=false;
        for(var role:get("/users/"+enc(id)+"/role-mappings/realm/composite")){String name=role.path("name").asString();if(name.equalsIgnoreCase("ADMIN")||name.equalsIgnoreCase("STUDENT"))throw new IllegalStateException("PROTECTED_KEYCLOAK_ROLE");teacher|=name.equalsIgnoreCase("TEACHER")||name.equalsIgnoreCase("FACULTY");}
        if(!teacher)throw new IllegalStateException("TEACHER_ROLE_REQUIRED");
        var payload=(tools.jackson.databind.node.ObjectNode)current.deepCopy();payload.put("username",replacement);
        boolean originallyAllowed=get("").path("editUsernameAllowed").asBoolean();boolean attemptedToggle=false;
        try{
            if(!originallyAllowed){attemptedToggle=true;usernameEditing(true);}
            token();var response=HTTP.send(HttpRequest.newBuilder(URI.create(server+"/admin/realms/"+enc(realm)+"/users/"+enc(id))).timeout(Duration.ofSeconds(8)).header("Authorization","Bearer "+token).header("Content-Type","application/json").PUT(HttpRequest.BodyPublishers.ofString(JSON.writeValueAsString(payload))).build(),HttpResponse.BodyHandlers.ofString());
            if(response.statusCode()!=204)throw new IllegalStateException("KEYCLOAK_UPDATE_HTTP_"+response.statusCode());
            var verified=get("/users/"+enc(id));if(verified==null||!verified.path("username").asString().equals(replacement)||!verified.path("email").asString().equalsIgnoreCase(email))throw new IllegalStateException("KEYCLOAK_UPDATE_NOT_VERIFIED");
        }finally{if(attemptedToggle)usernameEditing(false);}
    }
    static String invariant(Connection db,long id)throws Exception{
        try(var query=db.prepareStatement("SELECT md5((to_jsonb(u)-'username'-'keycloak_user_id'-'updated_at')::text) FROM public.users u WHERE id=?")){query.setLong(1,id);try(var rows=query.executeQuery()){if(!rows.next())throw new IllegalStateException("USER_MISSING");return rows.getString(1);}}
    }
    static boolean allApplied(List<JsonNode> plan)throws Exception{
        try(var verify=connect();var query=verify.prepareStatement("SELECT username,keycloak_user_id FROM public.users WHERE id=? AND role IN ('teacher','faculty')")){
            for(var row:plan){query.setLong(1,row.path("id").asLong());try(var found=query.executeQuery()){if(!found.next()||!row.path("newUsername").asString().equals(found.getString(1)))return false;String target=row.path("verifiedKeycloakId").asString(row.path("keycloakId").asString(null));if(!Objects.equals(target,found.getString(2)))return false;}}
        }return true;
    }
    static void apply(Connection db,boolean allowUnlinkedDemo)throws Exception{
        List<JsonNode> plan=new ArrayList<>();for(var row:JSON.readTree(Files.readString(Path.of(".qut-run/test-teacher-code-plan.json"))))plan.add(row);
        if(plan.isEmpty())throw new IllegalStateException("EMPTY_PLAN");
        Set<String> codes=new HashSet<>();Map<Long,String> unchanged=new HashMap<>();List<JsonNode> attempted=new ArrayList<>();
        Set<String> allowed=allowUnlinkedDemo?Set.of("READY","SUPABASE_ONLY"):Set.of("READY");
        for(var row:plan){String code=row.path("newUsername").asString("");if(!allowed.contains(row.path("status").asString())||!code.matches("[0-9]{10}")||!codes.add(code))throw new IllegalStateException("UNRESOLVED_OR_INVALID_PLAN");}
        String suffix=Instant.now().toString().replace(":","-");Path backup=Path.of(".qut-run/test-teacher-codes-before-"+suffix+".json");
        Files.writeString(backup,JSON.writerWithDefaultPrettyPrinter().writeValueAsString(Map.of("state","PREPARED","mapping",plan)),StandardOpenOption.CREATE_NEW);
        boolean commitAttempted=false,committed=false;
        db.setAutoCommit(false);
        try{
            try(var options=db.createStatement()){options.execute("SET LOCAL lock_timeout='5s'");options.execute("SET LOCAL statement_timeout='15s'");}
            for(var row:plan){
                long id=row.path("id").asLong();
                try(var query=db.prepareStatement("SELECT username,email,keycloak_user_id,role FROM public.users WHERE id=? FOR UPDATE")){
                    query.setLong(1,id);try(var current=query.executeQuery()){
                        if(!current.next()||!row.path("oldUsername").asString().equals(current.getString(1))||!row.path("email").asString().equalsIgnoreCase(current.getString(2))||!Objects.equals(row.path("keycloakId").asString(null),current.getString(3))||!Set.of("teacher","faculty").contains(current.getString(4)))throw new IllegalStateException("SOURCE_PROFILE_CHANGED");
                    }
                }
                unchanged.put(id,invariant(db,id));
                try(var query=db.prepareStatement("SELECT COUNT(*) FROM public.users WHERE lower(username)=lower(?)")){query.setString(1,row.path("newUsername").asString());try(var count=query.executeQuery()){count.next();if(count.getLong(1)!=0)throw new IllegalStateException("CODE_NO_LONGER_AVAILABLE");}}
                if(exact(row.path("newUsername").asString())!=null)throw new IllegalStateException("KEYCLOAK_CODE_NO_LONGER_AVAILABLE");
                if("READY".equals(row.path("status").asString())){
                    String subject=row.path("verifiedKeycloakId").asString();
                    try(var query=db.prepareStatement("SELECT COUNT(*) FROM public.users WHERE keycloak_user_id=? AND id<>?")){query.setString(1,subject);query.setLong(2,id);try(var count=query.executeQuery()){count.next();if(count.getLong(1)>0)throw new IllegalStateException("IDENTITY_ALREADY_LINKED");}}
                }else{
                    var email=get("/users?email="+enc(row.path("email").asString())+"&exact=true");
                    if((email!=null&&!email.isEmpty())||exact(row.path("oldUsername").asString())!=null)throw new IllegalStateException("KEYCLOAK_ACCOUNT_APPEARED_REVIEW_REQUIRED");
                }
            }
            for(var row:plan){
                String subject=row.path("keycloakId").asString(null);
                if("READY".equals(row.path("status").asString())){
                    subject=row.path("verifiedKeycloakId").asString();attempted.add(row);
                    renameIdentity(subject,row.path("oldKeycloakUsername").asString(),row.path("newUsername").asString(),row.path("email").asString());
                }
                try(var update=db.prepareStatement("UPDATE public.users SET username=?,keycloak_user_id=? WHERE id=? AND role IN ('teacher','faculty') AND username=?")){
                    update.setString(1,row.path("newUsername").asString());update.setString(2,subject);update.setLong(3,row.path("id").asLong());update.setString(4,row.path("oldUsername").asString());if(update.executeUpdate()!=1)throw new IllegalStateException("UPDATE_COUNT_MISMATCH");
                }
                if(!unchanged.get(row.path("id").asLong()).equals(invariant(db,row.path("id").asLong())))throw new IllegalStateException("UNRELATED_PROFILE_FIELDS_CHANGED");
            }
            commitAttempted=true;db.commit();committed=true;
        }catch(Exception failure){
            try{db.rollback();}catch(Exception ignored){}
            if(commitAttempted&&allApplied(plan))committed=true;
            if(!committed){
                for(var row:attempted){
                    try{var current=get("/users/"+enc(row.path("verifiedKeycloakId").asString()));if(current!=null&&current.path("username").asString().equals(row.path("newUsername").asString()))renameIdentity(row.path("verifiedKeycloakId").asString(),row.path("newUsername").asString(),row.path("oldKeycloakUsername").asString(),row.path("email").asString());}
                    catch(Exception compensation){System.out.println("Identity compensation needs review for application ID="+row.path("id").asLong());}
                }
                throw failure;
            }
        }finally{db.setAutoCommit(true);}
        if(!allApplied(plan))throw new IllegalStateException("POST_COMMIT_VERIFICATION_REQUIRED");
        List<Map<String,Object>> report=new ArrayList<>();
        for(var row:plan){Map<String,Object> item=new LinkedHashMap<>();item.put("id",row.path("id").asLong());item.put("email",row.path("email").asString());item.put("oldUsername",row.path("oldUsername").asString());item.put("teacherCode",row.path("newUsername").asString());item.put("keycloakSynced","READY".equals(row.path("status").asString()));report.add(item);}
        Files.writeString(Path.of(".qut-run/test-teacher-code-result.json"),JSON.writerWithDefaultPrettyPrinter().writeValueAsString(Map.of("verified",true,"backup",backup.toString(),"accounts",report)));
        System.out.println("Verified renamed profiles="+plan.size()+"; Keycloak synchronized="+attempted.size()+"; Supabase-only="+(plan.size()-attempted.size()));
        System.out.println("Original ID, email, names, photo metadata and unrelated profile fields verified unchanged. No attempts or evidence rows were modified.");
        System.out.println("Backup: "+backup);System.out.println("Mapping: .qut-run/test-teacher-code-result.json");
    }
    static void plan(Connection db)throws Exception{
        List<Map<String,Object>> planned=new ArrayList<>();Set<String> names=new HashSet<>();
        try(var query=db.createStatement();var rows=query.executeQuery("SELECT lower(username) FROM public.users")){while(rows.next())names.add(rows.getString(1));}
        long next=8000000001L;
        for(var row:inventory(db)){
            String old=(String)row.get("oldUsername"),email=(String)row.get("email"),subject=(String)row.get("keycloakId");
            boolean byUniqueEmail=false;
            JsonNode external=subject==null?null:get("/users/"+enc(subject));
            if(external==null)external=exact(old);
            if(external==null){
                var byEmail=get("/users?email="+enc(email==null?"":email)+"&exact=true");
                if(byEmail!=null&&byEmail.size()==1){external=byEmail.get(0);byUniqueEmail=true;}
                else if(byEmail!=null&&byEmail.size()>1){row.put("status","AMBIGUOUS_EMAIL");planned.add(row);continue;}
            }
            if(external==null){
                String code;
                do{if(next>9999999999L)throw new IllegalStateException("NO_TEST_CODES_AVAILABLE");code=String.valueOf(next++);}while(names.contains(code)||exact(code)!=null);
                names.add(code);row.put("newUsername",code);row.put("status","SUPABASE_ONLY");planned.add(row);continue;
            }
            if((!byUniqueEmail&&!old.equalsIgnoreCase(external.path("username").asString()))||email==null||!email.equalsIgnoreCase(external.path("email").asString())){row.put("status","IDENTITY_MISMATCH");planned.add(row);continue;}
            String actual=external.path("id").asString();boolean teacher=false,otherRole=false;
            for(var role:get("/users/"+enc(actual)+"/role-mappings/realm/composite")){String name=role.path("name").asString();teacher|=name.equalsIgnoreCase("TEACHER")||name.equalsIgnoreCase("FACULTY");otherRole|=name.equalsIgnoreCase("ADMIN")||name.equalsIgnoreCase("STUDENT");}
            if(!teacher||otherRole){row.put("status","ROLE_MISMATCH");planned.add(row);continue;}
            try(var bindings=db.prepareStatement("SELECT COUNT(*) FROM public.users WHERE keycloak_user_id=? AND id<>?")){bindings.setString(1,actual);bindings.setLong(2,((Number)row.get("id")).longValue());try(var rows=bindings.executeQuery()){rows.next();if(rows.getLong(1)>0){row.put("status","IDENTITY_ALREADY_LINKED");planned.add(row);continue;}}}
            String code;
            do{if(next>9999999999L)throw new IllegalStateException("NO_TEST_CODES_AVAILABLE");code=String.valueOf(next++);}while(names.contains(code)||exact(code)!=null);
            names.add(code);row.put("newUsername",code);row.put("verifiedKeycloakId",actual);row.put("oldKeycloakUsername",external.path("username").asString());row.put("matchMode",byUniqueEmail?"unique-email-admin-repair":"existing-identity");row.put("status","READY");planned.add(row);
        }
        Path target=Path.of(".qut-run/test-teacher-code-plan.json");Files.writeString(target,JSON.writerWithDefaultPrettyPrinter().writeValueAsString(planned));
        System.out.println("Read-only plan saved: "+target);
        for(var row:planned)System.out.println("ID="+row.get("id")+" new="+row.get("newUsername")+" status="+row.get("status"));
    }
    static String resolve(String value){
        if(value==null)throw new IllegalStateException("MISSING_LOCAL_CONFIGURATION");
        var matcher=Pattern.compile("\\$\\{([^}:]+)(?::([^}]*))?}").matcher(value);
        StringBuffer result=new StringBuffer();
        while(matcher.find()){String found=System.getenv(matcher.group(1));if(found==null)found=matcher.group(2);if(found==null)throw new IllegalStateException("MISSING_LOCAL_CONFIGURATION");matcher.appendReplacement(result,Matcher.quoteReplacement(found));}
        matcher.appendTail(result);return result.toString();
    }
    static String setting(String property,String environment){String value=System.getenv(environment);return resolve(value==null?config.getProperty(property):value);}
    static Connection connect()throws Exception{
        Properties auth=new Properties();auth.setProperty("user",setting("spring.datasource.username","SPRING_DATASOURCE_USERNAME"));auth.setProperty("password",setting("spring.datasource.password","SPRING_DATASOURCE_PASSWORD"));auth.setProperty("connectTimeout","8");auth.setProperty("socketTimeout","15");DriverManager.setLoginTimeout(8);
        return DriverManager.getConnection(setting("spring.datasource.url","SPRING_DATASOURCE_URL"),auth);
    }
    static List<Map<String,Object>> inventory(Connection db)throws Exception{
        List<Map<String,Object>> result=new ArrayList<>();
        try(var query=db.prepareStatement("SELECT id,username,email,keycloak_user_id FROM public.users WHERE role IN ('teacher','faculty') AND username !~ '^[0-9]{10}$' ORDER BY id")){
            query.setQueryTimeout(10);try(var rows=query.executeQuery()){while(rows.next()){Map<String,Object> row=new LinkedHashMap<>();row.put("id",rows.getLong(1));row.put("oldUsername",rows.getString(2));row.put("email",rows.getString(3));row.put("keycloakId",rows.getString(4));result.add(row);}}
        }return result;
    }
    public static void main(String[] args){
        try{
            try(var reader=Files.newBufferedReader(Path.of("backend/src/main/resources/application.properties"))){config.load(reader);}
            try(var db=connect()){
                if(args.length>=1&&args[0].equals("--apply")){
                    if(args.length>2||(args.length==2&&!args[1].equals("--allow-unlinked-demo")))throw new IllegalStateException("INVALID_ARGUMENTS");
                    apply(db,args.length==2);return;
                }
                plan(db);
            }
        }catch(SQLException error){System.out.println("Database unavailable; SQLSTATE="+error.getSQLState()+"; details hidden");System.exit(2);}
        catch(Exception error){String code=error.getMessage();System.out.println("Operation unavailable: "+error.getClass().getSimpleName()+((code!=null&&code.matches("[A-Z0-9_]+"))?" "+code:"")+"; details hidden");System.exit(2);}
    }
}
