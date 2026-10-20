package com.examflow.backend.service;

import com.examflow.backend.dto.*;
import com.examflow.backend.entity.UserEntity;
import com.examflow.backend.exception.ApiException;
import com.examflow.backend.repository.UserRepository;
import jakarta.transaction.Transactional;
import jakarta.validation.constraints.*;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import java.util.Locale;
import java.util.Set;

@Service
public class AdminAccountService {
    @org.springframework.beans.factory.annotation.Autowired private AdminCodeGenerator codes;
    @org.springframework.beans.factory.annotation.Autowired private AccountCodeReservation codeReservations;
    @jakarta.persistence.PersistenceContext private jakarta.persistence.EntityManager em;
    private final UserRepository users;
    private final KeycloakAdminService keycloak;
    private final AdminService admin;
    public AdminAccountService(UserRepository users, KeycloakAdminService keycloak, AdminService admin) {
        this.users = users; this.keycloak = keycloak; this.admin = admin;
    }
    public record Create(@Size(max=80) String username,
            @NotBlank @Email @Size(max=254) String email, @NotBlank @Size(min=8,max=128) String password,
            @NotBlank @Size(max=150) String fullName, @Size(max=150) String department, @NotNull RegistrationRole role,@Positive Long studentClassId) {
        public Create(String username,String email,String password,String fullName,String department,RegistrationRole role){this(username,email,password,fullName,department,role,null);}
    }
    public record Edit(@NotBlank @Size(max=150) String fullName, @Size(max=150) String department,
            @NotNull RegistrationRole role, @NotBlank String status,@Positive Long studentClassId) {
        public Edit(String fullName,String department,RegistrationRole role,String status){this(fullName,department,role,status,null);}
    }

    @Transactional
    public AdminDto.UserRow create(Long actor, Create request) {
        return create(actor, request, null);
    }

    @Transactional
    public java.util.Map<String,String> reserveCode(Long actor, RegistrationRole role) {
        for (int attempt=0; attempt<100; attempt++) {
            String code=codes.next(role==RegistrationRole.STUDENT?AdminCodeGenerator.Kind.STUDENT:AdminCodeGenerator.Kind.TEACHER);
            if (!keycloak.usernameExists(code)) return java.util.Map.of("username",code,"token",codeReservations.issue(actor,role,code));
        }
        throw new ApiException(HttpStatus.CONFLICT,"Chưa cấp được mã tài khoản. Vui lòng thử lại.");
    }

    @Transactional
    public AdminDto.UserRow create(Long actor, Create request, String reservationToken) {
        String email = request.email().trim().toLowerCase(Locale.ROOT);
        String department=academicDepartment(request.role(),request.studentClassId(),request.department(),null);
        // A supplied legacy username is ignored: all admin-created identities use this policy.
        String username=reservationToken==null?null:codeReservations.verify(actor,request.role(),reservationToken);
        if(username!=null && keycloak.usernameExists(username))
            throw new ApiException(HttpStatus.CONFLICT,"Mã đăng nhập đã được sử dụng. Vui lòng cấp lại mã.");
        for(int attempt=0;username==null && attempt<100;attempt++) {
            String candidate=codes.next(request.role()==RegistrationRole.STUDENT?AdminCodeGenerator.Kind.STUDENT:AdminCodeGenerator.Kind.TEACHER);
            if (users.findByEmailIgnoreCaseOrUsernameIgnoreCase(email,candidate).isPresent())
                throw new ApiException(HttpStatus.CONFLICT,"Tên đăng nhập hoặc email đã được sử dụng");
            if(!keycloak.usernameExists(candidate)){username=candidate;break;}
        }
        if(username==null)throw new ApiException(HttpStatus.CONFLICT,"Chưa cấp được mã tài khoản. Vui lòng thử lại.");
        if (users.findByEmailIgnoreCaseOrUsernameIgnoreCase(email, username).isPresent())
            throw new ApiException(HttpStatus.CONFLICT, "Tên đăng nhập hoặc email đã được sử dụng");
        String external = keycloak.createUser(new RegisterRequest(username,email,request.password(),request.fullName().trim(),null,null,request.role()));
        onRollback(() -> keycloak.deleteCreatedAccount(external));
        UserEntity user = new UserEntity();
        user.setUsername(username); user.setEmail(email); user.setFullName(request.fullName().trim());
        user.setDepartment(department);user.setStudentClassId(request.studentClassId()); user.setRole(request.role().name().toLowerCase(Locale.ROOT));
        user.setStatus("active"); user.setKeycloakUserId(external);
        users.saveAndFlush(user);
        admin.audit(actor,"CREATE_USER","USER",user.getId(),"role=" + user.getRole());
        return row(user);
    }

