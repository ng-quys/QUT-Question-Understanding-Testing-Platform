# AI Generator: tài liệu và CLO

## Luồng mới

1. Upload PDF/DOCX/TXT qua endpoint trích xuất hiện có; giữ tên, dung lượng, trạng thái và proof ràng buộc người dùng/nội dung.
2. Chọn học phần và một hoặc nhiều CLO active từ API học phần. Không tạo CLO mẫu hoặc cho bỏ qua tài liệu thật.
3. Chọn số nguyên 1–45, xem credits dự kiến giữ chỗ. Không giảm số câu tự động khi thiếu credits.
4. Gửi qua `/api/teacher/ai-credits/jobs` với `courseId`, `cloIds`, `questionCount`, `sourceText`, `sourceProof`, `provider=qwen`. Theo dõi tiến độ rồi hiệu chỉnh CLO/Bloom/nội dung/đáp án, loại bỏ, lưu chờ duyệt hoặc duyệt qua API ngân hàng hiện có.

## Batch, hàng đợi và tiếp tục sau khi khởi động lại

- Request mới gửi `batchSize=5`; Backend và AI Service chỉ chấp nhận 5 hoặc 10. Một job vẫn có đúng một reservation, execution token và lần quyết toán credits.
- AI Service có hàng đợi bất đồng bộ, mặc định chỉ một job được dùng Ollama tại một thời điểm (`AI_JOB_MAX_CONCURRENT=1`). Job sau ở trạng thái chờ, không mở thêm model call cạnh tranh.
- Câu hợp lệ được gom theo batch. Sau mỗi 5 câu (hoặc 10 khi cấu hình request như vậy), registry ghi checkpoint nguyên tử và Backend nhận checkpoint ở lần polling kế tiếp. Batch cuối ít hơn kích thước chuẩn vẫn được lưu khi kết thúc hoặc hủy.
- Registry bền vững nằm mặc định tại `ai-service/.runtime/credits-registry.json`, đã được gitignore. Có thể đổi đường dẫn bằng `AI_JOB_STATE_PATH`. File chứa payload/tài liệu trong thời gian job chưa xong để có thể tiếp tục; payload được xóa khỏi file khi job kết thúc, chỉ giữ fingerprint và kết quả để bảo toàn idempotency.
- Khi AI Service dừng giữa job, trạng thái đang chạy được nạp lại thành `paused`, giữ nguyên registry ID và checkpoint. Lần khởi động sau tự xếp job vào hàng đợi và sinh tiếp phần còn thiếu. Không POST job mới, không tạo reservation mới và không sinh lại các batch đã checkpoint.
- UI hiển thị số batch và tiến độ câu hợp lệ. Chỉ khi upstream kết thúc thì Backend mới tổng hợp, validate lần cuối và quyết toán; 7/10 câu vẫn tính 7 và giải phóng 3 như trước.
- Cơ chế này phục vụ tình huống chạy một phần trên cùng máy rồi tiếp tục ở địa điểm khác. Không sao chép file runtime sang hai máy và không chạy hai AI Service trên cùng file; PostgreSQL coordination của Backend vẫn là lớp bảo vệ quyền xử lý job.

## Lịch sử hiệu năng Excel

- Mỗi job kết thúc được nối thêm một dòng vào `ai-service/.runtime/ai-generation-metrics.xlsx`, sheet `AI Jobs`.
- File ghi thời gian chờ, thời gian xử lý, tốc độ câu/phút, CPU và RAM của AI Service/Ollama, RAM toàn máy, batch size, số câu hợp lệ, trạng thái và lỗi rút gọn.
- Có thể đổi đường dẫn bằng `AI_METRICS_XLSX_PATH` và chu kỳ lấy mẫu bằng `AI_METRICS_SAMPLE_SECONDS` (mặc định 1 giây).
- Telemetry là best-effort: lỗi ghi Excel được ghi log nhưng không làm job sinh câu hỏi thất bại. Nên đóng file trong Excel khi job đang chạy để Windows không khóa file.

Backend xác thực quyền học phần, đối chiếu từng CLO theo course/status và lấy code/description từ DB. Mô tả CLO do client gửi không được sử dụng. Lưu snapshot CLO vào `credit_payload` JSON hiện có, không thêm cột/bảng. Bản tin mới không chứa ma trận. Payload/job ma trận cũ vẫn đọc/chạy/đối soát được; OpenAI cũ chỉ còn phục vụ các job/luồng cũ, luồng mới dùng Qwen qua RAG.

