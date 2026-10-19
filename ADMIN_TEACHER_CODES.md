# Mã giảng viên và giao diện admin

Tài khoản SV/GV mới dùng mã 10 chữ số ở username; giữ kiểu chuỗi để bảo toàn số 0 đầu. Email là trường liên hệ riêng. Form cấp tài khoản, kiểm tra backend và nhập CSV cùng áp dụng quy tắc này. Tài khoản cũ chưa có mã được báo Chưa cấp mã trong cột mã, không lấy email làm mã số.

Mã mẫu giảng viên dự kiến bắt đầu 8000000001; công cụ bỏ qua mã đã tồn tại và giữ nguyên giảng viên đã có mã 10 số. Tài khoản admin và sinh viên không thuộc phạm vi đổi mã.

## Đồng bộ dữ liệu mẫu

Với hồ sơ có tài khoản Keycloak, cần đổi username đồng bộ, giữ nguyên user ID, Keycloak subject, email, mật khẩu và các liên kết đề/ca thi. Công cụ kiểm tra danh tính và vai trò, kiểm tra trùng mã, lưu mapping và backup trong .qut-run, dùng giao dịch SQL cùng thao tác bù Keycloak khi lỗi. Mặc định Apply bị chặn nếu có hồ sơ chưa có danh tính Keycloak. Cần xem bản đồ mapping trước khi chạy trên database khác.

Riêng hồ sơ mẫu chỉ có trong database, `-Apply -AllowUnlinkedDemo` cho phép cấp mã hiển thị sau khi xác nhận không có tài khoản Keycloak khớp mã cũ, subject hoặc email. Thao tác này không tạo tài khoản đăng nhập và không tạo/đổi mật khẩu. Các trạng thái đối chiếu sai hoặc trùng danh tính vẫn bị chặn.

Từ thư mục gốc dự án, mở Keycloak và bảo đảm Supabase đang hoạt động:

```powershell
.\scripts\update-demo-teacher-codes.ps1
# Xem .qut-run/test-teacher-code-plan.json rồi áp dụng:
.\scripts\update-demo-teacher-codes.ps1 -Apply
```

Dùng cấu hình backend và các biến môi trường cục bộ. Không đưa mật khẩu, client secret hay file backup lên Git. Sau đổi mã, đăng nhập bằng mã GV mới; mật khẩu giữ nguyên. Không cần thêm bảng/cột hay chạy SQL mới cho phần giao diện và quy tắc cấp tài khoản này.

**Đã áp dụng ngày 19/10/2026:** năm hồ sơ cũ ID 2, 3, 32, 35, 40 lần lượt nhận mã `8000000001` đến `8000000005`. ID 40 đã đổi username trên Keycloak và xác minh subject vẫn khớp. Bốn hồ sơ mẫu ID 2, 3, 32, 35 không có tài khoản Keycloak tương ứng; chỉ cấp mã hồ sơ, chưa đăng nhập được. ID, email, tên, ảnh và các trường hồ sơ khác được đối chiếu giữ nguyên; không đổi dữ liệu thi/bằng chứng. Backup và kết quả đối chiếu nằm trong `.qut-run/test-teacher-codes-before-*.json` và `.qut-run/test-teacher-code-result.json`, không đưa lên Git.

Tài khoản mới `2003507747` có mã, subject liên kết đúng, role `TEACHER`, đang bật, có password credential không tạm thời và không có required action. Log Keycloak ghi nhận `invalid_user_credentials` cho các lần đăng nhập thất bại. Chưa xác minh đăng nhập bằng mật khẩu thực tế vì không thu thập mật khẩu người dùng. Admin có thể vào Quản lý tài khoản → sửa tài khoản → Đặt lại mật khẩu để cấp lại; công cụ cấp mã không thay mật khẩu này.

## Giao diện admin

Dùng một font Segoe UI cho toàn khu vực admin, hệ màu xanh dương, tiêu đề navy, chữ phụ xám xanh; thống nhất bảng, biểu mẫu, nút và hộp thoại. Tạo ca gồm ba màn riêng: Thông tin → Kiểm tra danh sách → Xác nhận và lưu. Bấm bước đã mở để xem lại; sửa dữ liệu đầu vào sẽ vô hiệu hóa danh sách cũ và yêu cầu xem trước lại. Bước hai dùng bảng theo nhóm, có mã SV/họ tên/lớp và phân trang 10 dòng. Bước ba hiển thị tóm tắt, chưa công bố hay phân công tự động.

Kiểm tra browser dùng fixture tổng hợp, không ghi dữ liệu thật. Đã đối chiếu chuyển bước, quay lại giữ dữ liệu và form tài khoản giảng viên. Luồng bài thi và giao diện nghiệp vụ giảng viên được giữ nguyên; chỉ nhãn đăng nhập giảng viên dùng Mã giảng viên.

Kiểm chứng cuối: build frontend, 27 test frontend, 139 test backend đạt (loại contextLoads phụ thuộc dịch vụ thật); ESLint các file giao diện sửa không có lỗi. Browser fixture xác nhận sửa thông tin làm vô hiệu hóa preview cũ, quay lại giữ trường đã nhập và lưu thành công sau bước ba. Có cảnh báo bundle lớn của Vite.
