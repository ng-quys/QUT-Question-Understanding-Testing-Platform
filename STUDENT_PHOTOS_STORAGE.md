# Ảnh hồ sơ sinh viên trên Supabase Storage

Ảnh mới được lưu trong bucket PRIVATE `student-photos`. Backend Java kiểm tra danh tính Keycloak, xử lý ảnh, upload và lưu vị trí vào `users.photo_bucket` / `users.photo_key`. Frontend tiếp tục dùng API ảnh có xác thực; không nhận khóa server và không phụ thuộc file local.

## Cấu hình và migration

Trong `.env.storage` ở thư mục gốc, giữ URL và khóa server đang dùng cho bằng chứng. Có thể thêm:

```env
SUPABASE_STUDENT_PHOTOS_BUCKET=student-photos
```

Đây cũng là tên mặc định nếu chưa thêm biến. Không thay `SUPABASE_STORAGE_BUCKET=exam-evidence`: bucket bằng chứng vẫn hoạt động riêng. Không cần gửi khóa vào chat. Không thêm `VITE_` cho khóa server.

Bucket `student-photos` phải PRIVATE, cho phép `image/jpeg`, giới hạn ít nhất 5 MB/file. Backend nhận ảnh tối đa 5 MB, tối đa 20 triệu điểm ảnh; chuyển về JPEG nền trắng, cạnh dài tối đa 1600 px. JPG/PNG được hỗ trợ bởi ImageIO mặc định; WebP chỉ dùng được nếu runtime có decoder tương ứng, nếu không sẽ báo lỗi rõ và giữ nguyên ảnh cũ.

Migration: `database/migrations/008_student_photos_storage.sql`. Chỉ thêm hai cột nullable vào `public.users`, chạy lặp được, không upload ảnh cũ hay xóa dữ liệu. Cần áp dụng trước khi khởi động backend mới vì dự án dùng `ddl-auto=validate`.

Trong phiên triển khai này, migration 008 đã được áp dụng thành công vào database lấy từ cấu hình backend trên máy; xác nhận có đủ hai cột kiểu `character varying`. Máy/môi trường khác dùng cùng database không cần áp dụng lại. Nếu dùng database khác, chạy nội dung file migration trong SQL Editor của đúng dự án trước.

## Luồng hoạt động

1. Sinh viên chọn ảnh. `POST /api/student/profile/photo` nhận multipart qua token Keycloak; ID sinh viên do backend tự xác định qua `CurrentUserService` dùng chung với các API sinh viên, không nhận ID tùy ý từ frontend. Resolver hiện có tìm theo `keycloak_user_id` rồi fallback email trong token cho tài khoản cũ/xã hội; API ảnh không tự tạo thêm một cơ chế liên kết khác. Tài khoản phải hoạt động và có vai trò sinh viên. Việc xác minh/liên kết email là trách nhiệm luồng xác thực chung của dự án, không được nâng thành một yêu cầu mới riêng trong API ảnh.
2. Backend khóa bản ghi tài khoản và từ chối thay ảnh nếu có lượt thi `in_progress`.
3. Backend xác thực file thật, giới hạn kích thước, chuyển JPEG rồi upload với object key `student-<id>/<uuid>.jpg`. Mỗi lần đổi ảnh dùng UUID mới, không ghi đè ảnh cũ trước khi database cập nhật xong.
4. Backend lưu bucket/key, flush database. Sau commit mới xóa object cũ do lần upload trước quản lý. Nếu rollback, thử xóa object mới; ảnh cũ và bản local cũ vẫn còn. Cleanup lỗi chỉ ghi student ID/object key để xử lý thủ công, không làm mất kết quả cập nhật. Kết quả giao dịch chưa xác định thì giữ object mới để đối chiếu.
5. `GET /api/student/profile` xác định có ảnh từ metadata. `GET /api/student/profile/photo` kiểm tra đúng chủ tài khoản rồi backend tải ảnh private từ Storage và trả JPEG với `Cache-Control: no-store`, `X-Content-Type-Options: nosniff`. FE tạo blob URL tạm để hiển thị như trước; đây là proxy ảnh có xác thực, không phải signed URL bằng chứng 180 giây.
6. Trước khi khởi chạy AI, Java lấy ảnh tham chiếu hiện tại, gửi `referencePhotoBase64` qua API nội bộ `/session/start` có secret. Base64 chỉ dùng trong request này, không lưu database/log. Python kiểm tra giới hạn và JPEG, ghi cache nguyên tử vào `<PROFILE_DIR>/<studentId>.jpg`, rồi dùng file đó cho nhận diện. Python không cần biết khóa Storage ảnh hồ sơ hoặc truy cập đường dẫn ổ đĩa của máy backend.