## Phân bổ và bằng chứng

- Giữ nguyên model Qwen và embedding, FAISS, giới hạn trích xuất và kiểm tra trùng Question Bank.
- Retrieval tối đa 4 đoạn cho mỗi mô tả CLO; tính cosine giữa embedding CLO và đoạn tài liệu. Chỉ giữ đoạn đạt ngưỡng heuristic 0.35. Điểm CLO là điểm cao nhất của các đoạn có căn cứ.
- Chỉ CLO được chọn và đạt ngưỡng mới tham gia phân bổ. Khi nhiều CLO hơn số câu, lấy các CLO có điểm cao nhất; hòa điểm ưu tiên ID tăng dần.
- Chia số câu theo trọng số điểm, lấy phần nguyên rồi phân phần dư theo largest remainder, hòa điểm theo điểm hỗ trợ và ID. Nếu có ít nhất một CLO phù hợp thì tổng ngân sách bằng đúng số câu yêu cầu; không mặc định chia đều hoặc dồn vào CLO đầu tiên.
- Nếu không có CLO phù hợp, không gọi Qwen và trả 0 câu. Slot không sinh được câu hợp lệ sau số retry hiện có để trống, không ép model bịa hoặc tự chuyển câu sang CLO khác. UI thông báo số câu thiếu và mã CLO chưa có câu; log có điểm và allocation theo ID, không ghi nội dung tài liệu.
- Qwen nhận CLO thật và các đoạn được retrieval. Model tự đề xuất một trong `remember`, `understand`, `apply` với định nghĩa thao tác nhận thức trong prompt. Không gán Bloom ngẫu nhiên hay mặc định.
- Validate JSON một câu/lần, 4 lựa chọn khác nhau, đúng một đáp án, giải thích, CLO đúng mục tiêu, Bloom thuộc enum và trích dẫn nguyên văn tối thiểu 20 ký tự trong đoạn retrieval. Kiểm tra thêm cosine của câu/đáp án/giải thích với bằng chứng. Sau đó chạy kiểm tra trùng semantic và trong batch hiện có, fail closed khi kiểm tra trùng lỗi.
- Backend kiểm tra lại tổng số câu, CLO được chọn, Bloom, cấu trúc, bằng chứng nằm trong tài liệu. Không tự gán chương: `chapterId=null` khi tài liệu không cung cấp quan hệ đáng tin cậy. Trích dẫn được giữ trong kết quả job và hiển thị ở màn review; schema ngân hàng hiện tại chưa có trường nguồn riêng nên không thêm cột để lưu nó.

Các phép kiểm tra này là heuristic và kiểm tra cấu trúc, không chứng minh suy diễn/nhãn CLO/Bloom luôn đúng. Giảng viên vẫn chịu trách nhiệm thẩm định. Ngưỡng liên quan chưa được hiệu chỉnh bằng tập dữ liệu thật trong lần triển khai này; chưa chạy model thật hoặc tiêu credits production.

## AI Credits và tương thích

Giữ nguyên reserve/settle/release, ledger, tháng reset, cấp thêm, khóa tài khoản, một job active, idempotency/execution token và worker. Chỉ thêm nhánh đếm/validate request CLO. Giữ giới hạn cứng 45 ở FE, BE và AI Service. 7 câu hợp lệ trong yêu cầu 10 câu vẫn dùng đúng logic quyết toán cũ: tính 7, giải phóng 3.

Job ID được lưu theo user trong sessionStorage; reload ưu tiên activeJob từ API hơn review ID cũ, tiếp tục GET cùng job, không tự POST job thay thế. Chỉnh sửa chưa lưu trên màn review chưa được phục hồi sau reload; kết quả AI gốc vẫn lấy lại từ job. Thất bại transport không xác định vẫn giữ trạng thái unknown và cần đối soát như trước, không tự hoàn credits khi chưa biết worker đã dừng.

Không sửa database/schema/migration, Keycloak/login, model, Anti-Cheating, API/thuật toán tạo đề thi hoặc dữ liệu/job cũ. Không commit/push. Module ma trận tạo đề được giữ nguyên. Các tên kiểu `MatrixGenerationProgress.tsx` và payload `units` cũ chỉ còn để tương thích, không tạo màn phân bổ mới.

