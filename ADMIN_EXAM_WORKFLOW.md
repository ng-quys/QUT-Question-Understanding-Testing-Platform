> Phạm vi chốt 19/10/2026: chỉ sửa phía admin. Phần giao diện/API giảng viên thêm ở lượt trước đã được gỡ; giảng viên dùng lại trang ca thi cũ. Admin không chọn đề, chỉ đọc liên kết đề đã có trong exam_sitting_groups.exam_id. Luồng gắn đề bên giảng viên cần được phần triển khai giảng viên cung cấp, không được giả lập bằng việc tự chọn đề phía admin.

# Quản lý ca thi admin — cập nhật 18/10/2026

## Luồng sử dụng

1. Phòng thi & lớp → Phòng thi: nhập tên, sức chứa, trạng thái. Backend tự cấp mã P001, P002… theo ID; ID trên 999 không bị cắt ngắn. Mã đã có không tự đổi khi sửa phòng.
2. Tạo ca thi: chọn đợt thi, môn, khoa, tên và thời gian; nhập số sinh viên mỗi phòng. Hệ thống lấy sinh viên thuộc khoa, sắp tên tiếng Việt và loại người đã được xếp cùng môn trong cùng đợt. Xem trước danh sách rồi lưu.
3. Sau lưu, chuyển tới Danh sách ca thi và mở chi tiết. Danh sách gồm cả ca đang chuẩn bị, chờ đề, sẵn sàng, đã công bố, đang thi và đã kết thúc; ca cũ vẫn xuất hiện, không nhân đôi các nhóm của ca mới.
4. Trong chi tiết, từng nhóm có thẻ riêng: phòng, giảng viên, đề, danh sách sinh viên và công tắc AI. Phân công đầy đủ rồi bấm Công bố ca thi ở đầu cửa sổ. Backend kiểm tra toàn bộ nhóm chưa hủy và công bố trong cùng giao dịch; thiếu thông tin không công bố dở dang.
5. Công bố xác nhận lịch và danh sách dự thi. Sinh viên vẫn phải thuộc nhóm, đến giờ và thỏa điều kiện của ca mới được vào thi.

## Chỉnh sửa đề

Xem / Quản lý đề mở câu hỏi, đáp án, đáp án đúng và điểm. Đề nháp chưa có ca/bài làm được chỉnh nội dung, thời lượng, tên, thêm/bớt câu hỏi và lưu. Mỗi câu phải có đúng một đáp án đúng; điểm tổng không vượt 100. Nội dung câu hỏi được tạo bản riêng để không sửa nhầm câu trong ngân hàng hay đề khác.

Đề đã sử dụng có nút Tạo bản chỉnh sửa: lưu thành đề nháp mới, giữ nguyên đề cũ và bài làm. Sau đó admin chọn mã đề mới trong phân công nhóm chưa công bố; hệ thống không tự thay đề của ca đã công bố. Phiên bản nội dung được đối chiếu khi lưu để tránh ghi đè chỉnh sửa mới hơn của người khác.

## SQL và khởi động

Chạy database/migrations/015_short_room_codes.sql trong SQL Editor của Supabase để đổi các mã PH-UUID cũ sang P001… File chỉ sửa mã, giữ nguyên ID và liên kết, kiểm tra trùng mã trước và chạy lại được. Mã tùy chỉnh được giữ nguyên. Database phải có các migration tổ chức thi 009–014 của phiên bản trước.

**015 chưa được áp dụng lên Supabase thật trong lần sửa này:** kết nối SQL lỗi SQLSTATE XX000 và API Storage/database REST trả HTTP 503. Không có mã phòng thật nào bị thay đổi bởi hai lần thử đó. Cơ chế cấp mã ngắn cho phòng mới đã nằm trong backend.

Khởi động lại backend và frontend để nhận API và giao diện mới. Với launcher đang dùng: chạy DUNG_QUT.bat rồi CHAY_QUT.bat; mở trình duyệt và Ctrl+F5.

## Kiểm chứng

- 135 test backend đạt, không lỗi, gồm kiểm thử PostgreSQL tạm: mã phòng, migration chạy lại, danh sách ca chưa công bố, lọc trạng thái, công bố cả ca, chặn thiếu phân công, bảo vệ ngân hàng câu hỏi và lịch sử đề, chống ghi đè nội dung.
- BackendApplicationTests.contextLoads phụ thuộc cấu hình dịch vụ thật được loại khỏi lượt chạy tách biệt này.
- Frontend build đạt; 27 test frontend đạt. Có cảnh báo kích thước bundle của Vite.
- Kiểm tra browser bằng tests/department.html với hồ sơ tổng hợp trong bộ nhớ: form tạo ca, danh sách ca chưa công bố, thẻ phân công, mã P001 và chỉnh/lưu câu hỏi. Đây không phải dữ liệu Supabase thật.
- Chưa xác nhận trọn luồng đăng nhập Keycloak → Supabase thật → sinh viên vào thi trong lượt sửa này do lỗi dịch vụ. Giao diện giảng viên và model AI không thay đổi trong đợt chỉnh admin này.

## Xóa phòng sau khi hủy ca

Admin được xóa phòng khi không còn thành viên trong mẫu phòng, tất cả nhóm/ca liên kết đã hủy và không có bài làm nào của các ca đó. Backend gỡ room_id của nhóm và ca đã hủy trong cùng giao dịch, giữ ca, danh sách dự thi và mã phòng đã chốt trong ca. Phòng có bài làm, kể cả bài đã nộp trong ca đã hủy, chỉ nên ngưng hoạt động để giữ lịch sử. Không cần SQL mới cho thay đổi này; khởi động lại backend và frontend để nhận xử lý/thông báo mới.

## Admin chỉ phân phòng và giảng viên

Form admin không có dropdown chọn đề; backend phân công từ chối examId khác NULL. Phân công cùng giảng viên giữ liên kết đề đã có; đổi giảng viên trước công bố gỡ liên kết đề cũ khỏi nhóm nhưng không xóa đề.

Admin hiển thị Chờ giảng viên thêm đề vào ca hoặc Đã có đề cùng tên đề và nút Xem / Quản lý đề. Chi tiết ca tự cập nhật mỗi 15 giây khi không chỉnh phân công/xác nhận thao tác. Việc tạo một đề đúng môn không tự tạo liên kết với nhóm; bên giảng viên cần ghi liên kết đúng nhóm để trạng thái admin đổi. Không bổ sung giao diện, API hay nghiệp vụ phía giảng viên trong phạm vi chốt này.

Đã gỡ TeacherAssignedExams và TeacherAssignedExamController của lượt sửa trước, khôi phục ExamSessionsPage về form ca thi cũ và lịch sử bằng chứng. Không cần SQL mới. Kiểm thử dùng liên kết đề giả lập trong PostgreSQL tạm để xác nhận phía admin giữ/gỡ liên kết đúng, không coi đó là luồng giảng viên thật.
