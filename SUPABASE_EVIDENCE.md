# Ảnh bằng chứng QUT / ExamFlow

Mã nguồn đã nối pipeline thật → Storage → sự kiện PostgreSQL → API phân quyền → giao diện admin/giảng viên. Chưa xác nhận trọn luồng với bucket thật vì máy chưa cấu hình khóa Storage trong `.env.storage`. Không cần gửi mật khẩu database hoặc khóa vào chat.

## 1. Cấu hình trên máy

Tại thư mục gốc dự án, sao chép **nếu chưa có**:

```powershell
Copy-Item .env.storage.example .env.storage
```

Mở `.env.storage` bằng trình soạn thảo trên máy và thay placeholder:

```dotenv
SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
SUPABASE_STORAGE_BUCKET=exam-evidence
SUPABASE_SECRET_KEY=YOUR_SERVER_SECRET_KEY
```

- Lấy URL và **server secret key** trong cấu hình API của đúng project Supabase. Khóa dạng `sb_secret_...` dùng được. Có thể dùng legacy `service_role` JWT qua `SUPABASE_SERVICE_ROLE_KEY` thay thế; khi đó bỏ dòng `SUPABASE_SECRET_KEY`.
- Không dùng publishable/anon key cho luồng server này. Không thêm khóa server vào `frontend/.env`, `VITE_*`, mã nguồn, đối số lệnh, ảnh chụp màn hình hoặc Git.
- File dùng `KEY=value`, không đặt dấu nháy quanh giá trị. Biến môi trường đã đặt bên ngoài được ưu tiên. Giữ cấu hình hai server giống nhau, tránh một biến môi trường cũ trỏ sang project khác.
- Backend tự đọc file ở root khi chạy từ root hoặc `backend/`. `anticheating/app/run_service.py` đọc cùng file. Khi triển khai nơi khác, cấp biến môi trường trực tiếp cho từng server.
- Khóa này phục vụ Storage; giữ cấu hình PostgreSQL và Keycloak đang có. Không cần thay mật khẩu database để dùng Storage.
- Bucket `exam-evidence` phải **PRIVATE**. Mã kiểm tra thuộc tính này trước upload/ký URL và từ chối bucket public; không tự đổi policies. Có thể giới hạn bucket 5 MB/file và MIME `image/jpeg`.
- Server key có quyền cao và bỏ qua RLS Storage. Quyền người xem do backend kiểm tra; không tạo policy đọc công khai. Nếu triển khai trên nhiều máy, chỉ đặt khóa ở backend và máy chạy dịch vụ AI đáng tin cậy.

`.env.storage`, ảnh local và outbox đã được bỏ qua bằng `.gitignore`; file mẫu chỉ chứa placeholder.

## 2. Migration

Đã đối chiếu metadata trực tiếp trên Supabase: bảng hiện tại có 11 cột, gồm `attempt_id`, `event`, `occurred_at`, `risk_score`, `risk_level`, `evidence_path`. Migration mới:

`database/migrations/007_supabase_evidence.sql`

Chạy nội dung file bằng SQL Editor của Supabase đúng project, sau khi bảng `anti_cheat_events` đã tồn tại (migration `004_anticheat_runtime.sql` của dự án). Migration 007 thêm:

| Cột | Mục đích |
| --- | --- |
| `event_uuid` | UUID tạo một lần lúc ghi nhận cảnh báo |
| `evidence_provider` | `local` cho dữ liệu cũ, `supabase` cho luồng mới |
| `evidence_bucket` | Bucket ảnh mới |
| `evidence_key` | `attempt-125/<eventUuid>.jpg` |
| `evidence_status` | `none`, `pending`, `uploaded`, `failed` |
| `evidence_error` | Mã lỗi đã loại bỏ thông tin bí mật |

Unique index `(attempt_id,event_uuid)` giúp callback trùng chỉ cập nhật cùng sự kiện. Callback pending/failed đến muộn không hạ trạng thái uploaded hoặc xóa object key đã lưu.