## File thay đổi

FE:

- `frontend/src/features/ai-generator/pages/AIGeneratorPage.tsx`
- `frontend/src/features/ai-generator/components/DocumentUploadStep.tsx`
- `frontend/src/features/ai-generator/components/GeneratorStepper.tsx`
- `frontend/src/features/ai-generator/components/MatrixGenerationProgress.tsx`
- `frontend/src/features/ai-generator/components/QuestionReviewStep.tsx`
- `frontend/src/features/ai-generator/services/aiCreditsService.ts`
- `frontend/src/services/documentService.ts`
- `frontend/src/types.ts` (thêm trích dẫn tùy chọn cho câu AI)

BE:

- `backend/src/main/java/com/examflow/backend/dto/AiGenerateRequest.java`
- `backend/src/main/java/com/examflow/backend/dto/AiQuestionDto.java`
- `backend/src/main/java/com/examflow/backend/service/AiCreditRules.java`
- `backend/src/main/java/com/examflow/backend/service/AiCreditsService.java`
- `backend/src/test/java/com/examflow/backend/AiCreditRulesTest.java`
- `backend/src/test/java/com/examflow/backend/AiCreditsSettlementTest.java`

AI Service: `ai-service/main.py`.

File tạo mới:

- `ai-service/clo_generation.py`
- `ai-service/test_clo_generation.py`
- `ai-service/CLO_GENERATOR_WORKFLOW.md`
- `backend/src/test/java/com/examflow/backend/AiGeneratorMatrixCompatibilityTest.java`
- `frontend/scripts/ai-generator-smoke.html`
- `frontend/scripts/ai-generator-smoke.tsx`
- `frontend/scripts/test-ai-generator.mjs`

Không xóa file. Hai component FE cũ bị khuyết mã trong bản nguồn được thay nội dung trong chính file đó khi triển khai luồng mới.

## Kiểm thử

```powershell
npm --prefix frontend run build
cd backend
.\mvnw.cmd -DskipTests compile
.\mvnw.cmd '-Dtest=AiCreditRulesTest,AiCreditsSettlementTest,AiJobTransportTest,AiExtractionContractTest,AiGeneratorMatrixCompatibilityTest' test
cd ../ai-service
.\.venv\Scripts\python.exe -m unittest test_clo_generation test_credits_runtime test_extract_contract
```

Nếu Maven wrapper trên máy không tự khởi động được, dùng bản Maven đã có trong cache với cùng version trong wrapper properties; không sửa wrapper để né lỗi môi trường.

Browser test (toàn bộ API giả lập, không tài khoản/secret/model thật), chạy tại gốc repo:

```powershell
node frontend/scripts/test-ai-generator.mjs
```

Cần Node, Playwright và Microsoft Edge. Test dùng Vite riêng tại `127.0.0.1:5187`, sẽ không chiếm cổng nếu đã có server khác. Nếu Playwright nằm ngoài node_modules dự án, chỉ định đường dẫn module đã cài bằng biến terminal `EXAMFLOW_PLAYWRIGHT_PATH`. Không truy cập harness thủ công để kiểm tra production. Screenshot QA nằm tại `tmp/ai-generator-smoke/review.png`.

Kết quả xác minh:

- FE build đạt; Vite cảnh báo bundle lớn.
- AI Service: 21 test đạt, external I/O được thay bằng mock.
- BE: compile đạt; suite chọn lọc gồm 49 test, 47 đạt, 2 skip. Test extract cần môi trường tùy chọn giữ nguyên skip; test native optimizer skip do OR-Tools JNI `UnsatisfiedLinkError` của môi trường. Test thuần Java kiểm tra ràng buộc ma trận/CLO và overlap đạt. Chưa xác nhận được tối ưu native chạy hoàn chỉnh trên máy này; không sửa module tạo đề để xử lý lỗi đó.
- Browser mock: upload, bắt buộc chọn CLO, nhiều CLO, 45 cho phép/46 chặn, request không có ma trận, reload GET cùng job, partial results, chỉnh CLO/Bloom và lưu API ngân hàng đạt.

Không chạy sinh câu hỏi thật hoặc ghi DB production trong kiểm thử này. Chất lượng nội dung trên tài liệu thật, hiệu chỉnh ngưỡng relevance và trải nghiệm mobile chưa được xác nhận bằng một phiên giảng viên thực.
