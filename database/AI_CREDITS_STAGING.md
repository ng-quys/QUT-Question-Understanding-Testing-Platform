# AI Credits: kế hoạch kiểm thử staging

Lưu ý: tài liệu của giai đoạn chuẩn bị trước. Người dùng hiện chọn DB chính,
không tạo staging và chấp nhận không backup. Phương án hiện tại ở
[AI_CREDITS_MAIN_ROLLOUT.md](AI_CREDITS_MAIN_ROLLOUT.md); không dùng các lệnh
staging bên dưới để chạy trên DB chính.

Trạng thái tại giai đoạn staging: chỉ chuẩn bị file. Chưa thực thi SQL, chưa tạo staging, chưa kết nối
database trong bước chuẩn bị này. Không có thay đổi BE/FE/AI Service.

Migration đề xuất: [006_ai_credits.sql](migrations/006_ai_credits.sql).

## 1. Phạm vi và điều kiện trước khi chạy

- Chỉ chạy trên database staging riêng, sau khi người vận hành duyệt thực thi.
- Không dùng datasource, tài khoản, connection string hoặc dữ liệu Production.
- Không lấy tên database làm bằng chứng duy nhất: nhiều hệ thống có database
  cùng tên postgres. Phải xác minh cả host, port, database và user.
- Không chạy ứng dụng hoặc migration tự động trỏ đến Production.
- Giữ nguyên dữ liệu và cột cũ của users, questions và ai_generation_requests.
- Không chuyển số mẫu 86/200 thành dữ liệu hạn mức.
- Giới hạn 200/tháng và 45/lượt thuộc cấu hình BE sau này. Migration không seed
  tài khoản/kỳ quota và không đóng cứng hai giá trị này.

Chưa xác minh hoặc tạo một staging đang hoạt động. Chốt trong SQL chỉ yêu cầu
người vận hành khai báo staging và tên database; nó không xác thực server thật
có phải staging hay không.

## 2. Nếu chưa có staging

Người vận hành chọn một trong hai cách:

1. Tạo PostgreSQL cục bộ/container riêng, chỉ bind vào localhost, dùng port,
   user và mật khẩu riêng; dùng cùng major version với môi trường đích.
2. Tạo project/database staging riêng trên nhà cung cấp hiện có, với credential
   không có quyền truy cập Production.

Ví dụ lệnh để người vận hành tự chạy, sau khi điền placeholder:

    docker run --name examflow-ai-credits-staging -d -p 127.0.0.1:55432:5432 -e POSTGRES_DB=examflow_staging -e POSTGRES_USER=examflow_staging -e POSTGRES_PASSWORD=<STAGING_ONLY_PASSWORD> postgres:<TARGET_MAJOR_VERSION>

Không chạy nguyên placeholder. Không dùng mật khẩu Production. Không sao chép
dữ liệu người dùng, tài liệu, token hoặc câu hỏi thật.

Database rỗng chưa đủ để chạy migration này. Cần baseline schema do chủ dự án
cung cấp/phê duyệt, hoặc fixture schema tổng hợp riêng cho kiểm thử:

- users: id BIGINT, khóa chính một cột.
- courses và semesters: các bảng đích của FK request hiện có.
- ai_generation_requests: đầy đủ cột/constraint baseline đã được rà soát.
- ai_documents: FK generation_request_id -> request, ON DELETE CASCADE.
- questions: FK ai_generation_request_id -> request, ON DELETE SET NULL.

Các migration 002-005 trong repository không thay thế một baseline schema đầy
đủ. Không tự dump/copy Production để lấp phần thiếu. Schema fixture tối thiểu
chỉ xác minh DDL/FK; kiểm thử ứng dụng về sau cần schema staging đầy đủ.

Chỉ tạo tài khoản, học phần, request và nội dung tổng hợp trên staging khi
được duyệt kiểm thử. Chuẩn bị 3 request legacy tổng hợp trạng thái completed,
20 câu/request, có requested_by; không dùng 3 bản ghi thật.

## 3. Snapshot và chạy có kiểm soát

Trước khi chạy:

- Ghi lại version PostgreSQL, host, port, database, user và schema staging.
- Ghi snapshot mọi cột CŨ của 3 request legacy tổng hợp, các hàng users,
  questions và ai_documents liên quan. Không chỉ so sánh row count.
- Ghi constraint/index và hành vi FK baseline.
- Bảo đảm không có writer khác làm thay đổi fixture trong lúc kiểm thử.

Sau khi xác minh đích là staging, người vận hành có thể chạy từ root repository:

    psql "$env:EXAMFLOW_STAGING_DSN" -X -v ON_ERROR_STOP=1 -c "SET examflow.migration_environment = 'staging'; SET examflow.expected_database = 'examflow_staging';" -f database/migrations/006_ai_credits.sql