Storage mất kết nối: cập nhật báo lỗi, không âm thầm chuyển ảnh mới về local; ảnh cũ trong database vẫn được giữ. Nếu không lấy được ảnh cloud lúc bắt đầu phiên AI, hệ thống báo lỗi trước khi khởi chạy camera; không dùng lại ảnh cache cũ để bỏ qua lỗi. Phiên AI đã chạy tiếp tục dùng ảnh tham chiếu local của phiên đó.

## Ảnh local cũ và sử dụng trên máy khác

- Chưa có metadata cloud: vẫn đọc ảnh local cũ `<id>.jpg` nếu file còn trên máy, không tự tải ảnh cá nhân lên hàng loạt.
- Sinh viên đang dùng ảnh local cần vào **Hồ sơ của tôi → Thay đổi ảnh** một lần để lưu cloud. Sau khi có cloud metadata, các lần đăng nhập sau không cần upload lại.
- Máy khác cần chạy mã mới, trỏ cùng database/Storage và cùng hệ thống danh tính Keycloak hoặc tài khoản đã được đồng bộ liên kết đúng. `.env.storage` là cấu hình server riêng trên mỗi máy, không đưa vào Git/frontend.
- Cache Python và ảnh local cũ không tự bị xóa. Có thể dọn cache theo chính sách vận hành sau khi đối chiếu; không xóa khi đang có phiên giám sát.
- Ảnh tham chiếu không được đổi khi còn lượt thi `in_progress`. Nếu có lượt thi bỏ dở, xử lý trạng thái lượt thi qua luồng hợp lệ trước; không sửa trực tiếp trạng thái để vượt kiểm tra ảnh.

## Kiểm thử đã thực hiện

- Build frontend: đạt (cảnh báo bundle lớn có từ trước).
- 46 kiểm thử Java về xử lý ảnh, danh tính/quyền API, chặn đổi ảnh khi thi, upload lỗi, DB rollback, thứ tự xóa object cũ, đọc cloud trên máy không có file, truyền ảnh Java → Python và hồi quy bằng chứng: đạt.
- Toàn bộ 74 kiểm thử Python: đạt, gồm 19 kiểm thử runtime và 4 kiểm thử cache ảnh tham chiếu; kiểm tra không khởi chạy worker khi payload ảnh lỗi.
- `python scripts/test_student_photos_postgres.py`: đạt trên PostgreSQL Docker tạm, migration áp dụng hai lần và giữ bản ghi/metadata đã có.
- `python scripts/test_supabase_student_photos.py`: đạt với bucket thật; JPEG tổng hợp upload/download khớp byte, bucket PRIVATE, truy cập public bị chặn, đã xóa đúng object thử. Không dùng ảnh cá nhân, không tạo tài khoản hay sửa bản ghi sinh viên để kiểm thử.
- Lỗi Java `Unable to establish loopback connection` trên Windows đã xử lý bằng `jdk.net.unixdomain.tmpdir` trỏ thư mục `.qut-run` chuẩn hóa trong launcher. Ba kiểm thử `StudentAdminCompatibilityTests` đã chạy đạt khi dùng cấu hình socket này. Backend thật đã khởi động lại và trả HTTP 200 ở `/api/health`; AI ở trạng thái idle. Đây không phải kiểm thử camera thật.
- Chưa kiểm thử trọn luồng qua đăng nhập sinh viên thật trên hai máy và camera thật. Cần khởi động lại backend/AI bằng mã mới rồi thực hiện các bước bên dưới.

## Tự kiểm tra trọn luồng

