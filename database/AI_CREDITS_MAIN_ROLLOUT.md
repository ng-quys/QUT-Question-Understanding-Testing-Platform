# AI Credits — triển khai DB chính, chờ xác nhận cuối

Chưa chạy migration. Không tạo staging. Người dùng chấp nhận không backup.
Không bỏ hoặc vượt chốt staging-only trong 006_ai_credits.sql.

## Database đã xác minh

| Mục đích | Host | Port | Database / schema | Connection user / project |
| --- | --- | --- | --- | --- |
| Chính, được đề xuất migration | aws-0-ap-northeast-1.pooler.supabase.com | 5432 | postgres / public | postgres.kbplrzkjnyphsbdmscgq |
| Ngân hàng câu hỏi, không migration | aws-0-ap-south-1.pooler.supabase.com | 5432 | postgres / public theo cấu hình; không kết nối ở bước này | postgres.keotqlwcztgarhspdrch |

MainDataSourceConfig khai báo dataSource là Primary; QuestionBankDataSourceConfig
khai báo questionBankDataSource riêng. AiCreditsService dùng trực tiếp
@Qualifier("dataSource"), JdbcTemplate và transaction manager riêng trên DB chính.

verify_ai_credits_target.py chỉ kết nối DB chính, chạy BEGIN READ ONLY,
SELECT metadata/tổng hợp legacy rồi ROLLBACK. Đã xác minh users.id BIGINT,
ai_generation_requests.id BIGINT PK, requested_by BIGINT nullable và FK users,
requested_question_count INTEGER NOT NULL > 0; 3 legacy completed, 20 câu/request,
không null requested_by. Chưa có 3 bảng credits.

## Đề xuất đổi chốt — CHƯA ÁP DỤNG

[006_ai_credits_main_guard.patch](006_ai_credits_main_guard.patch) là bản diff
để review, chưa áp dụng lên SQL. Patch đổi guard và hướng dẫn header sang main,
không đổi DDL đã duyệt. Không dùng hướng dẫn staging để chạy trên main.

Trước thực thi phải xác minh lại cả host, connection user/project, database và
schema. Sau xác nhận cuối mới thay guard để yêu cầu cả:

- examflow.migration_environment = main
- examflow.expected_database = postgres
- examflow.main_target_confirmation = kbplrzkjnyphsbdmscgq/postgres/public

Session setting là xác nhận của người vận hành, không thay thế việc xác minh
host/project của connection. Không đặt environment=staging cho DB chính.

Thay đổi schema: tạo ai_credit_accounts, ai_credit_months,
ai_credit_transactions; thêm 20 cột credits/job vào ai_generation_requests cùng
constraint/index. Không đổi users/questions, không seed, không hồi tố 86/200.
Các FK RESTRICT bảo vệ lịch sử và có thể chặn xóa cứng tài khoản/học phần/request.

Migration chạy một lần, trong transaction. Nếu thất bại: dừng, ghi nguyên nhân,
không sửa DDL trực tiếp để chạy lại. Chưa có thao tác thực thi SQL trong bước này.

## Cấu hình kích hoạt sau migration thành công

- Mặc định AI_CREDITS_ENABLED=false; scheduler không truy vấn hoặc ghi quota.
- Chỉ sau kiểm tra schema mới cấu hình AI_CREDITS_ENABLED=true ở BE.
- Đặt cùng AI_INTERNAL_KEY ngẫu nhiên tối thiểu 32 ký tự tại BE và FastAPI;
  không đặt key trong FE hoặc commit vào repository.
- BE: monthly-limit=200, max-questions-per-request=45, zone=Asia/Ho_Chi_Minh.
- Job timeout mặc định 120 phút: gửi yêu cầu hủy có kiểm soát, không tự refund
  một tác vụ chưa biết đã dừng hay chưa.
- FastAPI: AI_CREDITS_MAX_QUESTIONS=45. Giữ nguyên OLLAMA_MODEL và cấu hình RAG.
- Chạy FastAPI với MỘT worker/process cho registry job. Không đặt nhiều worker
  hoặc nhiều replica phía sau load balancer khi chưa có registry chung.
- Chỉ expose FastAPI/Ollama cho BE hoặc localhost. Endpoint generate/job cần key;
  extract cũ vẫn tồn tại để giữ tương thích, FE mới trích xuất qua BE có xác thực.