Migration chỉ bổ sung, chạy lặp được, không xóa bảng/dữ liệu, không upload ảnh cũ. Các hàng cũ mặc định provider local và giữ nguyên `evidence_path`. Bản local của sự kiện mới cũng được giữ trong `evidence_path` để đối chiếu; **khóa Storage duy nhất nằm ở `evidence_key`**, không dùng đường dẫn ổ đĩa thay object key. Không lưu Base64/signed URL vào database.

`EvidenceSchema` cũng có cơ chế bổ sung đúng các cột/index trên khi cần, theo giao dịch. Nên chạy migration trước, đặc biệt với tài khoản ứng dụng không được quyền ALTER TABLE. Không có Flyway tự chạy file SQL trong dự án hiện tại.

## 3. Cách hoạt động và khôi phục lỗi

Chọn upload ở **dịch vụ Python server** vì ảnh đã được tạo tại đó; không cần đưa ảnh qua trình duyệt hoặc gửi lại file sang Java. Backend Java giữ trách nhiệm liên kết dữ liệu, phân quyền và cấp link xem.

1. Chỉ khi một cảnh báo được kích hoạt theo cơ chế temporal hiện có, `EvidenceLogger` tạo UUID và chụp một JPEG, không upload mọi frame.
2. Pipeline ghi job vào `anticheating/runtime/evidence-outbox/<UUID>.json`. Vòng camera không gọi HTTP upload.
3. Một worker nền của **HTTP service lâu dài** thông báo sự kiện pending cho backend trước, upload Storage sau, rồi thông báo uploaded + bucket/key. Dừng worker của lượt thi không dừng dispatcher của HTTP service.
4. Worker xử lý tuần tự, nhận tối đa 64 job đến hạn mỗi lượt quét, không tạo thread cho từng ảnh. Đây là hàng chờ hoạt động có giới hạn; các job còn lại được giữ bền trên đĩa, không nạp toàn bộ vào RAM.
5. Mỗi HTTP request timeout 8 giây. Mỗi giai đoạn tối đa 4 lần thử, backoff 2/4/8 giây giữa các lần thử. Không retry tự động vô hạn. Lỗi kết nối Storage không đi vào vòng camera hoặc đường nộp bài.
6. Object key cố định theo UUID; upload dùng upsert cùng key. Nếu server chết sau khi Storage nhận ảnh nhưng trước khi lưu tiến độ, gửi lại vẫn dùng cùng object, cùng sự kiện.
7. Sau upload, job ghi bền stage `finalize` và bucket/key **trước** callback cập nhật database. Database lỗi thì chỉ gửi lại callback, không upload lại ảnh. Job hết lượt thử được giữ ở stage `dead`.
8. Upload thất bại được gửi về backend thành failed; job và ảnh local được giữ để gửi lại có chủ đích. Nếu backend mất kết nối, sự kiện được giữ ở outbox để đồng bộ sau khi khôi phục. Không thể ghi ngay vào một database đang mất kết nối.

Sau khi sửa cấu hình/mạng, gửi lại **một sự kiện mới bị lỗi** tại root:

```powershell
python anticheating/app/evidence_delivery.py --retry EVENT_UUID
```

Lấy UUID từ tên job trong outbox hoặc cột `event_uuid`. Lệnh chỉ mở lại job `dead` có sẵn, không quét thư mục ảnh cũ và không tải ảnh sinh viên hàng loạt. Job uploaded nhưng lỗi cập nhật database tiếp tục ở finalize. Job upload thất bại được thông báo pending và upload lại cùng key. Nếu không có ảnh local do chụp ảnh lỗi, không thể tự tạo lại hình ảnh của thời điểm đã qua.

Sau đó cần dịch vụ `app/run_service.py` đang chạy để xử lý job. Khởi động bằng launcher hiện có; khi đổi khóa phải khởi động lại cả backend và AI.

