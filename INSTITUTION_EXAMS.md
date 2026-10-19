# Thi theo phân công — QUT / ExamFlow

Cập nhật hiện tại: **một ca thi theo khoa, nhiều nhóm cùng giờ**, admin bổ sung phòng/giảng viên/đề sau. Xem [DEPARTMENT_EXAMS.md](DEPARTMENT_EXAMS.md); cần migration 012 rồi 013 sau 009–011. Không cần gán sinh viên vào học phần. Phần quy trình thành viên phòng bên dưới dành cho luồng cũ được giữ tương thích.

Luồng giám sát web đã chuyển sang mở đề ngay và AI chạy nền theo nhóm. Xem [AI_BATCH_MONITORING.md](AI_BATCH_MONITORING.md) để cấu hình và kiểm tra camera/micro, thứ tự nhóm và trạng thái giám sát mới.

## Luồng đã triển khai

Phạm vi hiện tại: thay đổi admin và sinh viên. Giảng viên giữ màn hình tạo đề/ca thi cũ, cùng lịch sử bằng chứng đã có từ trước; không có mục giám sát phòng mới.

Mã sinh viên dùng làm username phải gồm đúng **10 chữ số ASCII 0–9**, kiểm tra ở form admin, nhập CSV và backend. Lưu dạng chuỗi để giữ số 0 đầu (ví dụ `0012345678`); không cần đổi kiểu cột hoặc migration mới. Tài khoản cũ dùng email/chữ/mã sai độ dài không tự bị đổi hoặc xóa, nhưng hiện “Chưa có mã sinh viên hợp lệ” kèm tên đăng nhập cũ để đối chiếu. Tên đăng nhập giảng viên giữ quy định trước đó. Khi soạn CSV bằng Excel, đặt cột username dạng Văn bản để giữ số 0 ở đầu.

1. Admin cấp tài khoản sinh viên/giảng viên trong **Tài khoản**. Mã sinh viên chính là `users.username`, đồng thời là username bên Keycloak. Không tạo thêm cột mã sinh viên hoặc kho mật khẩu riêng.
2. Admin vào **Phòng thi & phân công**: quản lý lớp hành chính, bổ sung lớp/khoa cho sinh viên, tạo phòng, chọn sinh viên và phân công giảng viên.
3. Giảng viên tạo đề/ca ở **Ca thi trực tuyến** như trước. Admin vào **Ca thi** để chỉnh ca chưa công bố, chọn phòng và kiểm tra lịch; hoặc tạo ca mới từ đề đã lưu.
4. Admin xem danh sách phòng, kiểm tra đề/lịch rồi **Công bố**. Backend khóa dữ liệu liên quan và chốt danh sách vào `exam_session_students`. Công bố lại không tạo đăng ký trùng.
5. Sinh viên vào **Kỳ thi của tôi**. Chỉ ca đã công bố, đã đến giờ và có tên trong danh sách mới xuất hiện để bắt đầu. Danh sách cập nhật mỗi 8 giây khi trang đang hiển thị, độc lập với đồng hồ máy khách. Không nhập mã, quét QR hoặc tự đăng ký.
6. Admin vào **Giám sát ca thi** để xem các ca đang diễn ra, phòng/đề/môn/giảng viên, tổng được phân, chưa vào, đang làm, đã nộp, hết hạn và số lượt có cảnh báo. Có tìm kiếm và phân trang; tự cập nhật mỗi 8 giây, không gửi chồng request. Mở chi tiết xem từng sinh viên, lớp/khoa và bằng chứng; chi tiết có nút làm mới riêng.

Thay đổi danh sách phòng KHÔNG thay đổi danh sách ca đã công bố. Không có API chỉnh trực tiếp danh sách ca đã công bố trong lần này. Nếu cần điều chỉnh, tổ chức ca mới hoặc bổ sung quy trình duyệt riêng; không sửa SQL thủ công để loại sinh viên đang làm bài.

## Cần làm trước khi chạy trên database đang dùng

### 1. Migration Supabase

Dừng backend cũ trước khi chuyển sang bản mới. Giữ dữ liệu hiện có; không reset database.

