# Chạy ExamFlow bằng PowerShell

## Chuẩn bị một lần

- Windows PowerShell 5.1, Node/npm, JDK 17+ và Ollama đã cài.
- Dependency FE, virtualenv `ai-service/.venv`, `anticheating/.venv` đã có.
  Launcher không tự cài package hoặc tạo virtualenv.
- Có Maven trên PATH, hoặc distribution Maven Wrapper đã tải sẵn. Launcher ưu
  tiên bản cache đúng version trong `backend/.mvn/wrapper/maven-wrapper.properties`
  để tránh lỗi Wrapper PowerShell cũ. Có thể đặt `MavenPath` trong config local.
- Ollama đã có model cấu hình, mặc định `qwen2.5:7b` và `nomic-embed-text`.
  Launcher chỉ kiểm tra inventory, không tự pull model, warmup hoặc sinh câu hỏi.
- Keycloak hiện có ở issuer được cấu hình trong BE, mặc định port **8081**,
  phải đang hoạt động. Launcher không chạy Docker/import realm hoặc thay đổi
  Keycloak/database. Endpoint xác minh key mới của BE phải có trong bản build.

## Secret local

Chọn biến môi trường của terminal, hoặc sao chép file mẫu:

```powershell
Copy-Item .\examflow.local.example.json .\.env.examflow.local.json
```

Điền giá trị thật bằng editor local, không dán vào chat hoặc log:

- `AI_INTERNAL_KEY`: tối thiểu 32 ký tự, cùng key giữa BE và AI Generator.
- `ANTICHEAT_INTERNAL_SECRET`: không rỗng và không dùng `change-me`.
- `QUESTION_BANK_DB_PASSWORD`: mật khẩu datasource ngân hàng câu hỏi đang có.
- Tùy chọn: `SPRING_DATASOURCE_PASSWORD`, `EXAMFLOW_QUESTIONBANK_DSN`,
  `OLLAMA_MODEL`, `OLLAMA_EMBED_MODEL`. Không lưu JWT/access token trong config.

`.env.examflow.local.json` đã được rule `.env.*` hiện có loại khỏi Git. File mẫu
chỉ có giá trị trống. Không dùng `git add -f` với secret/config local.
Secret không được đưa vào command line, state hoặc thông báo của launcher.
Child process kế thừa environment; environment của terminal gọi được khôi phục
khi launcher kết thúc. File `.env` riêng của AI/Anti-Cheating vẫn được service
đọc theo cơ chế hiện tại; environment do launcher truyền có ưu tiên cao hơn.

BE nhận cùng Anti-Cheating secret qua `APP_ANTICHEAT_SECRET`, AI Anti-Cheating
nhận `ANTICHEAT_INTERNAL_SECRET`; không đổi code authentication.

## Chạy và dừng

Từ thư mục gốc:

```powershell
.\start-examflow.ps1
.\stop-examflow.ps1
```

Từ thư mục khác, dùng đường dẫn tuyệt đối tới script; mọi đường dẫn bên trong
dựa trên `$PSScriptRoot`. `-ConfigPath` tương đối cũng được hiểu theo thư mục gốc
dự án. Có thể tăng `-StartupTimeoutSeconds 300` nếu BE khởi động chậm.

Không tự đổi ExecutionPolicy. Nếu policy của tổ chức chặn script, dùng quy trình
phê duyệt/ký script của môi trường đó.

## Thứ tự, lệnh và readiness

| Service | Lệnh thực tế | Port mặc định | Readiness |
| --- | --- | --- | --- |
| Ollama | `ollama serve` | 11434 | GET `/api/tags`, có Qwen và embedding model |
| BE | Maven `-Dmaven.repo.local=... spring-boot:run` trong backend | 8080 | `/api/health` đúng ExamFlow và verify-key trả 204 |
| AI Generator | tái sử dụng `ai-service/start-ai-credits.ps1` | 8002 | `/health` đúng model/Ollama và GET token không tồn tại trả 404 với internal key |
| Anti-Cheating | virtualenv Python chạy `anticheating/app/run_service.py` | 8000 | `/health` trả `ok=true`, PID đúng service |
| FE giảng viên/sinh viên/Admin | `npm run dev -- --host 127.0.0.1 --port 5173 --strictPort` | 5173 | HTML Vite và PID thuộc frontend dự án |