    @Transactional
    public AdminDto.UserRow edit(Long actor, Long id, Edit request) {
        UserEntity user = managed(actor,id);
        if (request.role() == RegistrationRole.STUDENT && !"student".equals(user.getRole()) &&
                (user.getUsername() == null || !user.getUsername().matches("[0-9]{10}")))
            throw new ApiException(HttpStatus.BAD_REQUEST,"Mã sinh viên phải gồm đúng 10 chữ số trước khi chuyển vai trò sang sinh viên");
        String status = status(request.status());
        String role = request.role().name().toLowerCase(Locale.ROOT);
        Long classId=request.role()==RegistrationRole.STUDENT?(request.studentClassId()==null?user.getStudentClassId():request.studentClassId()):null;
        if(request.role()!=RegistrationRole.STUDENT&&request.studentClassId()!=null)throw new ApiException(HttpStatus.BAD_REQUEST,"Chỉ sinh viên được gán lớp hành chính");
        String department=academicDepartment(request.role(),classId,request.department(),user.getStudentClassId());
        String previousName = user.getFullName(), previousRole = user.getRole(), previousStatus = user.getStatus();
        String external = user.getKeycloakUserId();
        if (external != null && !external.isBlank()) {
            keycloak.requireManagedAccount(external);
            onRollback(() -> {
                keycloak.setApplicationRealmRole(external, realmRole(previousRole));
                keycloak.updateManagedAccount(external,previousName,"active".equals(previousStatus));
            });
            keycloak.updateManagedAccount(external,request.fullName(),"active".equals(status));
            if (!realmRole(previousRole).equals(request.role().name())) {
                keycloak.setApplicationRealmRole(external,request.role().name());
                keycloak.logoutManagedAccount(external);
            }
        } else if (!realmRole(previousRole).equals(request.role().name())) {
            throw new ApiException(HttpStatus.BAD_REQUEST,"Tài khoản chưa liên kết Keycloak. Cần đăng nhập một lần trước khi đổi vai trò.");
        }
        user.setFullName(request.fullName().trim()); user.setDepartment(department);user.setStudentClassId(classId);
        user.setRole(role); user.setStatus(status); users.saveAndFlush(user);
        admin.audit(actor,"UPDATE_USER","USER",id,"role=" + previousRole + " -> " + role + "; status=" + previousStatus + " -> " + status);
        return row(user);
    }

    @Transactional
    public AdminDto.UserRow status(Long actor, Long id, String status) {
        UserEntity user = managed(actor,id);
        return edit(actor,id,new Edit(user.getFullName(),user.getDepartment(),RegistrationRole.valueOf(realmRole(user.getRole())),status));
    }
    @Transactional
    public AdminDto.UserRow repairIdentity(Long actor,Long id) {
        UserEntity user=managed(actor,id);
        String subject=keycloak.findProvisionedAccount(user.getUsername(),user.getEmail(),realmRole(user.getRole()));
        var occupied=users.findByKeycloakUserId(subject);
        if(occupied.isPresent()&&!occupied.get().getId().equals(id))throw new ApiException(HttpStatus.CONFLICT,"Tài khoản Keycloak đã liên kết với hồ sơ khác. Không thể tự gộp dữ liệu.");
        user.setKeycloakUserId(subject);users.saveAndFlush(user);
        admin.audit(actor,"REPAIR_USER_IDENTITY","USER",id,"Đối chiếu tên đăng nhập, email và vai trò với Keycloak; giữ ID hồ sơ");
        return row(user);
    }