- Việc rollout BE/AI/FE phải phối hợp: endpoint sinh cũ cũng qua quota, không có
  đường sinh miễn phí dự phòng. Triển khai trước khi bật quota sẽ chặn sinh AI
  bằng thông báo chưa sẵn sàng, không làm mất số dư.

Không khởi động ứng dụng/test Spring context với datasource thật chỉ để thử:
các thành phần khác có thể có thao tác startup ngoài quota. Chỉ dùng compile,
unit test cô lập và mock transport trong bước hiện tại.

## Quy tắc và phục hồi

Khóa account -> month -> job. Giữ chỗ và ledger một transaction; gọi AI ngoài
transaction. Finalization cập nhật counters, job và ledger cùng transaction.
Operation key duy nhất toàn ledger; grant retry so sánh cả actor, target, amount,
reason. Job key gắn user + hash payload; same-key/different-payload bị từ chối.

Một câu hợp lệ được BE chấp nhận và đưa vào kết quả review = một credit.
Không đợi lưu/duyệt câu hỏi. Partial tính số hợp lệ và trả phần giữ chỗ dư.
Kết quả checkpoint khi job active chưa đưa ra review/chưa quyết toán.

Kỳ tháng là snapshot theo giờ Việt Nam: API và worker bảo đảm kỳ hiện tại tồn
tại. Job vẫn quyết toán credit_month cũ; extra_balance không reset. Worker cấp
kỳ mới cho tài khoản active theo nhóm tối đa 100 mỗi vòng. Đây là cấp hạn mức
vận hành từ dữ liệu thật, không phải seed.

FastAPI giữ lifecycle trong RAM; BE lưu checkpoints và financial state ở DB.
Sau BE restart, Qwen job được dò lại bằng execution token, không tạo lại model
call. Sau mất registry/timeout: unknown giữ chỗ, chặn job mới. Admin phải xác
nhận tác vụ cũ đã dừng, ghi lý do; BE từ chối nếu provider hoặc local worker vẫn
báo đang chạy. Trạng thái terminal fence checkpoint/quyết toán đến muộn.
Không tự refund chỉ vì TTL hết.

FastAPI không hủy mù lời gọi Ollama đang chạy; đánh dấu yêu cầu hủy, chờ lời
gọi hiện tại trả về/timeout rồi dừng trước câu tiếp theo. Partial đã nhận được
giữ để review. Không đổi prompt, RAG, model, CLO/Bloom hoặc similarity algorithm.

## FE và nhiều lượt

Sidebar/AI Generator đọc quota từ API và refetch khi job thay đổi; không tự
trừ credits, không dùng localStorage làm số dư. Mỗi lần nhấn sinh là một job
mới; retry lỗi mạng giữ key. Sau reload có thể tiếp tục active job từ quota.
Ma trận vẫn mounted khi chuyển bước để giữ phân bổ người dùng chọn; không tự
cắt số câu hoặc tự chia tổng ma trận thành nhiều lượt. Người dùng tự điều chỉnh
phân bổ cho lượt kế tiếp. Chưa bổ sung một hệ thống chiến dịch ma trận nhiều
lượt có lịch sử cộng dồn riêng.

## Phạm vi kiểm thử và giới hạn

- Unit test BE: chỉ AiCreditRulesTest, không Spring context, không datasource.
- Test AI lifecycle: unittest với generator giả lập, không Ollama/DB.
- FE build/typecheck và mock API; không mở ứng dụng nối DB thật để test ghi.
- Chưa kiểm thử transaction PostgreSQL thực, 2 request đồng thời trên DB,
  migration, grant/reconciliation thật, hoặc sinh 45 câu bằng Qwen.
- Không gọi login, question-bank save, tạo đề hoặc ca thi thật để smoke-test
  nếu thao tác có thể ghi DB.
- Chưa được tuyên bố đã triển khai hoặc hoạt động thực tế trước migration và
  xác minh sau triển khai được người dùng cho phép.

## Danh sách file của bước triển khai code

Không xóa file. Không sửa main/question-bank datasource URL, Hibernate validate,
Keycloak, thuật toán tạo đề hoặc AI chống gian lận. Các file zip có sẵn trong
workspace không thuộc thay đổi này.

BE thêm:

