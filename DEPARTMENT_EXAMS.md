> Cập nhật 18/10/2026: xem [ADMIN_EXAM_WORKFLOW.md](ADMIN_EXAM_WORKFLOW.md) cho luồng hiện hành. Danh sách hiển thị cả ca chưa công bố; giao diện công bố toàn ca sau khi đủ phân công. Các kết quả kiểm thử và trạng thái triển khai ở dưới là ghi nhận của đợt triển khai ban đầu.

# Một ca thi, nhiều nhóm cùng giờ, chia theo khoa

Đây là luồng hiện tại cho admin và sinh viên. Không cần gán sinh viên vào học phần, không có đăng ký môn. Ca chung xác định môn, khoa, đợt thi và thời gian; từng nhóm có danh sách sinh viên, phòng, giảng viên và đề riêng.

## Cập nhật database

Giữ các migration đã chạy. Sau 009, 010, 011, chạy **012_course_exam_allocation.sql** nếu chưa chạy, rồi **013_department_exam_sittings.sql** trong Supabase SQL Editor. Dán nguyên file, giữ khối hàm `$$`.

Bản 012 hiện tại đã rút gọn: chỉ tạo đợt thi, thêm sức chứa phòng, liên kết ca với đợt thi và index lịch phòng. Không tạo `course_students`, `exam_allocation_batches`, `exam_student_allocations` hoặc `allocation_batch_id`. Backend đã bỏ phụ thuộc vào các cấu trúc này; API gán môn/chia ca nối tiếp cũ trả 410, còn API tạo đợt thi vẫn dùng được.

Nếu chưa chạy 012: dùng nguyên file 012 hiện tại rồi chạy 013. Nếu đã chạy bản 012 cũ: chạy lại bản rút gọn không xóa các bảng/dữ liệu cũ; không tự DROP dữ liệu đang dùng. Code mới vẫn đối chiếu lịch và đăng ký thi cũ qua `exam_sessions` / `exam_session_students` để tránh xếp trùng.

013 bổ sung:

- `exam_sittings`: ca chung, môn, khoa, đợt, giờ bắt đầu/kết thúc, số người mỗi nhóm và mã yêu cầu chống tạo trùng.
- `exam_sitting_groups`: nhóm 1, 2, 3… thuộc ca; phòng, giảng viên, đề có thể để trống để bổ sung sau. Sau khi công bố, nhóm liên kết với `exam_sessions` để dùng pipeline thi/AI hiện có.
- `exam_sitting_students`: danh sách chốt và thứ tự sinh viên trong từng nhóm; chặn trùng sinh viên theo môn + đợt thi và giữ lịch sử khi hủy.

Các bảng mới bật RLS. Chỉ backend quản trị truy cập; không mở policy public và không dùng khóa Storage ở frontend.

## Admin sử dụng

1. Khởi động lại backend/frontend sau khi cập nhật database.
2. Vào Tổ chức thi / Ca thi → tab **Ca thi theo khoa** → **Tạo ca thi theo khoa**.
3. Chọn đợt thi (hoặc tạo đợt mới), môn thi, khoa, tên ca, giờ bắt đầu/kết thúc chung và tối đa sinh viên mỗi nhóm/phòng.
4. Hệ thống lấy tài khoản sinh viên đang hoạt động có khoa khớp khoa đã chọn, bỏ người đã xếp môn/đợt này, sắp theo tên tiếng Việt → họ/tên đệm → mã sinh viên → ID. Sinh viên thiếu khoa không được tự gán vào một khoa; bổ sung hồ sơ trước nếu cần.
5. Xem trước: 100 sinh viên, 30 người/nhóm → 4 nhóm **30–30–30–10**, tất cả cùng giờ. Không có khoảng nghỉ hoặc tự đẩy giờ nhóm sau.
6. Xác nhận tạo một ca gồm các nhóm; các nhóm ở trạng thái chờ bổ sung phòng, giảng viên, đề. Giữ chỗ sinh viên ngay khi tạo, không bắt buộc phân công ngay.
7. Mở **Danh sách & phân công**. Mỗi nhóm có danh sách xem lại, nút gán phòng / giảng viên / đề, công bố, hủy và xem diễn biến sau khi công bố. Có thể lưu phân công còn thiếu và quay lại bổ sung sau.
8. Chọn phòng đủ sức chứa; một phòng hoặc một giảng viên không được phụ trách hai nhóm cùng giờ. Chọn đề đúng môn do giảng viên được phân công tạo (đề cũ không có tác giả dùng chủ học phần). Thời lượng làm bài của đề không được dài hơn cửa sổ ca.
9. Công bố từng nhóm khi đủ thông tin, trước giờ bắt đầu. Giao diện giảng viên được giữ nguyên trong phạm vi lần này: admin chọn đề được tạo qua phân hệ hiện có, không có màn hình tác nghiệp mới cho giảng viên.

