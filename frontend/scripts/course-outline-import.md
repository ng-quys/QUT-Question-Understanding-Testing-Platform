# Import đề cương một lần

Đã đối chiếu PDF `ĐỀ CƯƠNG HỌC PHẦN THỨ 52(ATTT).pdf`, trang 1–6. Dữ liệu trong `network-administration-outline.json`: Quản trị hệ thống mạng, mã `0101101973`, 3 tín chỉ; 8 chương, 59 chủ đề, 7 CLO. Chưa chạy import. Có thể tái trích xuất bằng `extract-network-outline.py` với Python có pdfplumber.

Số chủ đề từng chương: 6, 8, 8, 6, 6, 9, 9, 7. Giữ dấu `*` của các mã CLO đúng PDF; giữ cách viết `xí nghiêp` và mã mục `6. 3` theo nguồn. Mô tả CLO3.2 được nối đầy đủ từ trang 2 sang trang 3. Xuống dòng do dàn trang được nối bằng khoảng trắng. Bảng 6.1 ở trang 3–4 nêu cả 7 CLO đáp ứng cho từng chương; API nội dung hiện không có endpoint lưu ánh xạ chương–CLO. Không suy ra ánh xạ chủ đề–CLO.

Script chạy trong tab ExamFlow Vite đang đăng nhập, dùng chính `apiFetch` của app (bao gồm refresh phiên), không sao chép JWT hay nhập user ID. Không được chạy đồng thời hai phiên import hoặc đổi tài khoản trong lúc import.

Chuẩn bị JSON sau khi đối chiếu từng trang PDF:

```json
{
  "source": "Tên PDF và các trang nguồn đã đối chiếu",
  "course": {"code": "Mã nguyên bản", "name": "Tên nguyên bản", "credits": 3},
  "chapters": [{"code": "Mã chương nguyên bản", "name": "Tên chương nguyên bản", "topics": [{"code": "Mã mục nguyên bản", "name": "Tên chủ đề nguyên bản"}]}],
  "clos": [{"code": "CLO1", "description": "Mô tả đầy đủ nguyên bản"}]
}
```

Đây chỉ là minh họa cấu trúc, không phải dữ liệu đề cương. Script yêu cầu đủ 8 chương, 59 chủ đề, 7 CLO; mã phải duy nhất trong phạm vi tương ứng. Nếu PDF không có mã chương/chủ đề, cần thống nhất cách biểu diễn trước, không tự sáng tác. Không có trường ánh xạ chủ đề–CLO vì API hiện tại không hỗ trợ quan hệ này. CLO tạo mới dùng mặc định BE (`remember`, `active`); đây là mặc định hệ thống, không phải phân loại suy ra từ PDF. CLO cập nhật giữ các thiết lập hiện có.

Trong console của tab ExamFlow dev đang đăng nhập:

```js
const {apiFetch} = await import('/src/services/api.ts');
const {prepareImport} = await import('/scripts/course-outline-import.mjs');
const outline = await fetch('/scripts/network-administration-outline.json').then(r => r.json());
const pending = await prepareImport(apiFetch, outline, {mode:'supplement'});
console.log(pending.preview);
```

`supplement`: thêm phần thiếu, bỏ qua bản ghi giống hệt; dừng nếu có khác biệt.
`update`: cập nhật tên/mô tả theo mã, giữ bản ghi ngoài PDF, không xóa dữ liệu.
Trùng tên khác mã hoặc nhiều bản ghi cùng mã: dừng để đối chiếu. Metadata học phần khác PDF: dừng vì teacher API không có endpoint cập nhật. Mã học phần được BE chuẩn hóa thành chữ hoa; cần kiểm tra mã PDF tương thích trước import. Quyền ghi nội dung yêu cầu chủ sở hữu; học phần chỉ được phân công có thể đọc nhưng BE sẽ từ chối ghi, script dừng và báo lỗi.

Chỉ sau khi người dùng xác nhận preview, gọi riêng:

```js
const report = await pending.apply(`IMPORT ${outline.course.code}`);
```

Không có auto-apply. Trước khi ghi, script đọc lại để phát hiện dữ liệu thay đổi sau preview. Sau ghi, GET courses/structure/clos đối chiếu từng nội dung và quan hệ ID. Báo cáo created/updated/skipped/errors là tổng số bản ghi, không gồm GET. Lỗi ghi dừng ngay; không xóa/rollback. Nếu mạng lỗi sau POST, prepare lại sẽ đọc dữ liệu hiện có trước khi lập kế hoạch mới; không tự retry POST. Tính chống trùng dựa trên mã và kiểm tra lại API, không bảo đảm giao dịch nguyên tử giữa nhiều client vì BE không cung cấp bulk transaction/idempotency cho các endpoint này.

API dùng: GET/POST `/teacher/courses`; GET `/:id/structure`; POST/PUT `/:id/chapters[/:chapterId]`; POST/PUT `/:id/chapters/:chapterId/topics[/:topicId]`; GET/POST/PUT `/:id/clos[/:cloId]`; GET `/auth/me`. Tất cả qua API base của app. Không SQL, migration hoặc sửa API.