- backend/src/main/java/com/examflow/backend/service/AiCreditRules.java
- backend/src/main/java/com/examflow/backend/service/AiCreditsService.java
- backend/src/main/java/com/examflow/backend/service/AiCreditsProvider.java
- backend/src/main/java/com/examflow/backend/service/AiCreditsWorker.java
- backend/src/main/java/com/examflow/backend/controller/AiCreditsController.java
- backend/src/main/java/com/examflow/backend/controller/AiCreditsErrors.java
- backend/src/test/java/com/examflow/backend/AiCreditRulesTest.java

BE cập nhật:

- backend/src/main/java/com/examflow/backend/controller/TeacherQuestionBankController.java
- backend/src/main/java/com/examflow/backend/dto/AiGenerateRequest.java
- backend/src/main/java/com/examflow/backend/service/AiGenerationService.java
- backend/src/main/resources/application.properties

FE thêm:

- frontend/src/features/ai-generator/services/aiCreditsService.ts
- frontend/src/features/ai-generator/hooks/useAiQuota.ts
- frontend/src/features/admin/components/AiCreditsAdmin.tsx
- frontend/scripts/test-ai-credits.mjs

FE cập nhật:

- frontend/src/layouts/lecturer/Sidebar.tsx
- frontend/src/features/ai-generator/pages/AIGeneratorPage.tsx
- frontend/src/features/ai-generator/components/MatrixGenerationProgress.tsx
- frontend/src/features/matrix/pages/MatrixPage.tsx
- frontend/src/features/admin/pages/AdminPage.tsx
- frontend/src/services/documentService.ts
- frontend/src/types.ts

AI Service:

- ai-service/main.py (cập nhật lifecycle/partial/internal guard)
- ai-service/credits_runtime.py (thêm)
- ai-service/test_credits_runtime.py (thêm)

DB/tài liệu:

- database/verify_ai_credits_target.py (thêm, chỉ đọc DB chính)
- database/006_ai_credits_main_guard.patch (thêm, chưa áp dụng)
- database/AI_CREDITS_MAIN_ROLLOUT.md (tài liệu hiện tại)
- database/AI_CREDITS_STAGING.md (đánh dấu phương án cũ, không thực hiện)
- database/migrations/006_ai_credits.sql (GIỮ NGUYÊN; chưa thực thi)

## Kết quả kiểm tra code trước migration — 2026-10-17

- DB: chỉ SELECT trong BEGIN READ ONLY rồi ROLLBACK trên DB chính. Không kết
  nối Question Bank, không chạy DDL/DML, không tạo backup/staging.
- BE: compile/test-compile và 9 unit test đạt bằng Maven 3.9.16 đã có,
  offline, Surefire 3.5.5 đã có trong cache. Không chạy SpringBootTest.
- Maven Wrapper vẫn lỗi cũ Cannot index into a null array. Lệnh test mặc định
  với Surefire 3.5.6 bị thiếu lớp trong cache; không sửa wrapper/pom để né lỗi.
- AI Service: 7 unittest đạt. Vòng lặp sinh thật được chạy với toàn bộ I/O
  giả lập cho 1/10/30/45, từ chối 46, partial; thêm idempotency, hủy, lỗi, token
  unknown và guard internal key. Không gọi model hoặc DB.
- Đối chiếu AST với HEAD: normalize, nearest questions, cosine, embed question
  và duplicate report không đổi; prompt Qwen giữ nguyên nội dung.
- FE: node scripts/test-ai-credits.mjs đạt: retry giữ nguyên key/payload,
  partial hiển thị phí BE, hủy đợi BE, resume không tạo mới và giữ điểm từ job.
- FE: npm run build vẫn lỗi 6 TS2307 cũ trong features/app/App.tsx:
  LoginPage, DashboardPage, StudentPortalPage, ThemeProvider, AdminPage,
  AdminLoginPage. Không sửa module App trong phạm vi AI Credits.
- FE: npm exec -- vite build đạt trên entrypoint thực tế, có cảnh báo bundle
  lớn hơn 500 kB. Không coi kết quả này thay thế việc npm run build đang lỗi.
- git apply --check cho patch guard đạt; chưa git apply, chưa chạy SQL.
- Chưa xác minh E2E với Qwen/PostgreSQL thật hoặc các luồng ghi dữ liệu nghiệp
  vụ. Cần xác nhận migration cuối trước bước tiếp theo.