Không có tác vụ tự xóa ảnh local hoặc object. Cần theo dõi dung lượng thư mục evidence/outbox và xây dựng thời hạn lưu theo nhu cầu vận hành; nhật ký trên đĩa có thể tăng khi hệ thống lỗi lâu. Đừng xóa bản local/outbox khi chưa đối chiếu trạng thái database và Storage.

## 4. API và quyền xem

Các route cùng tồn tại dưới `/api/admin/evidence` và `/api/teacher/evidence`:

```text
GET /attempts/{attemptId}/events?page=0&size=20
GET /attempts/{attemptId}/events/{eventId}/link
GET /attempts/{attemptId}/events/{eventId}/local
GET /history?page=0&size=20&q=...&sessionId=...
```

Frontend chỉ gửi ID, không gửi bucket/object key để ký. Backend tra sự kiện bằng **cả attemptId và eventId**, sau khi kiểm tra người xem:

- Admin: realm role ADMIN và tài khoản admin hoạt động theo cơ chế quản trị hiện có.
- Giảng viên: realm role TEACHER, tài khoản active có role teacher/faculty, liên kết chính xác `users.keycloak_user_id = JWT.sub`, đồng thời `exam_attempts.exam_id → exams.course_id → courses.created_by = users.id`.
- Đây là quan hệ phụ trách môn đang tồn tại trong dự án. Chưa có bảng phân công nhiều giảng viên cho một học phần; giảng viên khác hoặc người chỉ tạo ca thi không mặc nhiên được quyền. Muốn mở rộng phải bổ sung quan hệ phân công thực tế.
- Sinh viên bị chặn kể cả biết attemptId/eventId/key. Giảng viên không gọi được route admin. Không liên kết giảng viên bằng email chưa xác minh.
- Local cũ chỉ đọc qua API phân quyền và resolver giới hạn trong đúng thư mục attempt. Không dùng local endpoint để vượt trạng thái ảnh Supabase. Nếu Java chạy máy khác, cần cấu hình/chia sẻ thư mục local cũ phù hợp; ảnh cloud mới không phụ thuộc ổ đĩa Java.

Link mới trả `{ url, expiresAt, provider: "supabase" }`, hạn 180 giây. Phản hồi thành công có `Cache-Control: no-store`. Không ghi link vào database hoặc log ứng dụng. Link có thể được dùng bởi người có link trong thời gian còn hiệu lực, nên không chia sẻ ra ngoài.

Local cũ trả `{ url: null, expiresAt: null, provider: "local" }`, FE lấy Blob qua `/local` có phân quyền. HTTP 409 khi pending/failed; 404 khi sai sự kiện/lượt thi hoặc ảnh không tồn tại; 403 khi ngoài phạm vi; 503 khi chưa cấu hình/bucket public; 502 khi Storage không phản hồi đúng.

## 5. Giao diện

- Admin → Lượt thi → Chi tiết → Diễn biến & ảnh bằng chứng → Xem bằng chứng.
- Giảng viên → Ca thi trực tuyến → Lịch sử thi & ảnh bằng chứng → tìm sinh viên/đề/môn → Xem lượt thi → sự kiện → Xem bằng chứng.
- Lịch sử dùng dữ liệu thật, lọc quyền tại database và phân trang. Không dùng dữ liệu giả trong các màn hình sản phẩm.
- Chỉ lấy ảnh khi bấm xem, có hộp ảnh lớn, thời điểm, loại cảnh báo và rủi ro. Có trạng thái tải/pending/failed/không ảnh và thử lại. Không tự kết luận gian lận hoặc thay điểm.
- Khi link hết hạn có nút lấy link mới; lỗi ảnh gần/hết hạn chỉ tự xin lại **một lần** cho mỗi lần mở/thử lại của người dùng. Ảnh lỗi tiếp tục hiển thị thông báo và nút thử lại, không lặp vô hạn.
- Ảnh đã tải vào trình duyệt có thể vẫn nhìn thấy sau thời điểm link hết hạn; hết hạn ngăn yêu cầu tải mới, không thu hồi nội dung đã nhận.