Admin hiện dùng chung frontend; không có package Admin riêng để khởi động.
Port 5173 được đặt rõ cho Vite, phù hợp cấu hình origin hiện có của ExamFlow.
Các port khác được đọc từ application.properties; `Ports` trong config local
có thể override đồng bộ cho service mới. Nếu đổi port, phải bảo đảm CORS và
redirect URI Keycloak hiện có cho phép; launcher không thay đổi các quyền này.
Service đang chạy sẵn phải đã có cấu hình port/URL tương thích với config chọn.

Anti-Cheating HTTP ready/idle không có nghĩa pipeline camera/model đã khởi động.
Launcher không tạo ca thi, bật camera/micro hoặc gọi `/session/start` để thử key.
Service Anti-Cheating cũ không có API verify-key không ghi dữ liệu; khi tái sử
dụng service cũ, cần bảo đảm secret của nó đã khớp cấu hình BE từ trước.

## Port, quyền sở hữu và log

- Khởi động lần hai: tái sử dụng port chỉ khi xác minh được identity/readiness.
  BE và AI Generator còn phải qua kiểm tra key hiện có. Không mở cửa sổ trùng.
- Port đang bị chiếm nhưng không xác minh được: dừng launcher, không kill hoặc
  chuyển sang port ngẫu nhiên. Kiểm tra log rồi xử lý thủ công.
- Từng service có wrapper ẩn và stdout/stderr log riêng trong
  `.env.examflow.runtime/logs/`; có thể mở/tail từng file để debug.
- `.env.examflow.runtime/state.json` chỉ lưu service/PID/thời gian tạo/root.
  Không có secret hoặc token. Thư mục runtime được `.env.*` bỏ qua và không bị
  `mvn clean` xóa. Không xóa/sửa state khi service launcher đang chạy.
- Named mutex ngăn hai lệnh start/stop chạy đồng thời trên cùng checkout.
- Stop kiểm tra PID, thời gian tạo và command line wrapper trước khi dừng.
  Windows Job Object kill-on-close giới hạn việc dừng vào cây tiến trình wrapper
  đó. PID tái sử dụng hoặc state sai không được dùng để kill service khác.
- Ollama/service đã có sẵn không được ghi thành tiến trình sở hữu và không bị
  stop. Ollama do chính launcher tạo thì được stop cùng các service do nó tạo.
- Nếu một service thất bại, chỉ báo lỗi, không báo toàn hệ thống thành công.
  Các service đã khởi động trước đó được giữ lại cùng log; dùng stop để dọn
  phần do launcher sở hữu, rồi sửa lỗi và chạy lại.
- Trước khi stop, kiểm tra không có job AI hoặc ca thi đang hoạt động. Stop
  không gửi cancel/release/settle; dừng AI Generator sẽ mất registry trong RAM,
  nên job đang chạy có thể cần đối soát theo quy trình hiện có sau restart.

## Phạm vi an toàn và kiểm thử

Launcher không gọi migration/seed/reset quota/Admin reconcile và không ghi SQL.
Không tự bật/tắt `AI_CREDITS_ENABLED`. BE hiện có có thể thực hiện hoạt động
startup/background bình thường khi được chạy; vì vậy không dùng khởi động BE
trỏ Production làm bài test không ghi dữ liệu.

Kiểm thử launcher dùng Pester với toàn bộ service/HTTP/DB giả lập:

```powershell
Invoke-Pester .\scripts\tests\examflow-launcher.Tests.ps1
```

Test process-tree thực tế chỉ chạy hai HTTP server tổng hợp trên port ngẫu nhiên:

```powershell
.\scripts\tests\test-owned-process-tree.ps1
```

Đã kiểm tra cú pháp, thứ tự launch, chạy lại không trùng, thiếu key, config local,
port lạ bị chiếm, readiness thất bại, state không chứa secret, chống PID tái sử
dụng/PID dạng mảng và stop chỉ nhắm wrapper sở hữu. Test Windows xác nhận child
server bị dừng nhưng server không thuộc launcher vẫn sống.
Chưa chạy cold-start cả hệ thống trên DB Production và chưa gọi Qwen sinh thật.
