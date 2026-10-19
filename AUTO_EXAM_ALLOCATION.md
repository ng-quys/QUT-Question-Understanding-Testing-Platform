# Luồng chia ca đã được thay thế

Hướng gán học phần cho sinh viên và chia các ca nối tiếp nhau đã được thay bằng **một ca thi theo khoa, nhiều nhóm cùng giờ**.

Xem [DEPARTMENT_EXAMS.md](DEPARTMENT_EXAMS.md) để cấu hình và sử dụng luồng hiện tại.

SQL 012 hiện đã rút gọn, không tạo bảng gán môn hoặc phân ca nối tiếp. Chạy bản 012 hiện tại rồi SQL 013. API cũ trả 410; API tạo đợt thi được giữ lại. Không nhập dữ liệu gán môn hoặc chạy lại hướng dẫn của bản cũ.

Bản SQL 012 trước khi rút gọn được lưu trong `.qut-run/minimal-012-before` để đối chiếu, không phải migration cần chạy. Không tự xóa bảng/dữ liệu trên Supabase nếu đã áp dụng bản cũ.