    @Transactional
    public void resetPassword(Long actor, Long id, String newPassword) {
        if (newPassword == null || newPassword.length() < 8 || newPassword.length() > 128) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Mật khẩu mới phải từ 8 đến 128 ký tự");
        }
        UserEntity user = managed(actor, id);
        String external = user.getKeycloakUserId();
        if (external == null || external.isBlank()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Tài khoản chưa liên kết Keycloak. Người dùng cần đăng nhập ít nhất một lần.");
        }
        keycloak.resetPassword(external, newPassword);
        admin.audit(actor, "RESET_PASSWORD", "USER", id, "username=" + user.getUsername());
    }
    private UserEntity managed(Long actor, Long id) {
        UserEntity user = users.findById(id).orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND,"Không tìm thấy tài khoản"));
        if (actor.equals(id) || "admin".equalsIgnoreCase(user.getRole()))
            throw new ApiException(HttpStatus.BAD_REQUEST,"Tài khoản quản trị cần được quản lý trực tiếp trong Keycloak");
        if (!Set.of("student","teacher","faculty").contains(user.getRole()))
            throw new ApiException(HttpStatus.BAD_REQUEST,"Vai trò tài khoản không được hỗ trợ");
        return user;
    }
    private static String status(String value) {
        String status = clean(value).toLowerCase(Locale.ROOT);
        if (!Set.of("active","inactive","locked").contains(status)) throw new ApiException(HttpStatus.BAD_REQUEST,"Trạng thái không hợp lệ");
        return status;
    }
    private static String realmRole(String role) { return "faculty".equals(role) ? "TEACHER" : role.toUpperCase(Locale.ROOT); }
    private static String clean(String value) { return value == null ? "" : value.trim(); }
    public java.util.Map<String,Object> academicOptions(){
        java.util.List<java.util.Map<String,Object>> classes=new java.util.ArrayList<>();
        for(Object raw:em.createNativeQuery("SELECT id,code,name,department,status FROM student_classes ORDER BY department,code").getResultList()){
            Object[] row=(Object[])raw;java.util.Map<String,Object> item=new java.util.LinkedHashMap<>();item.put("id",row[0]);item.put("code",row[1]);item.put("name",row[2]);item.put("department",row[3]);item.put("status",row[4]);classes.add(item);
        }return java.util.Map.of("classes",classes);
    }
    private String academicDepartment(RegistrationRole role,Long classId,String requested,Long previousClass){
        if(classId==null)return clean(requested);
        if(role!=RegistrationRole.STUDENT)throw new ApiException(HttpStatus.BAD_REQUEST,"Chỉ sinh viên được gán lớp hành chính");
        java.util.List<?> found=em.createNativeQuery("SELECT department,status FROM student_classes WHERE id=:id FOR SHARE").setParameter("id",classId).getResultList();
        if(found.isEmpty())throw new ApiException(HttpStatus.BAD_REQUEST,"Lớp được chọn không tồn tại");Object[] row=(Object[])found.get(0);
        if(!"active".equals(row[1])&&!classId.equals(previousClass))throw new ApiException(HttpStatus.BAD_REQUEST,"Không gán sinh viên vào lớp đã ngưng hoạt động");
        String department=clean((String)row[0]);if(department.isEmpty())throw new ApiException(HttpStatus.BAD_REQUEST,"Lớp chưa có khoa, cần bổ sung khoa cho lớp trước");
        if(!clean(requested).isEmpty()&&!department.equalsIgnoreCase(clean(requested)))throw new ApiException(HttpStatus.BAD_REQUEST,"Lớp không thuộc khoa đã chọn");return department;
    }
    private AdminDto.UserRow row(UserEntity user) {
        String code=null,name=null;
        if(user.getStudentClassId()!=null){java.util.List<?> classes=em.createNativeQuery("SELECT code,name FROM student_classes WHERE id=:id").setParameter("id",user.getStudentClassId()).getResultList();if(!classes.isEmpty()){Object[] values=(Object[])classes.get(0);code=(String)values[0];name=(String)values[1];}}
        return new AdminDto.UserRow(user.getId(),user.getUsername(),user.getEmail(),user.getFullName(),user.getRole(),user.getDepartment(),user.getStatus(),null,user.getStudentClassId(),code,name);
    }
    private static void onRollback(Runnable action) {
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override public void afterCompletion(int status) {
                if (status != STATUS_COMMITTED) {
                    try { action.run(); }
                    catch (RuntimeException error) { System.err.println("Keycloak compensation failed; inspect administrator service logs: " + error.getClass().getSimpleName()); }
                }
            }
        });
    }
}
