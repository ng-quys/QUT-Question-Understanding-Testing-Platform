# Nhập cấu trúc học phần từ đề cương

Bộ đọc theo quy tắc, chạy cục bộ từ Backend. Không gọi AI Service, Ollama, Qwen,
OpenAI, AI Credits hoặc Anti-Cheating. Không cần API key, migration hay thay đổi DB.

## Chuẩn bị một lần

Tại thư mục gốc dự án, dùng Python 3.11 trở lên:

```powershell
python -m venv scripts/course-outline/.venv
.\scripts\course-outline\.venv\Scripts\python.exe -m pip install -r scripts/course-outline/requirements.txt
```

Backend tự tìm venv cạnh `extract.py` (Windows: `.venv/Scripts/python.exe`,
Linux/macOS: `.venv/bin/python`). Tài khoản chạy Backend phải có quyền đọc script,
chạy Python và tạo/xóa file tạm. Venv không được đưa vào Git.

Mặc định Backend khởi động từ thư mục `backend`, giống các launcher hiện có.
Nếu dùng working directory khác, đặt đường dẫn tuyệt đối bằng biến môi trường:

```powershell
$env:COURSE_OUTLINE_SCRIPT = 'D:\duong-dan\ExamFlow\scripts\course-outline\extract.py'
$env:COURSE_OUTLINE_PYTHON = 'D:\duong-dan\ExamFlow\scripts\course-outline\.venv\Scripts\python.exe'
```

Không ghi hai biến vào DB. Với launcher `start-examflow.ps1`, có thể thêm chúng vào
`Environment` của file cấu hình local đang có, giữ nguyên mọi cấu hình worker hiện tại.
Biên dịch/nạp Backend mới theo quy trình restart an toàn của dự án; không dừng job AI
hoặc phiên thi đang chạy. Tính năng không tự restart bất kỳ dịch vụ nào.

## Sử dụng

1. Đăng nhập giảng viên → **Quản lý học phần → Thêm học phần mới → Tải đề cương**.
2. Chọn một PDF có thể chọn chữ hoặc DOCX, tối đa 20 MB. PDF tối đa 80 trang.
3. Xem đầy đủ tên/mã học phần, tín chỉ, các chương/chủ đề và mô tả CLO. Sửa, thêm
   thủ công hoặc loại bỏ từng mục. Loại chương cũng loại các chủ đề trong bản nháp đó.
4. Bấm **Kiểm tra dữ liệu trước khi lưu**. Thao tác này chỉ đọc DB.
5. Nếu mã đã thuộc tài khoản hiện tại và tên/tín chỉ khớp, xác nhận **chỉ bổ sung
   mục còn thiếu**. Mục trùng hoàn toàn được bỏ qua; khác tên/nội dung bị chặn để sửa
   preview. Học phần chỉ được phân công nhưng không sở hữu không được bổ sung.
6. Bấm **Xác nhận lưu cấu trúc học phần**, sau đó **Mở học phần đã nhập**.
   Bước cuối gọi API đọc lại học phần, cấu trúc và CLO.

Chỉ nút xác nhận mới ghi dữ liệu. Toàn bộ thao tác lưu dùng một transaction trên DB
chính, gọi lại `TeacherCourseService`/`TeacherCourseContentService`. Lỗi giữa chừng
rollback toàn bộ. Khóa PostgreSQL theo mã học phần tuần tự hóa các lượt import đồng
thời. Không tự gửi lại request xác nhận. Sau lỗi mạng không rõ kết quả, kiểm tra lại
preview; lần chạy lại bỏ qua các mục đã có, không tạo trùng.

Không cập nhật/xóa dữ liệu cũ. Không tự suy diễn chủ đề, CLO hay quan hệ CLO–chủ đề.
API CLO hiện có yêu cầu Bloom mặc định `remember`: đây là mặc định lưu trữ của hệ
thống, không phải Bloom được đọc/suy luận từ PDF. Có thể chỉnh trong quản lý CLO.

### Chủ đề nhiều cấp theo mã đánh số

Tất cả chủ đề vẫn là các dòng phẳng trong bảng/API hiện có, thuộc đúng chương:
`2.1`, `2.1.1`, `2.1.2`, `2.2`, `2.2.1`, `2.1.1.1`. Không thêm `parent_topic_id`,
không đổi schema. Preview và màn hình cấu trúc dựng cây từ **từng đoạn mã**:
cha trực tiếp của `2.1.1.1` là `2.1.1`; `2.10` không thuộc `2.1`.

Nút +/− mở rộng hoặc thu gọn nhánh. Sửa mã trong preview tính lại cây ngay, nhưng
không đổi mã các dòng con. Mã có khoảng trắng quanh dấu chấm vẫn được nhận diện;
mã và tên gốc không bị thay bằng số hay tên tự tạo. Các nhánh khác nhau có thể
dùng tên giống nhau; nhận diện trùng chủ đề bằng mã đầy đủ trong chương.

Thiếu cha, trùng mã, mã sai hoặc không khớp chương sẽ hiển thị cảnh báo và chặn
nhập cho đến khi sửa/loại bỏ. Cha trực tiếp phải xuất hiện trong bản preview để
người nhập kiểm tra rõ ràng; hệ thống không tự thêm cha từ nội dung suy đoán.
Khi loại một cha, preview hỏi xác nhận nếu có mã con liên quan, giữ nguyên các
con và yêu cầu xử lý cảnh báo trước khi lưu. Không tự xóa cả nhánh.

Dữ liệu cũ có mã tự do vẫn được hiển thị để quản lý; không bị đổi mã hoặc ghi lại.
Số câu hỏi và thao tác lọc giữ đúng ID chủ đề, không cộng/gán câu hỏi của cha cho con.