DSN phải được thiết lập riêng cho staging. Hai setting phải ở cùng session
với file SQL. Thay tên database trong setting nếu staging có tên khác.
Không lấy DSN từ .env/backend configuration hiện đang trỏ database thật.

Migration có BEGIN/COMMIT, lock_timeout 5 giây và statement_timeout 60 giây.
Nếu có lỗi, dừng, rollback transaction và kiểm tra nguyên nhân; không tự xóa
constraint, thêm IF NOT EXISTS hoặc nới điều kiện để chạy qua.

## 4. Idempotency và operation_key

- operation_key là UUID duy nhất TOÀN LEDGER, không phân biệt user/event_type.
- Một thao tác tài chính dùng một key ổn định qua retry. Reserve và kết thúc
  job là hai thao tác khác nhau, phải có hai key khác nhau.
- Retry cấp thêm phải dùng lại key, kể cả khi người dùng nhấn lại nút.
- Cùng key với payload chuẩn hóa giống nhau: BE trả thao tác cũ. Khác đích,
  người cấp, số lượng, lý do hoặc nội dung thao tác: BE từ chối.
- Không dùng ON CONFLICT DO NOTHING rồi vẫn commit cộng/trừ số dư.
- Giữ khóa account -> month -> job theo cùng thứ tự; cập nhật số dư, job và
  ledger trong một transaction. Lỗi unique/constraint phải rollback toàn bộ.
- Idempotency của job vẫn theo (requested_by, idempotency_key), kèm hash
  payload. Không dùng operation_key thay cho idempotency key của job.
- Một job chỉ có một reserve và một kết thúc tài chính, dù retry đổi key.
- Một người/tháng chỉ có một giao dịch monthly_allocation.

Unique constraint chỉ chống lặp key/sự kiện đã định nghĩa. Nó không nhận biết
hai khoản cấp thêm có cùng ý nghĩa nếu caller cố ý tạo hai key mới. Phân quyền,
quy tắc retry và transaction BE chưa được triển khai trong bước này.

## 5. Ma trận kiểm thử migration

Mỗi ca DML dùng fixture staging riêng hoặc transaction rollback. Lỗi dự kiến
phải được cô lập bằng SAVEPOINT/ROLLBACK TO SAVEPOINT; không để một lỗi làm
vô hiệu hóa các kiểm tra còn lại.

| Ca kiểm thử | Kết quả cần đạt |
| --- | --- |
| Thiếu acknowledgement staging / sai tên database | Migration dừng trước DDL |
| Baseline thiếu bảng, sai kiểu PK/FK/count hoặc sai PK | Migration dừng; không có cài đặt một phần |
| Áp dụng lần đầu trên baseline đúng | Tạo 3 bảng, cột và index đúng |
| Legacy | 3 hàng vẫn completed, số câu và mọi cột cũ giống snapshot; metadata credits trung tính |
| Chạy lại file sau khi commit | Dừng rõ ràng; không cấp lại hạn mức hoặc sửa dữ liệu |
| Extra balance âm hoặc reserved vượt balance | CHECK từ chối |
| Monthly used + reserved vượt monthly_limit | CHECK từ chối |
| Hai job active cùng tài khoản, khác key | Unique từ chối job thứ hai |
| Job cũ terminal rồi tạo job mới | Cho phép |
| Cùng user/idempotency key | Unique từ chối bản ghi thứ hai |
| Cùng operation_key với user hoặc event_type khác | Global unique từ chối |
| Hai reserve cùng job, khác operation_key | Unique từ chối |
| Hai settle cùng job, khác operation_key | Unique từ chối |
| Settle rồi release, hoặc release rồi settle | Unique từ chối thao tác kết thúc thứ hai |
| Cấp tháng hai lần với key khác nhau | Unique allocation từ chối |
| Ledger gắn sai owner hoặc sai kỳ của job | Composite FK từ chối |
| Kết quả không phải array hoặc khác accepted_count | CHECK từ chối |
| Succeeded với số câu thiếu; partial với 0 hoặc đủ số câu | CHECK từ chối |
| Failed/cancelled nhưng có câu được tính phí | CHECK từ chối; phải dùng partial/succeeded nếu giữ kết quả để review |
| Trừ extra trước khi hết phần monthly đã reserve | CHECK quyết toán từ chối |

Ví dụ quyết toán để kiểm tra trên staging:

- Reserve 20 = 8 monthly + 12 extra; chấp nhận 15.
- Job kết thúc partial, charged_monthly=8, charged_extra=7.
- Month: used tăng 8; reserved giảm 8.
- Account: extra_balance giảm 7; extra_reserved giảm 12.
- Ledger settle: monthly_used_delta=8, monthly_reserved_delta=-8,
  extra_balance_delta=-7, extra_reserved_delta=-12.
- Năm credits không dùng được giải phóng, không cần thêm release cho job.

Ví dụ lỗi hoàn toàn:

