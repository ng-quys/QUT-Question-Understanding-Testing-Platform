# Đăng nhập bằng database chung

Ứng dụng xác thực trực tiếp bằng `users` trong database ExamFlow Main (Supabase).
Không cần chạy Keycloak, Docker hay cấu hình cổng 8081 để đăng nhập.

## Máy khác trong nhóm

1. Commit phần đang làm, rồi pull code đã gộp.
2. Dùng cùng cấu hình database chính; chạy migration `database/migrations/019_database_authentication.sql` nếu database chưa có. Migration đã được áp dụng trên Supabase chung ngày 21/10/2026, không cần chạy lại trên từng máy.
3. Trong frontend chạy `npm ci`; trong backend chạy Maven để tải thư viện mới. Khởi động bằng file chạy dự án như trước.
4. Đăng nhập lại. Token Keycloak cũ không còn được chấp nhận.

Giữ cấu hình riêng của ngân hàng câu hỏi, storage và AI như trước. Không gửi file chứa mật khẩu lên Git.
Các máy dùng chung database nhìn thấy cùng tài khoản, mật khẩu, trạng thái và vai trò; không cần chung khóa ký token.

## Tài khoản và phiên

- Admin cấp mã cố định và mật khẩu ban đầu; mật khẩu được băm Argon2id. Hệ thống vẫn kiểm tra được BCrypt cũ và Argon2id đã chuyển từ Keycloak.
- Đăng nhập bằng mã; vai trò luôn lấy từ database. Không tự đăng ký hay tự cấp quyền admin.
- Token truy cập và token làm mới là số ngẫu nhiên 256 bit. Database chỉ lưu SHA-256 của token trong `auth_sessions`, không lưu token nguyên văn.
- Access token có hạn 15 phút; phiên có hạn tuyệt đối 24 giờ. Mỗi lần làm mới thay cả hai token. Token làm mới không gia hạn mốc 24 giờ.
- Token và hồ sơ ở `sessionStorage` riêng từng tab, cho phép kiểm thử admin và sinh viên song song.
- Khóa, đổi vai trò, đặt lại hoặc đổi mật khẩu thu hồi các phiên cũ. Đăng xuất thu hồi phiên hiện tại khi kết nối được máy chủ.
- Sau 10 lần nhập sai cho cùng tài khoản, tạm dừng đăng nhập 5 phút.
- Lỗi mạng không xóa phiên hay bài làm đang lưu tạm; khi có mạng hệ thống thử đồng bộ lại. Thời gian kết thúc ca không đổi.
- `POST /api/auth/password` nhận `currentPassword` và `newPassword` để người đã đăng nhập đổi mật khẩu của mình; sau đó phải đăng nhập lại. Admin có nút đặt lại mật khẩu cho SV/GV.

Các API cũ nhận principal kiểu `Jwt` vẫn hoạt động qua bộ chuyển đổi nội bộ từ phiên database. Đây không phải cơ chế chấp nhận JWT bên ngoài hay gọi máy chủ Keycloak.
Cột `keycloak_user_id` được giữ làm định danh lịch sử để không làm mất liên kết hồ sơ; tài khoản mới không cần cột này.

## Chuyển tài khoản cũ

Trên máy này đã chuyển 6 bản băm có ID, username và email khớp hoàn toàn với hồ sơ database. Không đổi mã, mật khẩu, bài thi hoặc ảnh của các hồ sơ đó.
Có 14 hồ sơ chưa có mật khẩu; admin cần đặt lại mật khẩu khi muốn sử dụng. Không tự gán mật khẩu mặc định chung.

Công cụ `scripts/MigrateKeycloakCredentials.java` chỉ dùng một lần, mặc định đối chiếu thử; `--apply` mới ghi dữ liệu. Tệp đầu vào chứa bản băm là dữ liệu nhạy cảm, phải để ngoài Git và xóa sau khi chuyển xong.
Docker Compose cũ chỉ còn dưới profile `legacy-keycloak` để có thể khôi phục dữ liệu lịch sử. Không xóa volume khi chưa có bản sao cần thiết.

## Xác minh ngày 21/10/2026

- Build frontend thành công; 53 test frontend đạt.
- 58 test backend về xác thực, quản lý tài khoản và quyền truy cập API đạt.
- Đã tạo SV/GV thử qua API thật, đăng nhập, kiểm tra phân quyền, xoay token, đăng xuất, đổi mật khẩu, admin đặt lại mật khẩu và khóa tài khoản. Các phiên cũ bị từ chối đúng yêu cầu.
- Tài khoản thử và các bản ghi hạn mức AI tự sinh của chúng đã được dọn, không tạo công việc AI hay lượt thi thử trong bước này.
- Đã dừng cả hai container Keycloak; đăng nhập lại bằng tài khoản giảng viên đã chuyển vẫn thành công. Backend và frontend đang chạy; volume Keycloak còn nguyên.
- Tệp xuất bản băm tạm đã được xóa. Không có mật khẩu hay token thật trong tài liệu này.