## Định dạng được nhận diện

- Nhãn `Tên học phần (tiếng Việt):`, `Tên học phần:`, `Mã học phần:`, `Số tín chỉ:`.
- Tiêu đề `Chương 1. ...`, chủ đề `1.1. ...` (cho phép khoảng trắng trong mã).
  Ưu tiên mục `Nội dung chi tiết` để không lấy nhầm bảng phân bố thời gian.
- CLO trong bảng có cột mã CLO/CĐR và cột mô tả, hoặc đoạn bắt đầu `CLO1.1*: ...`.
- Nối dòng mô tả, giữ thứ tự, dấu `*`, số 0 đầu mã học phần và nội dung nguồn.
  Bảng CLO tiếp tục qua trang được nối khi có cột mô tả và dòng tiếp nối không mã.
- PDF scan không có text bị từ chối; PDF có trang scan xen kẽ hiển thị cảnh báo.
  Không OCR. Tài liệu bố cục khác có thể cần điều chỉnh preview hoặc nhập thủ công.

Giới hạn xử lý: 2 bộ đọc đồng thời, timeout 40 giây, DOCX giải nén tối đa 50 MB,
100 chương/2000 chủ đề/200 CLO cho mỗi bản xác nhận. File tạm được xóa sau xử lý.

## API

Các route giữ nguyên JWT/role guard `/api/teacher/**`:

- `POST /api/teacher/courses/outline/extract`, multipart field **file**: đọc nháp,
  không ghi DB. Parser không được gửi tên file người dùng vào lệnh shell.
- `POST /api/teacher/courses/outline/preview`, body bản nháp: kiểm tra dữ liệu/trùng/quyền.
- `POST /api/teacher/courses/outline/confirm`, body `{outline, appendExisting}`:
  kiểm tra lại tại thời điểm ghi, trả số chương/chủ đề/CLO tạo và bỏ qua.

Mã 409 là xung đột/quyền sở hữu/missing confirmation; 422 là không đọc được tài liệu;
503 là bộ đọc Python chưa được cấu hình/cài. Không dùng trạng thái hay worker AI Credits.

## Kiểm thử không Production

```powershell
.\scripts\course-outline\.venv\Scripts\python.exe -m unittest discover -s scripts/course-outline -p test_extract.py -v
cd backend
.\mvnw.cmd '-Dtest=CourseOutlineImportTest,CourseOutlineExtractionTest' test
```

Test PDF mẫu đối chiếu **từng nội dung** với fixture đã duyệt trong
`frontend/scripts/network-administration-outline.json`: 8 chương, 59 chủ đề, 7 CLO.
Nếu checkout không kèm PDF mẫu, test đó báo skip, không giả lập kết quả thành công.

`CourseOutlinePostgresTest` chỉ chạy với `OUTLINE_PG_FIXTURE=true`, hardcode loopback
`127.0.0.1:55439/examflow_worker_test`, schema riêng `outline_import_fixture`.
Không lấy cấu hình môi trường Production. Test tạo bảng fixture, kiểm tra transaction
JPA + JDBC dùng chung datasource, rollback, ownership, rerun và concurrency.

Kiểm tra UI bằng Playwright + Edge trên Vite fixture riêng (mọi API được mock):

```powershell
# Terminal 1, tại gốc dự án
npm run dev --workspace frontend -- --host 127.0.0.1 --port 5175 --strictPort
# Terminal 2, cần module playwright được cài trong môi trường test
node frontend/tests/course-outline.browser.mjs
```

Nếu dùng Playwright từ runtime khác, đặt `PLAYWRIGHT_MODULE` là module name hoặc
`file:///.../playwright/index.mjs`. Không dùng cổng Production cho fixture này.
Test chụp ảnh 1440/768/390px dưới `tmp/outline-ui`, kiểm tra đủ mục, sửa/loại bỏ,
xung đột và chỉ một lần POST confirm sau khi người dùng xác nhận.

## File chức năng

- `scripts/course-outline/extract.py`, `requirements.txt`: parser và dependencies riêng.
- `backend/src/main/java/com/examflow/backend/dto/CourseOutline.java`: hợp đồng draft/plan.
- `backend/src/main/java/com/examflow/backend/controller/CourseOutlineController.java`: 3 API.
- `backend/src/main/java/com/examflow/backend/service/CourseOutlineExtractionService.java`: chạy parser giới hạn tài nguyên.
- `backend/src/main/java/com/examflow/backend/service/CourseOutlineImportService.java`: preview, quyền sở hữu và lưu nguyên tử.
- `frontend/src/features/courses/pages/CourseListPage.tsx`: lựa chọn nhập thủ công/tải đề cương.
- `frontend/src/features/courses/components/CourseOutlineImport.tsx`: preview chỉnh sửa và xác nhận.
- `frontend/src/features/courses/services/courseOutlineService.ts`: client API.
- `frontend/src/features/courses/services/topicHierarchy.ts`: phân tích mã và dựng cây.
- `frontend/src/features/courses/components/TopicCodeTree.tsx`: cây có mở rộng/thu gọn.
- `frontend/src/features/courses/components/CourseContentStructureTab.tsx`: hiển thị cây cho cấu trúc đã có, giữ API/thao tác quản lý hiện tại.
- `scripts/course-outline/test_extract.py`: test parser và PDF mẫu.
- `backend/src/test/java/com/examflow/backend/service/CourseOutline{Import,Extraction,Postgres}Test.java`: test service và fixture PostgreSQL.
- `frontend/tests/course-outline{.html,-fixture.tsx,.browser.mjs}`: UI fixture/test không Production.
- `frontend/tests/topic-hierarchy.test.mjs`: test các đoạn mã, thiếu cha, trùng, chỉnh mã và xóa cha.