## 6. Kiểm thử và kiểm tra trọn luồng

Đã kiểm tra ngày 16/10/2026:

- **68 Python tests đạt**, gồm retry/backoff, giới hạn nhận job, idempotency, tiếp tục sau restart, upload thành công/DB lỗi, giữ local, bucket public bị từ chối, lỗi chụp/ghi metadata không làm lỗi handoff vòng camera. Các HTTP Storage dùng mock, không dùng ảnh sinh viên.
- **23 test backend mới đạt**, gồm admin/giảng viên đúng môn/ngoài môn/sinh viên, tài khoản khóa/chưa liên kết, sự kiện sai lượt thi, pending/failed/missing, key bất hợp lệ, hạn link, lỗi mạng được lọc thông tin; 5 test trong số đó chạy qua Spring Security/MockMvc và kiểm tra no-store. Thêm 5 test ảnh hồ sơ sẵn có cũng đạt.
- Migration 004 + 007 và **câu upsert thật trích từ Java** đã chạy trên container PostgreSQL 17 tạm, không mạng, không volume host. Đạt: chạy migration lặp, giữ local cũ, callback trùng, pending/failed đến muộn không xóa uploaded, không nhầm lượt thi. Container đã dừng.
- Giao diện đã kiểm tra trên trình duyệt bằng fixture riêng: ảnh giả tải được, pending, link hết hạn/cấp lại, ảnh lỗi dừng sau đúng 2 lượt cấp link (1 ban đầu + 1 tự xin lại); bố cục 390 px. Fixture ở `frontend/tests/evidence.html` chỉ dành cho kiểm thử dev, không nằm trong entry build sản phẩm.
- Build frontend `npm run build` đạt (còn cảnh báo bundle lớn hiện có). Backend compile đạt.

Giới hạn kiểm thử:

- **Chưa upload/ký URL bằng bucket thật**, chưa áp migration lên Supabase thật, chưa chạy trọn một lượt thi với camera/AI model thật và tài khoản Keycloak thật. Chưa có `.env.storage` để kiểm tra cloud.
- Hai test cũ trong `StudentAdminCompatibilityTests` gặp lỗi Java `Unable to establish loopback connection` / `Invalid argument: connect` khi tạo HTTP server local trên máy này. Không sửa mã các chức năng ngoài phạm vi để che lỗi này. `BackendApplicationTests.contextLoads` chưa chạy vì cần database/Keycloak thực tế.

Lệnh kiểm tra tại root:

```powershell
python -m unittest discover -s anticheating/tests -v
python scripts/test_evidence_postgres.py
cd frontend
npm run build
cd ../backend
mvn "-Dtest=EvidenceAccessTests,EvidenceReadTests,SupabaseEvidenceStorageTests,EvidenceHttpSecurityTests,StudentProfilePhotoTests" test
```

Script PostgreSQL yêu cầu Docker và image `postgres:17-alpine` local. Không dùng database đang chạy của dự án.

Sau khi bạn nhập khóa trên máy, có thể kiểm tra cloud bằng Python của môi trường AI (có OpenCV/Numpy):

```powershell
python scripts/test_supabase_evidence.py
```

Script chỉ tạo **một ảnh chữ giả**, upload dưới `attempt-0/<UUID>.jpg`, tải lại qua signed URL và kiểm tra URL hết hạn sau 3 giây. Không ghi database và không lấy ảnh sinh viên. Không in khóa/link; chỉ in bucket/object key thử để bạn xóa riêng object đó trong dashboard nếu muốn.

Kiểm tra trọn luồng sản phẩm sau cấu hình:

1. Chạy migration 007, xác nhận bucket PRIVATE, khởi động lại backend/AI bằng launcher.
2. Dùng một ca/lượt thi thử không chứa dữ liệu cá nhân. Tạo cảnh báo hợp lệ trong pipeline hiện có.
3. Kiểm tra DB chỉ có một event_uuid tương ứng, pending → uploaded, bucket/key đúng attempt; local còn trên máy. Không lưu signed URL trong DB.
4. Admin và giảng viên sở hữu môn mở cùng sự kiện từ màn hình đã nêu; ảnh và metadata đúng.
5. Dùng tài khoản giảng viên môn khác và sinh viên gọi cùng route/ID: phải 403, không có URL trả về.
6. Ngắt kết nối Storage trong môi trường thử: AI/camera và nộp bài vẫn tiếp tục; event pending → failed sau số lần thử hữu hạn. Khôi phục mạng, retry đúng UUID, DB và ảnh cập nhật cùng sự kiện.
7. Giả lập backend mất kết nối sau khi upload: job giữ finalize; sau khôi phục/replay không tạo thêm event/object.
8. Chờ hơn 180 giây hoặc kiểm tra bằng script ảnh giả: yêu cầu ảnh mới qua link cũ bị từ chối; bấm lấy link mới hoạt động. Thử object đã xóa trong dữ liệu thử để kiểm tra 404. Không xóa ảnh hiện có của sinh viên để thử lỗi.

## 7. File thuộc thay đổi này

- `.env.storage.example`, `.gitignore`, `SUPABASE_EVIDENCE.md`.
- Python: `anticheating/app/evidence_delivery.py`, `app/anticheating_pipeline.py`, `app/run_service.py`, `src/evidence/evidence_logger.py`, `tests/test_evidence_delivery.py`, `tests/test_evidence_pipeline.py` (các đường dẫn sau cùng trong nhóm nằm dưới `anticheating/`).
- Database: `database/migrations/007_supabase_evidence.sql`.
- Java services: `EvidenceSchema`, `AiEvidenceIngest`, `EvidenceAccessService`, `EvidenceReadService`, `SupabaseEvidenceStorage`; tích hợp trong `AntiCheatService`; controller `EvidenceController`; cấu hình `backend/src/main/resources/application.properties`.
- Java tests: `service/EvidenceAccessTests`, `service/EvidenceReadTests`, `service/SupabaseEvidenceStorageTests`, `EvidenceHttpSecurityTests` dưới `backend/src/test/java/com/examflow/backend/`.
- FE: `frontend/src/features/evidence/services/evidenceApi.ts`, `components/EvidenceTimeline.tsx`, `components/TeacherEvidenceHistory.tsx`, `styles/evidence.css`; nối vào `features/admin/components/AdminAttemptDialog.tsx`, `features/sessions/pages/ExamSessionsPage.tsx`; fixture `frontend/tests/evidence.html`, `evidence-fixture.tsx`, `evidence.svg`.
- Kiểm tra tùy chọn: `scripts/test_evidence_postgres.py`, `scripts/test_supabase_evidence.py`.

Các thay đổi chưa commit có sẵn ngoài danh sách này được giữ nguyên; không reset database, đổi bucket public hoặc upload lịch sử hàng loạt.

## Tài liệu chính thức đã đối chiếu

- [Supabase API keys: secret và service_role chỉ dùng ở server](https://supabase.com/docs/guides/getting-started/api-keys).
- [Private buckets](https://supabase.com/docs/guides/storage/buckets/fundamentals).
- [Mã SDK Storage chính thức: upload và createSignedUrl](https://github.com/supabase/storage-js/blob/master/src/packages/StorageFileApi.ts).
- [Route ký URL của Storage server chính thức](https://github.com/supabase/storage/blob/master/src/http/routes/object/getSignedURL.ts).

Dùng REST với thư viện chuẩn Python/Java, không thêm SDK/dependency mới. Key `sb_secret_...` gửi qua `apikey`; chỉ legacy JWT mới thêm `Authorization: Bearer ...`. Không theo redirect mang theo key.
