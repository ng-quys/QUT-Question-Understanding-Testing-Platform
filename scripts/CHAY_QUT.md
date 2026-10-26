# Chạy QUT trên Windows

Nhấp đúp **`CHAY_QUT.bat`** tại thư mục gốc. File kiểm tra cấu hình, dùng lại dịch vụ đang hoạt động, khởi động Keycloak (Docker nếu cần), Python AI, backend và frontend, rồi mở trình duyệt sau khi website sẵn sàng.

- Sinh viên/giảng viên: http://localhost:5173
- Admin: http://localhost:5173/admin/login
- Nhật ký: `.qut-run/<dịch vụ>.out.log` và `.err.log`.
- Dừng: nhấp đúp **`DUNG_QUT.bat`**. Chỉ các tiến trình do launcher tạo mới bị dừng; Keycloak/Docker và dịch vụ đã chạy trước đó được giữ nguyên. Đóng cửa sổ launcher không tự dừng dịch vụ chạy nền.

## Chuẩn bị một lần

1. Node.js 20.19+ hoặc 22.12+, JDK 17+, Python **3.11** (hoặc 3.10). Cài Python từ python.org nếu launcher báo thiếu; Python 3.13 không được dùng cho bộ thư viện/model AI hiện tại.
2. Docker Desktop đang hoạt động nếu Keycloak chưa được chạy bằng cách khác. Launcher dùng volume Keycloak hiện có, không xóa dữ liệu và không tạo lại tài khoản.
3. Cấu hình database và Keycloak hợp lệ trong `backend/src/main/resources/application.properties` hoặc các biến môi trường được file đó tham chiếu. Root `.env` chứa cấu hình Docker Compose. Schema/seed phải có sẵn; launcher không chạy toàn bộ migration hoặc reset database.
4. Cung cấp các model AI được liệt kê bởi `anticheating/check_models.py`. Lần đầu cài InsightFace có thể cần Microsoft C++ Build Tools. Launcher không tự tải model, không thay trọng số và không xóa ảnh sinh viên.

Nếu `.venv` được chép từ máy khác và không chạy được, launcher giữ nguyên thư mục đó, tìm Python 3.10/3.11 hợp lệ và tạo `anticheating/.venv-launcher` khi cần. Thư viện chỉ được cài khi kiểm tra phát hiện còn thiếu. Cần Internet cho lần cài dependency đầu tiên. Camera và micro chỉ được mở khi bắt đầu bài thi.

## Tùy chọn

```bat
REM Chỉ kiểm tra, không mở trình duyệt, không cài gói hoặc khởi động dịch vụ
CHAY_QUT.bat -CheckOnly

REM Chạy website khi chưa chuẩn bị AI
CHAY_QUT.bat -WebOnly

REM Không tự mở trình duyệt
CHAY_QUT.bat -NoBrowser
```

`-WebOnly` không khởi động Python AI. Bài thi yêu cầu AI vẫn cần dịch vụ AI hoạt động. Khi sửa Java hoặc cấu hình backend, dùng `DUNG_QUT.bat` rồi chạy lại; nếu backend được mở bằng terminal/IDE khác, hãy khởi động lại ở chính nơi đó.

## Supabase

Không cần gửi mật khẩu Supabase vào chat. Website dùng thông tin database đã cấu hình trên máy. Bucket `exam-evidence` chưa tự kết nối với ứng dụng chỉ bằng cách tạo bucket: luồng upload/đọc ảnh bằng signed URL cần tích hợp riêng. Kết nối Storage dùng khóa server, khác mật khẩu database; giữ trong cấu hình server riêng tư và không đưa vào frontend/Git.
