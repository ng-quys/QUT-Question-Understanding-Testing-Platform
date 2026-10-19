# Mã tự động trong admin

Các bản ghi tạo mới từ admin dùng mã do máy chủ cấp. Không thay đổi mã của dữ liệu hay tài khoản hiện có.

| Mục | Ví dụ mã mới |
| --- | --- |
| Lớp hành chính | L01, L02, …, L100 |
| Môn học | MH01, MH02, … |
| Đợt thi | DT01, DT02, … |
| Đề thi / bản chỉnh sửa | DE01, DE02, … |
| Phòng thi | P01, P02, … (theo ID phòng) |
| Ca thi theo khoa | CT-1, CT-2, … (quy tắc sẵn có) |
| Sinh viên | 2000000001, 2000000002, … |
| Giảng viên | 3000000001, 3000000002, … |

Mã SV/GV luôn là chuỗi đúng 10 chữ số: tiền tố 200 hoặc 300 và 7 chữ số tiếp theo. Form hiển thị tiền tố trước khi lưu, rồi thông báo mã thực tế sau khi tạo thành công. Cùng mã này được lưu ở ứng dụng và dùng làm username trong Keycloak.

Danh sách lớp chỉ còn một cột **Lớp** thay vì hai cột Mã/Tên trùng nhau. Các form tạo danh mục không yêu cầu nhập mã; sửa bản ghi giữ nguyên mã đã cấp. API admin bỏ qua mã do phía trình duyệt gửi. Các dịch vụ nội bộ vẫn có thể nhận mã tường minh cho dữ liệu cũ và công cụ nội bộ.

CSV tài khoản cần các cột `email,fullName,password,role`; `department` không bắt buộc. Cột `username` trong tệp cũ được bỏ qua. Mỗi dòng được cấp mã theo vai trò khi lưu. Email trùng trong tệp bị báo lỗi. Tệp mẫu trong giao diện đã cập nhật.

Áp dụng `database/migrations/017_admin_automatic_codes.sql` trước khi chạy backend mới. PostgreSQL sequence cấp mã riêng cho từng loại, không quay vòng và không dùng MAX+1; tự bỏ qua mã đã có trong dữ liệu. Tài khoản cũng kiểm tra tên đăng nhập đã tồn tại riêng trên Keycloak. Sequence không thu hồi khi giao dịch thất bại nên có thể có khoảng trống; không yêu cầu mã liên tục.

Giữ nguyên định danh nội bộ, các liên kết ca thi và tên đăng nhập cũ. Thay đổi này chỉ áp dụng luồng admin; form tạo đề của giảng viên giữ cách nhập mã hiện tại.