- `database/migrations/009_exam_rooms.sql`: ghi lại đúng ba bảng và hai cột đã trao đổi. Nếu đã chạy SQL tạo các bảng/cột này trước đó thì có thể chạy lại file để đối chiếu; không chèn/xóa dữ liệu cũ. Các bảng mới bật RLS, không mở policy cho frontend truy cập trực tiếp.
- `database/migrations/010_assigned_examinations.sql`: **cần chạy thêm**. Bổ sung `exam_room_teachers`, `exam_sessions.published_at`, `published_by`, index phân công và ràng buộc chống trùng.

Mở file, sao chép nội dung vào Supabase SQL Editor và Run theo thứ tự 009 → 010 → 011. Không chạy lại tất cả migration lịch sử tùy tiện. Backend yêu cầu các cột mới; nếu chưa chạy 010/011, Hibernate có thể báo thiếu `published_at` hoặc `exams.created_by` khi khởi động.

Migration 010 giữ `published_at = NULL` cho TẤT CẢ ca cũ. Không tự xem ca cũ là đã công bố, không tự gán sinh viên vào ca. Ca cũ đã có danh sách/bài làm không được chuyển đổi bằng nút công bố; nên tạo ca mới sau khi đối chiếu.

Kiểm tra cấu trúc sau khi chạy:

```sql
SELECT table_name, column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND (table_name IN ('student_classes','exam_rooms','exam_room_students','exam_room_teachers')
       OR (table_name='users' AND column_name='student_class_id')
       OR (table_name='exam_sessions' AND column_name IN ('room_id','published_at','published_by')))
ORDER BY table_name, ordinal_position;

SELECT t.relname AS table_name, c.conname, pg_get_constraintdef(c.oid)
FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid
JOIN pg_namespace n ON n.oid=t.relnamespace
WHERE n.nspname='public'
  AND t.relname IN ('student_classes','exam_rooms','exam_room_students','exam_room_teachers','exam_sessions','users')
ORDER BY t.relname,c.conname;
```

Backend dùng tài khoản PostgreSQL phía server như trước. Các bảng có RLS không được đọc/ghi bằng anon key từ frontend. Nếu đổi tài khoản database sang role bị giới hạn, cần quản trị database cấu hình quyền phù hợp; không biến bucket hoặc bảng thành public để chữa lỗi.

### 2. Cấu hình realm Keycloak đang chạy

`docker/examflow-realm.json` đã tắt tự đăng ký, đăng nhập bằng email, đổi username tự phục vụ và Google/Microsoft. **Import file không tự cập nhật realm đã tồn tại**. Không xóa volume Keycloak để ép import.

Khi Keycloak đã chạy ở cổng 8081, mở PowerShell tại thư mục gốc dự án:

```powershell
.\scripts\configure_institution_login.ps1
```

Nếu username quản trị Keycloak khác `admin`:

```powershell
.\scripts\configure_institution_login.ps1 -AdminUsername "TEN_QUAN_TRI_KEYCLOAK"
```

Nhập mật khẩu trực tiếp trong hộp thoại trên máy. Đây là tài khoản quản trị Keycloak ở realm `master`, không phải mật khẩu Supabase hay tài khoản admin ứng dụng. Script gọi Admin REST API, tắt đăng ký và các identity provider, sau đó kiểm tra kết quả; không ghi token/mật khẩu ra log hoặc file. Không gửi bí mật vào chat.

Cũng có thể cấu hình bằng Admin Console: chọn realm `online-exam-system`, tắt User registration / Login with email / Edit username và tắt các Identity Provider. Client `online-exam-frontend` giữ Direct Access Grants cho luồng username + password hiện có. Không đổi client secret hoặc xóa tài khoản trong bước này.

