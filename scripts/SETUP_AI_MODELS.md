# Chuẩn bị model cho AI Generator ExamFlow

## Cài đặt và chạy

1. Cài Ollama cho Windows từ nguồn chính thức: https://ollama.com/download/windows. Mở lại PowerShell sau khi cài. Script chỉ hướng dẫn, không tự cài phần mềm hệ thống.
2. Clone ExamFlow và mở PowerShell tại thư mục gốc repository.
3. Chạy một trong các lệnh:

```powershell
# Kiểm tra; không khởi động server hoặc tải model
.\scripts\setup-models.ps1 -CheckOnly

# Kiểm tra, thử khởi động Ollama nếu cần, hỏi trước khi tải model thiếu
.\scripts\setup-models.ps1

# Đồng ý tải tất cả model thiếu, không hỏi
.\scripts\setup-models.ps1 -Yes
```

4. Chờ thông báo `VERIFIED` / `SUCCESS`. Model có thể mất nhiều phút để tải; script không in toàn bộ output CLI để tránh lộ URL/proxy chứa thông tin nhạy cảm. Không cần tải lại model đã có. Chạy lại sau lỗi mạng để tiếp tục chuẩn bị các model còn thiếu.
5. Kiểm tra thủ công:

```powershell
ollama list
```

Nếu dùng URL khác mặc định, CLI cần trỏ tới cùng server, ví dụ đặt `$env:OLLAMA_HOST = $env:OLLAMA_URL` trong terminal dùng kiểm tra. Script tự đặt `OLLAMA_HOST` tạm thời cho `serve`/`pull` và khôi phục giá trị cũ.

6. Cài Python dependencies riêng (Windows, từ thư mục gốc):

```powershell
python -m venv ai-service/.venv
.\ai-service\.venv\Scripts\python.exe -m pip install -r ai-service/requirements.txt
```

Nếu đã có virtualenv thì dùng virtualenv hiện có. Setup model không cài dependencies Python và không kiểm tra DB.

7. Sau khi Backend đã chạy và **AI_INTERNAL_KEY hiện có** được cấu hình giống nhau ở BE và terminal AI Service, chạy script khởi động hiện có:

```powershell
.\ai-service\start-ai-credits.ps1
```

Không tạo hoặc đổi key khi setup model. Xem `ai-service/INTERNAL_KEY_STARTUP.md` cho điều kiện kiểm tra key và cổng dịch vụ. Nên dùng cùng terminal/cùng cấu hình model cho setup và chạy dịch vụ.

## Model và nguồn cấu hình

Hiện tại `ai-service/main.py` dùng:

| Cấu hình | Mặc định | Công dụng |
| --- | --- | --- |
| `OLLAMA_MODEL` | `qwen2.5:7b` | Sinh câu hỏi JSON |
| `OLLAMA_EMBED_MODEL` | `nomic-embed-text` (`:latest` khi không chỉ định tag) | Embedding RAG/FAISS và kiểm tra trùng lặp Question Bank |
| `OLLAMA_URL` | `http://127.0.0.1:11434` | Ollama server |

Không có model Ollama khác được AI Generator hiện tại gọi. Backend `application.properties` cũng khai báo `ai.ollama.model=qwen2.5:7b`, `ai.ollama.url=http://localhost:11434`; không khai báo embedding. Không cần tải model OpenAI. Script không đọc cấu hình hoặc chuẩn bị model Anti-Cheating.

Script đọc mặc định trực tiếp từ `main.py`, sau đó đọc ba khóa trên trong `ai-service/.env` (hoặc `.env` tại gốc nếu không có file ở service), cuối cùng ưu tiên biến môi trường của terminal. Không import Python hay in nội dung file `.env`. Chỉ hỗ trợ giá trị literal, không chạy biểu thức/interpolation trong dotenv; cấu hình không đọc được sẽ dừng thay vì chọn model khác. Không dùng file mẫu làm cấu hình runtime. Repository hiện không có `.env.example` cho AI Service; `.env.storage.example` phục vụ Storage và không chứa cấu hình model Generator.

`start-ai-credits.ps1` dùng cấu hình trực tiếp của AI Service. Launcher toàn hệ thống `examflow-launcher.ps1` có cách chọn cổng riêng và lấy Qwen từ properties BE khi không có override; nếu dùng launcher với cấu hình tùy chỉnh, hãy đồng bộ `OLLAMA_MODEL`/`OLLAMA_EMBED_MODEL` và `OLLAMA_URL` của terminal setup với server/model mà launcher sử dụng. Script setup không chỉnh sửa launcher hoặc cấu hình dự án.

Model được Ollama quản lý trong kho model riêng, **không chép vào `ai-service` và không đưa lên Git**. Mặc định Windows là `%USERPROFILE%\.ollama\models`; có thể khác nếu server dùng `OLLAMA_MODELS` hoặc tài khoản khác. Xem https://docs.ollama.com/faq#where-are-models-stored.

## Trạng thái, dung lượng và lỗi

- `PRESENT`: đã có đúng model/tag, bỏ qua. Không gọi `pull` để cập nhật tag đã có.
- `MISSING`: chưa có. Tên không tag tương đương `:latest`; tag khác không được dùng thay thế.
- `VERIFIED`: đọc lại `/api/tags` thấy model sau khi tải.
- Exit code `0`: đủ model; `1`: thiếu model/check thất bại/tải lỗi; `2`: người dùng từ chối tải.
- `-CheckOnly` luôn ưu tiên hơn `-Yes`, không thay đổi dịch vụ hoặc model.
- Nếu server có sẵn thì dùng lại. Nếu API chưa sẵn sàng nhưng đã có tiến trình Ollama hoặc listener tại cổng đó, script dừng để tránh khởi động trùng. Với server từ xa/HTTPS, tự khởi động server đó trước.
- Trước khi tải, script báo dung lượng trống ước tính của ổ chứa model trên máy local khi xác định được, cảnh báo nếu dưới 1 GiB. API danh sách không cho biết dung lượng chính xác của model chưa tải: script cảnh báo giới hạn này, không giả định kích thước tải hay bảo đảm đủ dung lượng. Server đang chạy có thể sử dụng kho khác terminal.
- Lỗi CLI được phân loại mạng/DNS/proxy/TLS, thiếu dung lượng hoặc model/tag không tồn tại; output thô không được ghi ra terminal. Kiểm tra log Ollama tại máy nếu cần chi tiết. Không tự thay phiên bản, xóa model hoặc gọi `ollama rm`.
- Đủ model không đồng nghĩa kiểm tra xong GPU/RAM, Python dependencies, DB hoặc chất lượng sinh câu hỏi. Không thay đổi prompt, pipeline hoặc embedding.

## Test tự động bằng mock

```powershell
powershell -NoProfile -Command "Import-Module Pester; Invoke-Pester -Script .\scripts\tests\setup-models.Tests.ps1 -EnableExit"
```

Test không tải model, không chạy `ollama serve`, không đụng kho model thật. Bao gồm thiếu CLI, server tắt, server đang chạy/chưa sẵn sàng, đủ model, thiếu từng model, tải lỗi mạng và chạy lại, từ chối, CheckOnly, Yes, xác minh sau tải và đọc cấu hình.

Nếu Windows báo `running scripts is disabled`, có thể cho phép script đã kiểm tra trong một process duy nhất, không đổi execution policy hệ thống:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\setup-models.ps1 -CheckOnly
```

Bỏ `-CheckOnly` để chạy setup có hỏi xác nhận. Với test, thêm `-ExecutionPolicy Bypass` vào lệnh `powershell` phía trên nếu cần.
