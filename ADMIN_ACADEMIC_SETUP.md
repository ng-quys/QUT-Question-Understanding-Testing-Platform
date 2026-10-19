# Tài khoản sinh viên và quản lý ca thi

Form tạo/sửa tài khoản sinh viên có khoa và lớp hành chính. Lớp được lọc theo khoa; backend kiểm tra lớp tồn tại, đang hoạt động và đúng khoa. Khi khóa/mở tài khoản, lớp đang có được giữ nguyên. Lớp được lưu vào `users.student_class_id`, khoa lưu vào `users.department`.

Dữ liệu thử được chuẩn bị tại `database/seeds/001_demo_faculties_classes.sql`: Công nghệ thông tin (`DHTH01`–`DHTH05`), An toàn & Mạng thông tin (`DHAT01`–`DHAT05`), Khoa học dữ liệu (`DHKT01`–`DHKT05`). Chỉ 27 ID và mã sinh viên thử được chỉ định trong file được phân lại lớp/khoa. Mỗi khoa có 9 sinh viên; 5 lớp có số lượng 2–2–2–2–1. File không tạo tài khoản Keycloak, đổi mật khẩu, email hay xóa dữ liệu. Nếu ID hoặc mã không khớp, toàn bộ giao dịch bị hủy. Không chạy file seed trên database khác mà chưa kiểm tra phạm vi ID.

Admin dùng **Phòng thi & lớp** để quản lý phòng, sức chứa và lớp; **Tạo ca thi** để chọn môn/khoa/đợt thi, chia nhóm cùng giờ và bổ sung phân công. Mã phòng được backend cấp khi bỏ trống; form không yêu cầu nhập mã. Mã ca tổ chức `CT-<ID>` được xác định ổn định từ ID database. Mã của ca dự thi từng nhóm được backend tạo khi công bố. Mã cũ chỉ đổi khi chạy migration 015; xem ADMIN_EXAM_WORKFLOW.md.

Menu Đề thi riêng đã bỏ. Trong chi tiết nhóm và danh sách ca, **Xem / Quản lý đề** mở nội dung câu hỏi, đáp án và đáp án đúng qua API chỉ dành cho admin. Đề nháp chưa có ca hoặc bài làm được sửa nội dung câu hỏi và đáp án. Đề đã dùng được tạo bản chỉnh sửa thành đề nháp mới, giữ nguyên lịch sử. Đóng đề chưa sử dụng giữ nguyên câu hỏi; đề đã dùng phải xử lý qua hủy/kết thúc ca, không sửa cấu trúc hay đóng toàn bộ đề đang dùng chung. Nhóm có đề đã đóng không được coi là sẵn sàng công bố. Khi giảng viên có đề đúng môn, chi tiết nhóm báo số đề phù hợp; admin chọn đề khi phân công, không tự chọn một đề bất kỳ.

## Giám sát AI theo từng ca/nhóm

Áp dụng migration `database/migrations/014_session_ai_policy.sql` sau 013 trước khi khởi động backend mới. Migration chỉ thêm `ai_enabled` kiểu BOOLEAN cho `exam_sessions` và `exam_sitting_groups`. Giá trị NULL giữ cách kế thừa cấu hình đề cũ. Không bật/tắt bất kỳ ca đang chạy nào khi chạy migration.

Công tắc **Giám sát AI** trong nhóm lưu cấu hình trước công bố và chuyển sang ca thực tế khi công bố. Danh sách ca và trang giám sát cũng có công tắc theo ca. Khi tắt, backend dừng phiên giám sát nền và từ chối frame tiếp theo; frontend đóng camera/micro khi nhận trạng thái mới. Khi bật lại, backend đăng ký lại phiên AI; trình duyệt mở lại camera/micro theo quyền người dùng đã cấp. Bài làm, thời gian thi, giám sát hành vi trình duyệt và cấu hình ca khác được giữ nguyên. Ca đã hủy/kết thúc không đổi cấu hình AI.

## Kiểm tra trên máy

1. Khởi động lại backend và frontend. Với launcher: dừng bằng `DUNG_QUT.bat`, chạy lại `CHAY_QUT.bat`, rồi Ctrl+F5 trình duyệt.
2. Tài khoản → chọn sinh viên → sửa: chọn khoa, kiểm tra chỉ có 5 lớp phù hợp; lưu, mở lại để xác nhận lớp giữ đúng.
3. Phòng thi & lớp → thêm phòng: chỉ nhập tên/sức chứa/trạng thái; lưu và kiểm tra mã được cấp.
4. Tạo ca thi → tạo và xem trước nhóm; xác nhận, xem mã ca và số nhóm có đề. Gán giảng viên/đề, mở xem câu hỏi.
5. Dùng hai ca cùng đề: tắt AI ở một ca, kiểm tra ca kia giữ nguyên. Trong lượt thi thử, theo dõi camera/micro dừng rồi mở lại khi bật AI; bài thi vẫn trả lời/nộp được.

Đã kiểm tra mã bằng build frontend, các test frontend, test backend có PostgreSQL riêng và giao diện dùng dữ liệu tổng hợp. Camera/AI thật, đăng nhập Keycloak và toàn bộ luồng thi trên dịch vụ đang chạy cần kiểm tra thực tế sau khi khởi động lại.

Bốn trang Phòng thi, Lớp hành chính, Tạo ca thi và Danh sách ca thi nằm trong nhóm Phòng thi & lớp ở sidebar admin. Mỗi trang mở nội dung riêng, không còn thanh tab ngang.

Hướng dẫn luồng hiện hành, công bố cả ca, mã phòng ngắn và kiểm chứng: [ADMIN_EXAM_WORKFLOW.md](ADMIN_EXAM_WORKFLOW.md).