Tài liệu đối chiếu: [Keycloak Admin REST API](https://www.keycloak.org/docs-api/latest/rest-api/index.html), [Server Administration](https://www.keycloak.org/docs/latest/server_admin/).

### 3. Khởi động và đăng nhập lại

Backend trong `backend/`:

```powershell
.\mvnw.cmd spring-boot:run
```

Frontend trong `frontend/`:

```powershell
npm run dev
```

Khởi động AI như trước nếu ca yêu cầu giám sát. Ctrl+F5 trình duyệt và đăng nhập lại. Giữ cấu hình Storage hiện có; không cần bucket mới cho phòng thi.

## Tài khoản cũ và dữ liệu cũ

- Không tự đổi username hoặc email cũ; cần dữ liệu ánh xạ chính xác nếu muốn chuyển tài khoản cũ sang mã sinh viên.
- Đăng nhập và ảnh hồ sơ chỉ nhận đúng `keycloak_user_id` khớp `sub` đã xác thực. Bỏ fallback theo email và bỏ chức năng tự tạo/đổi vai trò khi login.
- Nếu tài khoản cũ liên kết sai: admin mở **Tài khoản → Sửa → Đối chiếu liên kết Keycloak**. Xác nhận đối chiếu. Backend chỉ liên kết tài khoản đang hoạt động khớp username/email/vai trò, không thuộc admin và chưa gắn với hồ sơ khác. Giữ nguyên ID hồ sơ, ảnh và bài làm. Nếu không khớp thì dừng để admin xử lý, không tự gộp hai hồ sơ.
- Bài đang làm từ ca cũ chưa có `room_id` vẫn có thể tiếp tục đến hạn bằng đúng tài khoản và đăng ký đã có; không cho người khác bắt đầu bài mới ở ca chưa công bố. Ngoại lệ này chỉ để hoàn tất bài cũ, không đánh dấu ca cũ đã công bố. Kết quả cũ của chính sinh viên được giữ lại.
- Câu hỏi đã gắn vào đề không được sửa nội dung/ghi lại đáp án. Tạo câu hỏi mới nếu cần sửa, để không làm thay đổi bài đang thi và lịch sử.

## Quyền và điều kiện nghiệp vụ

- Admin: quản lý lớp/phòng/thành viên/phân công, giám sát toàn hệ thống. Các thay đổi ghi audit log.
- Giảng viên: dùng API đề/ca thi cũ, kiểm tra quyền học phần ở backend; không có API tổ chức phòng mới. Vẫn giữ kiểm tra dữ liệu lịch sử khi xóa/đổi trạng thái.
- Ảnh bằng chứng: giảng viên giữ quyền chủ học phần như trước; admin xem theo quyền quản trị. Không cho sinh viên truy cập ảnh cảnh báo.
- Phòng chỉ nhận tài khoản sinh viên đang hoạt động. Chọn tất cả kết quả áp dụng mọi trang theo bộ lọc và giới hạn 2.000 người mỗi lần; có danh sách xem lại trước khi xác nhận.
- Xóa phòng chỉ khi chưa có thành viên/ca; lớp có sinh viên dùng ngưng hoạt động. Thành viên đã có bài tại phòng không bị xóa khỏi phòng. Thay đổi phòng không xóa đăng ký đã chốt.
- Công bố cần phòng hoạt động, học phần/đề hợp lệ, lịch còn hiệu lực, câu hỏi có ít nhất hai đáp án và đúng một đáp án đúng, danh sách không rỗng. Không công bố dữ liệu ca cũ đã có đăng ký/bài làm.
- Sửa lịch/đề/phòng của ca đã công bố hoặc có bài làm bị chặn. Tạo ca trùng cùng phòng/đề/tên/lịch trả lại bản ghi đã tạo để tránh nhân đôi khi retry.
- Bắt đầu thi khóa đề và ca trong transaction; DB có uniqueness ca–sinh viên. Hai request đồng thời dùng cùng lượt thi, không tạo bài mới khi đã nộp.
- Hủy/kết thúc có xác nhận và kiểm tra bài `in_progress`; không tự chấm lại, tự phạt điểm hoặc xóa bài. Hạn làm bài là giá trị nhỏ hơn giữa thời lượng đề và giờ kết thúc ca.

Định nghĩa số liệu giám sát:
- Tổng được phân: số dòng trong `exam_session_students`, không phải danh sách phòng hiện tại.
- Chưa vào: chưa có bài làm.
- Đang làm: bài `in_progress` và còn hạn theo thời gian server.
- Đã nộp: `submitted` hoặc `completed`.
- Hết hạn: `expired` hoặc bài `in_progress` đã quá hạn; đây là thống kê, không tự sửa điểm.
- Lượt có cảnh báo: đếm lượt thi có ít nhất một sự kiện active, không đếm mỗi sự kiện như một sinh viên.
- Không suy đoán mất kết nối, không phát trực tiếp webcam toàn phòng.

## Kiểm thử

Frontend:

```powershell
cd frontend
npm run build
node --test tests/organization-render.test.mjs tests/admin-import.test.mjs
```

Kiểm tra riêng giao diện: khi Vite chạy, mở `/tests/organization.html`. Đây là fixture có dữ liệu tổng hợp, không ghi database thật. Fixture chỉ minh họa phân hệ admin theo phạm vi hiện tại. Kiểm tra trên desktop và điện thoại.

Backend (JDK 17, Maven; PostgreSQL Docker tạm):

```powershell
cd backend
mvn "-Dqut.catalog.postgres=true" "-Dtest=*Tests,!BackendApplicationTests" test
```

Nếu Docker không hoạt động nhưng có PostgreSQL test binaries riêng, có thể thêm `-Dqut.catalog.pgBin=DUONG_DAN_BIN` (initdb.exe, pg_ctl.exe). Test tự tạo cluster trong `backend/target/qut-pg-test-*`, chỉ bind `127.0.0.1`, chạy schema mới và dừng cluster sau test. Không truyền URL hoặc mật khẩu Supabase. File binary test không đưa lên Git. Trên Windows, nếu gặp lỗi AF_UNIX của Java HTTP client, thêm `-DargLine=-Djdk.net.unixdomain.tmpdir=DUONG_DAN_NGAN_TUYET_DOI` tới thư mục local đang tồn tại.

`BackendApplicationTests` được loại khỏi lệnh này vì khởi động full app phụ thuộc cấu hình database/Keycloak thật; không vô tình kết nối Supabase để kiểm thử. Không có thay đổi Python trong lần này; các kiểm thử Java cho handshake/ảnh/Storage vẫn chạy để bắt hồi quy. Camera, model và upload Supabase thật cần kiểm tra riêng sau cấu hình.

### Bài thử trọn luồng trên máy bạn

1. Admin tạo hai tài khoản thử A, B và một tài khoản giảng viên (không dùng dữ liệu cá nhân thật để test).
2. Tạo lớp, gán lớp/khoa cho A và B. Tạo phòng, chỉ thêm A, phân giảng viên phụ trách.
3. Giảng viên tạo đề/ca bằng màn hình cũ; admin chọn phòng cho ca chưa công bố và kiểm tra đề có câu hỏi/đáp án hợp lệ, lập lịch trong tương lai.
4. Kiểm tra ca chưa công bố không hiện cho A/B. Xem lại danh sách, công bố; ca tương lai vẫn chưa xuất hiện để thi.
5. Đến giờ: A thấy ca trong khoảng 8 giây, B không thấy. B gọi URL/API trực tiếp vẫn bị chặn. API search/join bằng mã trả 410.
6. A cập nhật ảnh, vào thi, kiểm tra AI nếu ca bật AI; tải lại/tiếp tục dùng bài cũ. Thử mở đồng thời hai request không có hai lượt.
7. Admin mở **Giám sát ca thi**: tổng 1, trạng thái A đúng. Mở chi tiết xem cảnh báo/ảnh bằng quyền có sẵn.
8. Thêm B vào phòng sau công bố: B vẫn không được vào ca đã chốt. Hủy khi A đang làm bị chặn.
9. A nộp bài: không được làm lại; kết quả/ảnh/lịch sử còn nguyên. Admin kiểm tra số đã nộp và đóng ca khi hợp lệ.

## Các file thay đổi chính

- Database: migrations `009_exam_rooms.sql`, `010_assigned_examinations.sql`.
- Backend mới: `ExamOrganizationService`, `ExamOrganizationController`.
- Backend cập nhật: `ExamSession`, `UserEntity`, `StudentSessionDto`, `StudentProfileDto`; `StudentService`, `StudentProfileService`, `CurrentUserService`, `RegistrationService`, `SocialUserSyncService`, `AdminAccountService`, `AdminCatalogService`, `KeycloakAdminService`, `EvidenceAccessService`, `EvidenceReadService`; `AuthController`, `StudentController`, `StudentJoinController`, `TeacherExamController`, `TeacherExamSessionController`, `AdminController`, `AdminCatalogExceptionHandler`, `SecurityConfig`, `TokenAuthenticationFilter`, `TeacherQuestionBankService`.
- Frontend mới: `sessions/components/ExamOrganization.tsx`, `organization.css`, `student/components/AssignedExams.tsx`.
- Thời gian: `utils/examTime.ts` diễn giải LocalDateTime backend theo UTC+7, giữ nguyên timestamp đã có offset; dùng cho lịch, thời gian còn lại và bộ đếm bài làm.
- Frontend cập nhật: `ExamSessionsPage`, `StudentPortalPage`, `StudentWorkspace`, `studentService`, `LoginForm`, `LoginPage`, `AdminWorkspace`, `AdminAccountDialog`, `adminConfig`, `adminWorkspaceApi`.
- Cấu hình: `docker/examflow-realm.json`, `scripts/configure_institution_login.ps1`.
- Kiểm thử: `OrganizationHttpSecurityTests`, `ProvisionedIdentityTests`, mở rộng `AdminCatalogPostgresTests`, cập nhật `StudentPhotoHttpSecurityTests` theo định danh được cấp; `organization-render.test.mjs`, `organization.html`, `organization-fixture.tsx`, fixture admin.

## Giới hạn xác minh

Đã kiểm thử tự động bằng PostgreSQL tạm và HTTP/Storage giả lập cục bộ, không dùng Supabase thật. Kiểm thử render frontend kiểm tra nội dung/trạng thái, không thay thế kiểm tra bố cục và tương tác trên trình duyệt. Quyền dùng trình duyệt local đang tắt trong Work settings nên chưa kiểm tra trực quan desktop/mobile lần này. Chưa áp dụng migration hoặc policy Keycloak vào hệ thống thật; chưa đăng nhập và thi thật với camera/model sau chuyển đổi. Cần hoàn tất các bước cấu hình và bài thử trên trước khi khẳng định tích hợp trọn luồng đã hoàn tất.

Kết quả kiểm tra ngày 17/10/2026:
- Backend: 98/98 đạt, 0 lỗi, 0 thất bại; gồm 10 bài PostgreSQL thực, hai request đồng thời tạo đúng một lượt thi, phân quyền, công bố lặp, bảo toàn danh sách, ca cũ đang làm, nhiều ca/nhóm thống kê, tài khoản và bù lỗi Keycloak, hồi quy ảnh/bằng chứng/AI handshake. Dùng PostgreSQL 17.6 chạy tạm vì Docker chưa khởi động được; cụm test được dừng sau chạy.
- Frontend: build đạt; 18/18 test render/thời gian/CSV đạt. Thời gian lịch được kiểm tra với timezone UTC, New York và Việt Nam. Build còn cảnh báo bundle lớn vốn có.
- ESLint: không có lỗi ở các file đã kiểm tra; trang StudentPortalPage còn 4 cảnh báo dependency của các effect cũ trong giám sát/lifecycle, chưa thay đổi cơ chế AI để xử lý các cảnh báo đó.
- Script cấu hình Keycloak đã kiểm tra cú pháp PowerShell; chưa chạy thay đổi realm đang dùng. Không có bí mật nào được đưa vào file test hoặc chat.

## Khôi phục phần giảng viên theo yêu cầu

Đã gỡ mục Giám sát ca thi mới khỏi sidebar/header/dashboard giảng viên, khôi phục giao diện ca thi và form cũ. API `/api/teacher/exam-sessions` trả danh sách dạng mảng và nhận request cũ, không yêu cầu chọn phòng/công bố ở giảng viên. API `/api/teacher/organization/*` không còn được cung cấp. Lịch sử/ảnh bằng chứng đã tích hợp trước đợt thay đổi phòng thi được giữ lại với quyền chủ học phần trước đó.

Admin chịu trách nhiệm gán phòng và công bố danh sách cho sinh viên. Ca do form giảng viên cũ tạo chưa tự công bố; admin có thể chọn phòng và công bố nếu ca chưa có bài làm/danh sách cũ. Các ca đã có lịch sử cần giữ nguyên, tạo ca mới khi chuyển mô hình. Vẫn giữ bảo vệ quyền học phần, đề/câu hỏi đã sử dụng và lịch sử bài làm.

Không xóa hoặc hoàn tác cột/bảng Supabase, tài khoản, model, bài làm hay ảnh. Migration 010 vẫn cần để công bố ca; cột tác giả đã thêm được giữ tương thích, không dùng để bổ sung màn hình giám sát giảng viên.

Kiểm tra sau khôi phục: build frontend và 22 test frontend đạt. Bộ backend chạy trên PostgreSQL tạm xác nhận ca tạo từ form giảng viên cũ có thể được admin gán phòng/công bố và xuất hiện đúng cho sinh viên; các test quyền, định dạng API ca cũ và lịch sử bằng chứng đã chạy. Chưa kiểm tra trực tiếp đăng nhập/thao tác trên trình duyệt với database thật.
