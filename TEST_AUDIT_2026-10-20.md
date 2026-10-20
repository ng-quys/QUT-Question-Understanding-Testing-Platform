# Kết quả kiểm tra ExamFlow — 20/10/2026

Kiểm tra bản làm việc hiện tại trên nhánh `TrongTruong`, gồm các thay đổi chưa commit. Người dùng đăng nhập admin trong trình duyệt thử tại `http://localhost:5173/admin`.

## Kết quả tự động

| Phạm vi | Kết quả | Giới hạn |
| --- | --- | --- |
| Backend: dịch vụ, phân quyền HTTP, lưu trữ, tài khoản, ca thi, đáp án, snapshot, AI credits | 212 đạt, 1 bỏ qua; không có test thất bại | Không chạy `BackendApplicationTests.contextLoads` vì dùng cấu hình database thật. Test bị bỏ qua là gọi FastAPI thật để trích xuất PDF. |
| PostgreSQL tích hợp | 37 đạt, đã nằm trong tổng backend phía trên | Database tạm riêng; có CRUD, phân công, ca thi, mã đồng thời, chỉnh sửa snapshot, mất/kết nối lại ngân hàng câu hỏi. |
| Frontend | 47 đạt | Có import CSV, phân tách đăng nhập giữa tab, refresh token, âm thanh giám sát và khôi phục đáp án mất mạng; sử dụng giả lập theo từng test. |
| Giao diện AI credits phía giảng viên | Đạt | HTTP và timer giả lập, không gọi database hoặc LLM thật. |
| AI giám sát | 92 đạt | HTTP tạm, ảnh/model giả theo bài test, không sử dụng camera cá nhân. |
| Model giám sát thật | Đạt | Nạp model và xử lý hai mẫu JPEG/PCM tổng hợp với trạng thái tách biệt; không đánh giá độ chính xác nhận diện người thật hoặc sức chịu tải đông sinh viên. |
| Build frontend | Đạt | TypeScript và Vite build thành công. |
| Lint frontend | Chưa đạt: 35 lỗi, 13 cảnh báo | Bao gồm Fast Refresh, kiểu `any`, hooks/refs, tính thuần và biến thừa. Không đồng nghĩa có 35 chức năng hỏng. |
| Test Python tạo đề AI | Chưa chạy được | Python mặc định thiếu `fastapi`; chưa có môi trường `ai-service/.venv` theo yêu cầu launcher. Hai module test không import được. |

Log nằm trong `.qut-run/full-audit-*` và `.qut-run/course-bank-fallback-*` (không commit thư mục này).

## Kiểm tra trực tiếp bằng admin

| Chức năng | Kết quả quan sát |
| --- | --- |
| Đăng nhập admin, tổng quan, biểu đồ | Mở được sau khi người dùng đăng nhập; thống kê phân biệt bài đã nộp và bài có điểm hợp lệ. |
| Danh sách học phần, tìm theo mã TI01 | Tải được; lọc còn đúng học phần; số câu hỏi ghi “Chưa kết nối” khi database ngân hàng lỗi. |
| Tài khoản, tab giảng viên, form tạo mới | Danh sách tải được. Mã mới hiển thị đầy đủ 10 số theo đầu `300124`, chỉ đọc. Khoa chọn được và giảng viên không có ô lớp. Không bấm tạo tài khoản thật. |
| Phòng thi và lớp hành chính | Danh sách tải được; mã phòng ngắn và bảng lớp không lặp hai cột mã/tên. |
| Form tạo ca | Tải được đợt thi, môn, khoa và số sinh viên chưa xếp. Ngăn gửi khi còn thiếu ngày giờ. Không lưu ca thật. |
| Danh sách ca thi, tìm CT-4, chi tiết ca | Mở được; CT-4 hiện đã kết thúc; lịch bị khóa vì đã có bài làm. |
| Xem/quản lý đề của CT-4 | Tải đủ 10 câu, đáp án và điểm. Đề đã sử dụng hiển thị thao tác tạo bản chỉnh sửa; không sửa đề hoặc tạo bản sao thật. |
| Giám sát ca đang thi | Tải được trạng thái rỗng khi không có ca đang diễn ra. |
| Ca có cảnh báo → sinh viên → lượt thi | Đi đúng tới sinh viên có cảnh báo trong CT-4 và lượt thi 104. Có lỗi nhãn trạng thái ca, mô tả bên dưới. |
| Chi tiết rủi ro, sự kiện, ảnh bằng chứng | Hiển thị điểm rủi ro và dòng thời gian; ảnh Storage tải thành công (kiểm tra ảnh đã tải, không đưa ảnh cá nhân vào báo cáo). Không lưu đánh giá sinh viên. |
| Báo cáo, lọc nhanh Hôm nay | Tải được biểu đồ và số liệu. Bộ lọc ngày 20/10/2026 trả trạng thái rỗng và điểm trung bình “—”, không lỗi chia cho 0. |
| Xuất CSV báo cáo | Tạo được tệp local, đọc lại xác nhận 85 bản ghi và các cột báo cáo. |
| Nhật ký quản trị | Tải được danh sách và các thao tác đã ghi nhận. |

