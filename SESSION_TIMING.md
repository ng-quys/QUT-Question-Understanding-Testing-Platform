# Thời gian làm bài theo ca thi

Đề thi chỉ chứa nội dung, môn học, câu hỏi, điểm và cấu hình trộn câu/đáp án. Không nhập hoặc lưu thời lượng riêng cho đề. Một đề có thể được dùng ở các ca có thời gian khác nhau.

Ca thi giữ `start_time` và `end_time`. Thời lượng hiển thị cho sinh viên được tính từ hai mốc này. Hạn nộp bài luôn là `end_time`, kể cả sinh viên vào muộn hoặc tiếp tục bài sau khi đăng nhập lại. Ví dụ ca 09:00–10:00, sinh viên vào 09:10 còn 50 phút. Hết giờ, backend không nhận đáp án mới; giao diện đang mở gửi nộp tự động và backend chấm các đáp án đã lưu. Giám sát AI cũng kết thúc theo hạn của ca.

`durationMinutes` trong API ca/bài làm sinh viên là giá trị tính từ lịch ca, không phải trường lưu trong đề. API tạo/sửa/xem đề không còn trường này. `exams.exam_date` cũ chỉ là thông tin tổng hợp tương thích của danh sách đề; không quyết định lịch vào thi.

Triển khai backend/frontend mới cùng `database/migrations/016_session_based_exam_timing.sql`. SQL bỏ `exams.duration_minutes` và cập nhật view báo cáo `vw_exam_summary` nếu có, giữ owner/quyền truy cập/cấu hình/comment của view. Không thay giờ ca, câu hỏi, bài làm hoặc điểm. Sao lưu giá trị cũ trước khi chạy trên database có dữ liệu; không chạy SQL này với backend cũ còn hoạt động. Migration chạy lại được và không dùng CASCADE để xóa các đối tượng phụ thuộc chưa biết.

Đã áp dụng SQL 016 vào database cục bộ cấu hình của dự án ngày 19/10/2026, khi không có bài đang làm. Đối chiếu hash trước/sau xác nhận nội dung 29 đề, lịch 46 ca, liên kết câu hỏi và bài làm giữ nguyên. Giá trị thời lượng cũ được sao lưu riêng trong `.qut-run/exam-duration-before-016-*.json` (không đưa lên Git). Backend đã khởi động lại với code mới. Không cần chạy lại SQL này trên database đó; môi trường khác vẫn cần triển khai migration cùng code.

Kiểm thử gồm sinh viên vào muộn, lưu đáp án sau hơn 60 phút khi ca còn mở, từ chối đáp án sau giờ kết thúc, cùng một đề dùng ở hai ca 30/120 phút, thống kê quản lý ca và migration giữ nguyên nội dung/lịch sử.