Không tạo đề hoặc phòng giả để lấp chỗ trống. Không tự tạo tài khoản/đề hoặc đổi khoa của sinh viên. Không tự phân công giảng viên. Nhóm chưa hoàn thiện không xuất hiện cho sinh viên và không tạo phiên giám sát AI.

## Sinh viên và giám sát

- Sinh viên đăng nhập như hiện tại bằng mã sinh viên. Chỉ nhìn thấy nhóm của mình khi nhóm đã công bố và tới giờ; không thấy danh sách toàn khoa hay các nhóm khác.
- Trong Kỳ thi của tôi có tên ca/nhóm, môn, phòng và thời gian. Tiếp tục dùng lưu đáp án, nộp bài, lịch sử, avatar và AI nền hiện có.
- Admin mở diễn biến/lượt thi từ nhóm đã công bố, hoặc xem Giám sát ca thi hiện có. Mỗi dòng nhóm đã công bố giữ chỉ số dự thi, đang làm, đã nộp và cảnh báo, dùng đúng giảng viên phân công theo nhóm.
- Một môn trong đợt khác vẫn có thể phân lại, nhưng kiểm tra trùng giờ sinh viên vẫn áp dụng. Đổi khoa sau khi chia không tự chuyển danh sách đã chốt.
- Hủy nhóm giữ lịch sử; chỉ sinh viên chưa có bài làm được trả về danh sách chưa xếp. Nhóm có bài đang làm không cho hủy. Muốn đổi lịch chung đã chốt, hủy các nhóm hợp lệ và tạo ca mới thay vì sửa SQL thủ công.

## Kiểm thử và giới hạn bàn giao

Đã build frontend, kiểm tra ESLint, test frontend và PostgreSQL tạm độc lập. Kiểm thử ghi dữ liệu thật trên PostgreSQL tạm gồm: 100 người thành 4 nhóm cùng giờ không cần enrollment; retry đồng thời chỉ tạo một ca; chặn nhóm thiếu thông tin; gán phòng/giảng viên sau; chặn trùng phòng/giảng viên; kiểm tra quyền; hủy và trả chỗ; sinh viên đúng nhóm vào được khi tới giờ, sinh viên nhóm khác/ngoài khoa không vào được.

Kết quả chốt: build frontend đạt (còn cảnh báo kích thước bundle), ESLint component mới và component tổ chức thi không có lỗi; 25 test frontend đạt; Sau khi rút gọn SQL 012 và bỏ test của chức năng enrollment/chia ca nối tiếp cũ, 126 test backend đạt, gồm 17 test PostgreSQL tạm. Test PostgreSQL mới kiểm tra 012 rút gọn chạy lại được, không tạo bảng/cột dư, giữ hồ sơ sinh viên, đồng thời luồng chia nhóm của 013 vẫn hoạt động. JVM test trên Windows dùng `-Djdk.net.unixdomain.tmpdir=<workspace>/.qut-run` để tránh lỗi socket ở thư mục temp của máy này.

Browser dùng fixture **tests/department.html** với 100 hồ sơ tổng hợp trong bộ nhớ, không gọi Supabase/Keycloak/AI. Không dùng fixture làm dữ liệu thật. Kiểm thử browser và kiểm thử database là hai kiểm tra độc lập.

Chưa áp dụng migration 013 lên Supabase thật hoặc kiểm thử trọn luồng với tài khoản người dùng thật. BackendApplicationTests.contextLoads phụ thuộc cấu hình database thật, không nằm trong lượt test tách biệt này. Sau migration cần đăng nhập admin, tạo một ca thử, phân công và đăng nhập sinh viên đúng/ngoài nhóm để đối chiếu. Không khẳng định sức chịu tải AI cho 100 camera từ các test chia nhóm này.

## File thay đổi

- Thêm `database/migrations/013_department_exam_sittings.sql`.
- Thêm `DepartmentExamService.java` và `DepartmentExamController.java` trong backend.
- Cập nhật `ExamOrganizationService.java`: nhận diện roster nhóm, bảo vệ phòng chờ phân công, công bố đúng danh sách và hiển thị giảng viên theo nhóm.
- Rút gọn `CourseAllocationService.java` còn tạo đợt thi và helper sắp xếp/băm; `CourseAllocationController.java` ngừng API gán môn và chia ca nối tiếp. Không còn phụ thuộc bảng enrollment/batch cũ. Giữ các ca cũ và đối chiếu qua bảng ca/danh sách dự thi chung.
- Cập nhật `AdminCatalogExceptionHandler.java` để API mới trả lỗi dữ liệu rõ ràng.
- Thêm `DepartmentExamPanel.tsx`; `CourseAllocation.tsx` chuyển sang xuất panel mới; cập nhật `ExamOrganization.tsx`, `organization.css` để thay mục gán môn bằng Ca thi theo khoa.
- Thêm HTTP security test, mở rộng PostgreSQL test, cập nhật test render và fixture giao diện theo mô hình mới. Giao diện giảng viên và model AI không sửa trong lần này.
- Bản dự phòng trước sửa nằm trong `.qut-run/department-sittings-before` (Git bỏ qua).