## Lỗi và cấu hình cần xử lý

### 1. Database ngân hàng câu hỏi bị từ chối đăng nhập — ưu tiên cao

Log backend ghi lỗi xác thực PostgreSQL và `Question Bank: CONNECTION FAILED`. Cần cấp đúng `QUESTION_BANK_DB_PASSWORD` cho tiến trình backend, khớp database Question Bank đã cấu hình. Không gửi mật khẩu vào chat hoặc Git.

Bản sửa trước cuộc kiểm tra đã giúp danh sách học phần vẫn tải được. Điều đó chưa sửa kết nối ngân hàng câu hỏi; thao tác đọc/ghi ngân hàng ở các chức năng khác vẫn có thể bị chặn. Không được xem số câu hỏi chưa biết là 0 hoặc nới điều kiện xóa.

### 2. Dịch vụ tạo đề AI chưa sẵn sàng — ưu tiên cao nếu dùng tính năng này

Backend, Keycloak và AI giám sát trả HTTP 200. Dịch vụ tạo đề ở cổng 8002 không phản hồi. Thiếu `ai-service/.venv`; Python mặc định không import được FastAPI. Cần chuẩn bị môi trường riêng, các dependency, model/Ollama và cấu hình khóa nội bộ đúng trước khi kiểm tra tạo đề thật. Test backend/UI giả lập thành công chưa xác nhận được một lần sinh đề bằng LLM thật.

### 3. Trạng thái ca ở bảng cảnh báo không khớp giờ kết thúc — lỗi chức năng đã tái hiện

Tại thời điểm kiểm tra ngày 20/10/2026, bảng “Ca thi có cảnh báo” hiển thị CT-4 (đã kết thúc ngày 19/10) là “Đã lên lịch”; các ca từ ngày 16/10 vẫn là “Đang diễn ra”. Danh sách ca thi chính lại hiển thị đúng “Đã kết thúc”.

Nguồn cần sửa: `AdminWorkspaceService.dataset("warning-sessions")` trả thẳng `s.status`; cần thống nhất trạng thái tính theo thời gian và điều kiện công bố với màn hình danh sách/giám sát, đồng thời thống nhất bộ lọc trạng thái. Không cần thay đổi dữ liệu bài làm để sửa nhãn này.

### 4. Kiểm tra lint chưa đạt — cần dọn trước khi đặt làm kiểm tra bắt buộc

35 lỗi và 13 cảnh báo trên nhiều phần frontend, gồm cả mã giảng viên và fixture thử nghiệm. Cần phân loại lỗi có ảnh hưởng React/hook với quy tắc tổ chức file/kiểu dữ liệu; không tắt toàn bộ lint chỉ để có kết quả xanh. Không tự đổi phần giảng viên trong đợt kiểm tra này.

### 5. Các điểm giới hạn/cần cải thiện nhỏ

- Keycloak hiện chấp nhận địa chỉ `localhost:5173`; truy cập bằng `127.0.0.1:5173` gặp `Invalid parameter: redirect_uri`. Dùng địa chỉ localhost theo cấu hình hiện tại, hoặc bổ sung đúng redirect URI cụ thể khi cần hỗ trợ địa chỉ khác.
- Khi chưa biết số câu hỏi, một số nút xóa học phần vẫn bật; backend vẫn kiểm tra và chặn nếu không xác minh được dữ liệu liên quan. Nên vô hiệu hóa nút và giải thích điều kiện này ở giao diện.
- Nhấn Tạo tài khoản từ tab Giảng viên vẫn mở form mặc định Sinh viên; có thể chọn lại vai trò bình thường. Nên truyền vai trò đang lọc để giảm thao tác nhầm.

## Phạm vi chưa xác nhận trực tiếp

- Chưa đăng nhập bằng tài khoản giảng viên và sinh viên để đi trọn luồng thi thật trong lần này; các phần đó mới có kết quả test tự động tương ứng.
- Không tạo/xóa tài khoản, thay mật khẩu, hủy/công bố ca, đổi giờ, nộp bài, sửa đề hay lưu đánh giá trên dữ liệu thật. Các thao tác ghi được kiểm tra bằng database tạm và mock.
- Form ngày giờ HTML trong công cụ trình duyệt thử không giữ được giá trị khi nhập tự động; không xem đây là lỗi của ứng dụng. Chưa đi trọn ba bước tạo ca bằng giao diện thật; luồng được kiểm tra ở bộ test tích hợp.
- Không kiểm tra camera/micro thật trong một lượt thi, nhiều máy đồng thời, hoặc sức chịu tải.

Kết luận: chưa có lỗi trong các bộ kiểm thử đã thực thi, nhưng còn lỗi trạng thái ca và các cấu hình Question Bank / dịch vụ tạo đề AI nêu trên. Chưa đủ căn cứ kết luận toàn bộ luồng của ba vai trò đã hoạt động hoàn chỉnh trên môi trường thật.