- Giữ chỗ cùng phân bổ 8+12; accepted_count=0, kết quả [].
- Job failed; charged_monthly=charged_extra=0.
- Ledger release: monthly_reserved_delta=-8, extra_reserved_delta=-12;
  monthly_used_delta=extra_balance_delta=0.
- Không tạo thêm settle.

Các phép cập nhật trong mỗi ví dụ phải cùng một transaction. Cần thử lỗi
ledger ở cuối transaction và xác nhận mọi thay đổi số dư/job đã rollback.

## 6. Kiểm thử FK và xóa cứng

| Đối tượng | Hành vi dự kiến |
| --- | --- |
| User chưa có dữ liệu credits | FK baseline tiếp tục áp dụng |
| User đã có ai_credit_accounts | ON DELETE RESTRICT chặn xóa cứng |
| Admin được actor_id trong ledger tham chiếu | RESTRICT chặn xóa cứng Admin đó |
| Legacy request chưa có ledger | Hành vi baseline giữ nguyên: ai_documents cascade, questions set null |
| Request có ledger reserve/settle/release | Ledger FK RESTRICT chặn xóa cứng request |
| Course chứa request có ledger | Cascade hiện có bị ledger RESTRICT chặn; toàn thao tác DELETE rollback |
| Tháng/account đã được job/ledger tham chiếu | RESTRICT chặn xóa mất lịch sử |
| User/request không liên quan | Không bị chặn bởi dữ liệu credits của tài khoản/job khác |

Thử xóa course trong transaction và xác nhận rollback giữ nguyên cả tài liệu
và câu hỏi liên quan khi FK từ chối. Không bỏ FK để thử cho qua.

Đây là thay đổi hành vi khi dữ liệu credits được tạo về sau, dù migration
không sửa các FK cũ. Ưu tiên khóa/ngưng hoạt động thay cho xóa cứng. Nếu
nghiệp vụ bắt buộc xóa cứng, phải thiết kế chính sách lưu trữ/ẩn danh riêng và
xin duyệt; không triển khai trong migration này.

## 7. Kiểm thử concurrency và giới hạn của DDL

Trên staging, dùng hai kết nối độc lập:

1. Hai transaction giữ chỗ trên cùng account/month: khóa hàng và unique active
   job phải ngăn vượt hạn mức. Kiểm tra transaction bị từ chối rollback.
2. Hai transaction cấp thêm cùng operation_key: chỉ một giao dịch được commit,
   số dư chỉ tăng một lần khi dùng đúng transaction protocol.
3. Settle và release đồng thời cùng job: chỉ một kết thúc tài chính commit.
4. Cấp kỳ mới đồng thời: chỉ một month row và một allocation.
5. So sánh số dư với tổng ledger sau mỗi lần commit/rollback.

DDL không tự đồng bộ counter với ledger, không ngăn chỉnh sửa/xóa lịch sử
bằng tài khoản DB có quyền, không kiểm tra role Admin, và không quyết định
state transition. BE sau này phải tập trung các mutation trong transaction;
API không cung cấp sửa/xóa ledger. Quyền DB tối thiểu cần được rà soát riêng,
không thay đổi role/permission ở bước chuẩn bị này.

Quota chưa hoạt động chỉ bằng việc áp dụng migration. Chỉ bật luồng tính phí
sau khi BE reservation/idempotency/settlement và phục hồi job đã được kiểm thử.

## 8. Các ca cần kiểm thử sau khi có BE/AI integration

- 1/10/30/45 câu; từ chối 46; không tự cắt ma trận.
- Partial, lỗi hoàn toàn, timeout, hủy, retry cùng key/payload khác.
- Tính phí khi kết quả hợp lệ sẵn sàng cho bước review, không đợi lưu/duyệt.
- Unknown: không tự refund theo TTL; xác minh upstream đã dừng hoặc Admin
  đối soát có lý do, fence kết quả đến muộn, rồi kết thúc và mở khóa an toàn.
- Reset 00:00 Asia/Ho_Chi_Minh; job qua tháng dùng kỳ đã giữ chỗ; extra còn nguyên.
- User không tự cấp thêm; Admin grant có reason; lịch sử và danh sách phân trang.
- Reload FE đọc lại BE; không dùng localStorage làm quota.
- Giữ nguyên model, prompt, RAG, CLO/Bloom và kiểm tra trùng toàn lượt.

## 9. Kết thúc thử nghiệm

- Lưu kết quả từng ca, constraint name khi bị từ chối và đối chiếu snapshot.
- Đối soát ledger/counter và xác nhận không chạm Production.
- Không dùng DROP ... CASCADE làm rollback cho database có dữ liệu thật.
- Với staging dùng một lần, chỉ tái tạo/xóa môi trường khi chủ môi trường cho phép.
- Chưa có down migration phá hủy dữ liệu; Production cần phê duyệt và kế hoạch
  triển khai/khôi phục riêng sau khi staging đạt.