1. Kết thúc các phiên thi đang hoạt động, dừng và chạy lại hệ thống bằng launcher để backend/Python nạp mã mới. Không cần tạo lại bucket hay thay khóa đã cấu hình đúng. Tải lại FE bằng Ctrl+F5.
2. Đăng nhập sinh viên → Hồ sơ của tôi → tải JPG/PNG dưới 5 MB. Ảnh xuất hiện; Storage có object `student-<id>/<uuid>.jpg` trong `student-photos`.
3. Đăng xuất/đăng nhập lại: ảnh vẫn còn. Chạy cùng cấu hình trên máy khác, đăng nhập cùng tài khoản: ảnh vẫn hiện, không cần chép thư mục local.
4. Đổi ảnh: ảnh mới hiển thị; object cũ được xóa sau commit nếu cleanup thành công. File local cũ không bị xóa tự động.
5. Vào ca thi có AI bằng tài khoản đó; kiểm tra nhận diện từ ảnh tham chiếu mới. Trong lúc làm bài, API đổi ảnh phải trả 409.
6. Đăng nhập tài khoản sinh viên khác: không nhận ảnh của tài khoản trước. API không chấp nhận việc chọn chủ ảnh bằng query `studentId` hoặc object key tùy ý.
7. Khi cần thử kết nối Storage độc lập, chạy `python scripts/test_supabase_student_photos.py` với Python có Pillow. Script đọc khóa từ cấu hình local và chỉ tạo/xóa ảnh tổng hợp riêng, không sửa database.

## File thay đổi cho tính năng này

- Backend: `SupabaseStudentPhotoStorage.java`, `StudentProfileService.java`, `StudentProfileController.java`, `AntiCheatService.java`, `UserEntity.java`, `UserRepository.java`, `ExamAttemptRepository.java`, `GlobalExceptionHandler.java`, `application.properties`.
- Python: `app/reference_photo.py`, `app/run_service.py`.
- Frontend: `StudentWorkspace.tsx` hiển thị thông báo lỗi upload cụ thể từ backend; API/binary loader hiện có được giữ tương thích.
- Cấu hình/schema: `.env.storage.example`, migration `008_student_photos_storage.sql`.
- Kiểm thử: `StudentProfilePhotoTests.java`, `StudentPhotoHttpSecurityTests.java`, `SupabaseStudentPhotoStorageTests.java`, `AntiCheatPhotoHandoffTests.java`, `test_reference_photo.py`, bổ sung `test_runtime_service.py`, hai script kiểm tra trong `scripts/`.

Tham khảo API chính thức: [Supabase private downloads](https://supabase.com/docs/guides/storage/serving/downloads), [Storage REST reference](https://supabase.com/docs/reference/self-hosting-storage/get-details-of-a-bucket).

## Khi đổi ảnh mà không thấy object trong Storage

Nếu frontend đổi ảnh thành công nhưng bucket vẫn trống, kiểm tra backend đã được restart sau thay đổi Java hay chưa. Launcher tái sử dụng backend đang chạy; tải lại React hoặc chạy lại launcher mà không dừng backend không nạp mã Java mới. Trong lần kiểm tra ngày 16/10, tiến trình backend cũ từ 02:03 vẫn dùng luồng local. Đã khởi động lại đúng backend/AI do launcher quản lý, giữ frontend và Keycloak; lần đổi ảnh tiếp theo mới đi theo luồng cloud. Ảnh local cũ không được upload tự động.

Lỗi “Tài khoản chưa liên kết đúng danh tính đăng nhập” ở bản tích hợp đầu do API ảnh tự kiểm tra subject/email thêm sau khi `CurrentUserService` đã xác định tài khoản theo luồng hiện có. Đã bỏ bước kiểm tra trùng này và dùng chung resolver, giữ kiểm tra token, vai trò, trạng thái và chủ ảnh do backend chọn. Kiểm thử HTTP dùng `CurrentUserService` thật với repository giả để kiểm tra cả đọc và upload của tài khoản cũ, từ chối danh tính không có tài khoản, tài khoản khóa, vai trò sai và không cho query studentId chọn người khác.
