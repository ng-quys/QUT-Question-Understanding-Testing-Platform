# QUT — Question Understanding Testing Platform

**Hệ thống quản lý thi trắc nghiệm trực tuyến tích hợp AI.**

QUT hỗ trợ giảng viên quản lý ngân hàng câu hỏi, xây dựng đề và tổ chức ca thi; sinh viên tham gia thi, lưu đáp án, nộp bài và xem kết quả. AI được sử dụng để hỗ trợ sinh câu hỏi và thử nghiệm giám sát trong quá trình làm bài. Giao diện hiện sử dụng tên **ExamFlow**.

> README này mô tả bản tích hợp trên nền Uyen, sử dụng Keycloak và mã tham gia theo từng ca thi. Chức năng có trong mã nguồn cần được kiểm thử với database, cấu hình và model thực tế trước khi xác nhận sẵn sàng sử dụng.

## Mục lục

- [Chức năng và vai trò](#chức-năng-và-vai-trò)
- [Công nghệ](#công-nghệ)
- [Cấu trúc dự án](#cấu-trúc-dự-án)
- [Yêu cầu môi trường](#yêu-cầu-môi-trường)
- [Cài đặt và cấu hình](#cài-đặt-và-cấu-hình)
- [Chạy hệ thống](#chạy-hệ-thống)
- [Quy tắc mã thi](#quy-tắc-mã-thi)
- [Kiểm tra sau khi cài](#kiểm-tra-sau-khi-cài)
- [Xử lý lỗi thường gặp](#xử-lý-lỗi-thường-gặp)
- [Quy trình làm việc nhóm](#quy-trình-làm-việc-nhóm)
- [Giới hạn hiện tại](#giới-hạn-hiện-tại)

## Chức năng và vai trò

| Vai trò | Phạm vi |
| --- | --- |
| Admin | Quản trị người dùng và các chức năng quản lý được cấp quyền trong bản triển khai. |
| Giảng viên | Quản lý môn học, ngân hàng câu hỏi, đề thi, ca thi và kết quả; xem xét câu hỏi do AI hỗ trợ tạo. |
| Sinh viên | Đăng nhập, cập nhật hồ sơ/ảnh tham chiếu, tìm ca thi bằng mã, làm bài, nộp bài và xem kết quả. |

Các nhóm chức năng chính:

- **Ngân hàng câu hỏi:** tổ chức câu hỏi theo môn học, chủ đề và các thông tin phân loại.
- **Đề thi và ca thi:** cấu hình đề, thời lượng, lịch thi và mã tham gia.
- **Thi trực tuyến:** lưu lựa chọn, tiếp tục bài làm còn hạn, nộp bài và chấm điểm.
- **Kết quả:** điểm số, số câu đúng và thông tin kết quả theo CLO trong các API hiện có.
- **AI hỗ trợ sinh câu hỏi:** cấu hình nhà cung cấp và khóa truy cập theo module đang sử dụng; giảng viên kiểm tra trước khi đưa câu hỏi vào đề.
- **Giám sát thử nghiệm:** sự kiện trình duyệt, nhận diện khuôn mặt/liveness, người/vật thể, hướng đầu, tương tác tay, âm thanh, tổng hợp rủi ro và lưu bằng chứng.

Keycloak quản lý đăng nhập và realm role. Backend tiếp tục kiểm tra quyền nghiệp vụ và quyền sở hữu bài làm; lựa chọn vai trò trên giao diện không thay thế kiểm tra quyền phía server.

## Công nghệ

| Thành phần | Công nghệ |
| --- | --- |
| Frontend | React, TypeScript, Vite, Tailwind CSS, React Router |
| Backend | Java, Spring Boot, Spring Security, Spring Data JPA, Maven Wrapper |
| Database | PostgreSQL; bản nhóm sử dụng Supabase |
| Xác thực | Keycloak, JWT |
| AI chống gian lận | Python, OpenCV, MediaPipe, ONNX Runtime, InsightFace, Ultralytics, SoundDevice, WebRTC VAD |
| Công cụ phát triển | Git, VS Code/IntelliJ IDEA, Postman |

Phiên bản dependency được khai báo tại `frontend/package.json`, `frontend/package-lock.json`, `backend/pom.xml` và `anticheating/requirements.txt`.

## Cấu trúc dự án

| Đường dẫn | Nội dung |
| --- | --- |
| `frontend/src/app/` | Điểm tích hợp ứng dụng và route. |
| `frontend/src/features/` | Các module giao diện, gồm auth, student, exams, sessions và ngân hàng câu hỏi. |
| `frontend/src/services/` | API dùng chung và kết nối Keycloak. |
| `backend/src/main/java/com/examflow/backend/` | Controller, service, DTO, entity, repository và cấu hình bảo mật. |
| `backend/src/main/resources/application.properties` | Cấu hình backend theo môi trường. |
| `anticheating/app/` | HTTP service, pipeline tích hợp và trạng thái runtime. |
| `anticheating/src/` | Các module xử lý AI, tổng hợp rủi ro và ghi bằng chứng. |
| `anticheating/models/` | Model AI cần cung cấp riêng. |
| `anticheating/student-profiles/` | Ảnh tham chiếu theo ID sinh viên trong database. |
| `anticheating/evidence/` | Bằng chứng được tạo khi chạy. |
| `anticheating/runtime/` | Trạng thái tiến trình AI. |

Các thư mục model, ảnh và runtime có thể chưa tồn tại ngay sau khi clone. SQL bổ sung schema chống gian lận phải được lưu cùng repo khi nhóm đưa các gói tích hợp vào mã nguồn.

## Yêu cầu môi trường

- Git.
- Node.js đáp ứng trường `engines` của Vite trong lockfile; bản Vite trong lockfile yêu cầu Node.js `^20.19.0` hoặc `>=22.12.0`.
- JDK 17 trở lên, phù hợp với `backend/pom.xml`; cấu hình `JAVA_HOME` nếu Maven Wrapper không tìm được Java.
- Python 3.10 hoặc 3.11 cho môi trường AI đã hướng dẫn; dùng virtual environment riêng.
- PostgreSQL/Supabase với schema của dự án và thông tin kết nối hợp lệ.
- Keycloak với realm và client của nhóm.
- Webcam, micro và các model AI để chạy thử giám sát local.

Hướng dẫn bên dưới dùng **PowerShell trên Windows**. Maven Wrapper đã có trong backend nên không cần cài Maven riêng. InsightFace 0.7.3 có thể cần Microsoft C++ Build Tools khi pip biên dịch từ source.

## Cài đặt và cấu hình

### 1. Clone repository

```powershell
git clone https://github.com/ng-quys/QUT-Question-Understanding-Testing-Platform.git
cd QUT-Question-Understanding-Testing-Platform
```

Nếu bản tích hợp còn nằm trên nhánh `ghep-sinh-vien`, chuyển sang nhánh đó trước khi cài:

```powershell
git switch ghep-sinh-vien
```

### 2. Chuẩn bị database

Sử dụng database nhóm đã cấu hình, hoặc tạo database PostgreSQL riêng và nhập **schema/seed chính thức của nhóm**. Các SQL bổ sung chống gian lận không thay thế schema ban đầu của toàn hệ thống.

Trong `backend/src/main/resources/application.properties`, cấu hình:

```properties
server.port=8080
spring.datasource.url=jdbc:postgresql://YOUR_DB_HOST:5432/YOUR_DB_NAME?sslmode=require
spring.datasource.username=YOUR_DB_USERNAME
spring.datasource.password=YOUR_DB_PASSWORD
spring.jpa.hibernate.ddl-auto=validate
```

Thay các giá trị `YOUR_...` bằng cấu hình local. URL và chế độ SSL phải phù hợp với database thực tế. Backend hiện dùng `validate`, vì vậy nó kiểm tra schema thay vì tự tạo các bảng còn thiếu.

Áp dụng SQL bổ sung `anti_cheat_events` của bản tích hợp nếu bảng/cột chưa có. Không chạy lại mọi script seed hay script cập nhật mã ca thi khi chưa đối chiếu dữ liệu.

### 3. Cấu hình Keycloak

Khởi động Keycloak của nhóm tại `http://localhost:8081`. Nếu sử dụng Docker, chạy cấu hình Docker hiện có của nhóm và giữ database/volume của Keycloak để tài khoản không mất khi tạo lại container.

| Cấu hình | Giá trị local |
| --- | --- |
| Realm | `online-exam-system` |
| Frontend client | `online-exam-frontend` |
| Backend client | `online-exam-backend` |
| Realm roles | `ADMIN`, `TEACHER`, `STUDENT` |

**Frontend client:** cấu hình client public, bật Direct Access Grants cho form email/password hiện tại; bật Standard Flow nếu dùng đăng nhập chuyển hướng. Redirect URI và Web Origins cần cho phép đúng địa chỉ frontend, ví dụ `http://localhost:5173/*` và `http://localhost:5173`.

**Backend client:** bật Client authentication và Service accounts roles; lấy client secret từ tab Credentials. Cấp các quyền quản lý user/đọc realm cần thiết cho service account để API đồng bộ user và gán role hoạt động. Không dùng client secret của backend trong frontend.

```properties
spring.security.oauth2.resourceserver.jwt.issuer-uri=http://localhost:8081/realms/online-exam-system
keycloak.server-url=http://localhost:8081
keycloak.realm=online-exam-system
keycloak.admin-client-id=online-exam-backend
keycloak.admin-client-secret=YOUR_BACKEND_CLIENT_SECRET
```

Khi tạo user, đặt mật khẩu, kiểm tra Enabled và gán role phù hợp. Nếu đăng nhập bằng email, bật Login with email. User có Required actions phải hoàn thành chúng qua luồng đăng nhập trình duyệt; mật khẩu tạm yêu cầu đổi ở lần đăng nhập đầu.

Nếu mỗi thành viên chạy Keycloak riêng, dữ liệu user không tự đồng bộ. Muốn dùng chung tài khoản, cả nhóm phải kết nối cùng một server/realm. Clone Git không sao chép database Keycloak.

### 4. Cài frontend

```powershell
cd frontend
npm ci
```

Nếu nhóm đã thay `package.json` nhưng chưa cập nhật lockfile, dùng `npm install`, kiểm tra thay đổi và commit lockfile tương ứng.

API mặc định là `http://localhost:8080/api`. Có thể đặt trong `frontend/.env.local`:

```dotenv
VITE_API_URL=http://localhost:8080/api
```

`VITE_API_URL` đã bao gồm `/api`. Khởi động lại Vite sau khi đổi biến môi trường. Các biến `VITE_*` được đưa vào mã frontend, vì vậy không dùng chúng để giữ secret backend hoặc khóa riêng tư.

Nếu đổi địa chỉ Keycloak, cập nhật cấu hình trong `frontend/src/services/keycloak.ts` và `frontend/src/features/auth/services/authService.ts`, đồng thời chỉnh issuer/backend và client settings để chúng cùng trỏ tới một realm.

### 5. Cài dịch vụ AI

Mở terminal ở **gốc repo**:

```powershell
cd anticheating
py -0p
py -3.10 -m venv .venv
```

Có Python 3.11 thì thay `-3.10` bằng `-3.11`. Chỉ chạy các lệnh tiếp theo sau khi tạo `.venv` thành công:

```powershell
.\.venv\Scripts\python.exe -m pip install --upgrade pip setuptools wheel
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe configure_local.py
```

`configure_local.py` tạo secret chung cho Python/Java, ghi `anticheating/.env` và cập nhật ba thuộc tính chống gian lận trong `application.properties`. Script cũng thống nhất thư mục ảnh; cần khởi động lại backend sau khi chạy. Nếu ảnh cũ ở nơi khác, chép chúng vào thư mục mới hoặc upload lại từ Hồ sơ sinh viên.

### 6. Chuẩn bị model và ảnh tham chiếu

Model không nằm trong các gói source đã chuyển. Lấy model từ bản chống gian lận đã chạy được của nhóm, giữ đúng tên và vị trí:

| Model | Đường dẫn dưới `anticheating/` |
| --- | --- |
| Phát hiện khuôn mặt | `models/identity/buffalo_l/det_10g.onnx` |
| Landmark khuôn mặt | `models/identity/buffalo_l/1k3d68.onnx` |
| Đặc trưng khuôn mặt | `models/identity/buffalo_l/w600k_r50.onnx` |
| Liveness | `models/liveness/MiniFASNetV2.onnx` |
| Phát hiện người | `models/person/yolo11s.pt` |
| Landmark bàn tay | `models/hands/hand_landmarker.task` |
| Vật thể tùy chỉnh | `models/objects/best.pt` |

Không thay model vật thể tùy chỉnh bằng một file bất kỳ cùng tên. `copy_models_from_old.bat` mặc định lấy từ `D:\AntiCheating2`; chỉnh đường dẫn nguồn nếu máy lưu ở nơi khác.

```powershell
.\.venv\Scripts\python.exe check_models.py
```

Lệnh này kiểm tra file tồn tại và không rỗng; chất lượng và khả năng tải model cần kiểm tra lúc pipeline chạy thật. Sinh viên upload ảnh JPG/PNG trong Hồ sơ; ảnh tham chiếu được lưu theo **ID số trong database**, dạng `student-profiles/<studentId>.jpg`.

## Chạy hệ thống

Mở các terminal riêng. Giữ **Keycloak, backend, frontend và Python** cùng hoạt động khi thử thi có AI.

| Dịch vụ | Địa chỉ mặc định |
| --- | --- |
| Frontend | `http://localhost:5173` |
| Backend API | `http://localhost:8080/api` |
| Keycloak | `http://localhost:8081` |
| Anti-Cheating HTTP service | `http://127.0.0.1:8000` |
| Browser bridge nội bộ | `http://127.0.0.1:8765` — pipeline tự quản lý |

**Terminal backend**, tại thư mục `backend`:

```powershell
.\mvnw.cmd spring-boot:run
```

**Terminal Python**, tại thư mục `anticheating`:

```powershell
.\.venv\Scripts\python.exe app\run_service.py
```

Kiểm tra Python bằng một terminal khác:

```powershell
Invoke-RestMethod http://127.0.0.1:8000/health
```

Chưa có bài thi thì `status=idle`, `running=false`, `ready=false` là bình thường. Health endpoint hoạt động chưa chứng minh camera/model đã sẵn sàng; pipeline khởi động khi backend gọi bắt đầu bài.

**Terminal frontend**, tại thư mục `frontend`:

```powershell
npm run dev
```

Mở URL Vite hiển thị. Nếu cổng đổi sang 5174, cấu hình Keycloak/CORS phải cho phép địa chỉ đó.

## Quy tắc mã thi

| Trường database | Mục đích |
| --- | --- |
| `exams.code` | Nhận diện và quản lý đề thi. |
| `exam_sessions.room_code` | Mã sinh viên dùng để tìm và tham gia đúng ca. |
| `exam_sessions.access_code` | Mật khẩu ca thi nếu được cấu hình riêng. |

Tìm thi, tham gia, bắt đầu thi và link/QR dùng **`room_code`**. Nếu `access_code` trống hoặc giống `room_code`, bản tích hợp chỉ yêu cầu một mã. Nếu khác, giao diện hỏi thêm mật khẩu và backend kiểm tra trước khi bắt đầu.

Một đề có thể có nhiều ca, nên không dùng mã đề để chọn thay cho mã ca. Ca phải ở trạng thái nhận người tham gia và nằm trong thời gian cho phép. Nếu cần giới hạn theo lớp, phải kiểm tra/bổ sung quy tắc danh sách sinh viên; biết mã không tự chứng minh thuộc lớp được phép thi.

## Kiểm tra sau khi cài

**Build:**

```powershell
# Chạy tại backend
.\mvnw.cmd -DskipTests compile

# Chạy tại frontend
npm run build
npm run lint
```

`-DskipTests compile` chỉ kiểm tra biên dịch Java. Build frontend không thay thế kiểm tra API. Chạy kiểm thử runtime Python tại `anticheating`:

```powershell
.\.venv\Scripts\python.exe -m unittest discover -s tests -v
```

Các test runtime dùng tiến trình giả để kiểm tra handshake/trạng thái, secret, thiếu model/ảnh, timeout và dừng phiên; không xác nhận độ chính xác AI hoặc webcam/micro thật.

**Luồng kiểm tra thực tế:**

1. Đăng nhập giảng viên; xem môn học, ngân hàng câu hỏi, đề và ca thi.
2. Đăng nhập sinh viên; mở dashboard và hồ sơ, upload ảnh tham chiếu.
3. Tìm mã ca hợp lệ; thử mã sai và ca chưa tới giờ.
4. Bắt đầu bài; API start trả 200, AI báo `ready`.
5. Chọn đáp án, kiểm tra lưu; thử tiếp tục bài làm còn hạn.
6. Chuyển tab/thoát fullscreen; xác nhận sự kiện lưu đúng `attempt_id`.
7. Nộp bài, xem điểm và xác nhận AI dừng; bài đã nộp không được làm lại ca đó.

Thử trên ca test: frontend hiện có cơ chế tự nộp sau ba lần cảnh báo. Xem bằng chứng trong `anti_cheat_events` và thư mục evidence; một dòng `active=false` đánh dấu sự kiện kết thúc, không phải thêm một lần vi phạm.

## Xử lý lỗi thường gặp

| Lỗi | Kiểm tra |
| --- | --- |
| `No suitable Python runtime found` | Dùng `py -0p`, tạo venv bằng phiên bản đã cài. |
| Không tìm thấy `.venv\Scripts\python.exe` | Venv chưa tạo thành công hoặc terminal đang sai thư mục. |
| `Account is not fully set up` | Hoàn thành Required actions và yêu cầu mật khẩu tạm trong Keycloak. |
| `Invalid client or Invalid client credentials` | Backend client ID/secret, Client authentication và service account. |
| API `/teacher/**` hoặc `/student/**` trả 403 | Role trong token, converter và tài khoản đang dùng; đăng xuất/đăng nhập lại sau đổi role. |
| API `sync-user` trả 500 | Đọc log Java; kiểm tra database và quyền service account Keycloak. |
| Không tìm thấy ca thi | Đúng `room_code`, đúng database, có ca ở trạng thái nhận người tham gia. |
| Start trả 502, không kết nối Python | Python chưa chạy, sai URL/cổng hoặc tiến trình đã dừng; kiểm tra `/health`. |
| Thiếu ảnh/model, AI không ready | Thư mục ảnh đúng ID, bảy model, webcam/micro và log Python. |
| Callback AI trả 401/403 | Secret hai bên và rule POST chính xác cho `/api/internal/anticheating/events`. |
| Lỗi schema khi Java khởi động | Đối chiếu migration với schema; không đổi `ddl-auto` để xóa/tạo lại dữ liệu. |

Form đăng nhập hiện có thể hiển thị thông báo sai email/mật khẩu cho lỗi xảy ra sau xác thực. Dùng Network và log backend để xác định API thực sự bị lỗi. Không chia sẻ password, client secret hoặc access token khi chụp log.

Đăng nhập các tài khoản khác nhau trong cùng profile trình duyệt có thể thay token dùng chung giữa các tab. Khi thử đồng thời giảng viên/sinh viên, dùng hai profile hoặc hai trình duyệt riêng.

## Quy trình làm việc nhóm

- `main`: bản tích hợp của nhóm; cập nhật qua Pull Request.
- Nhánh cá nhân: phát triển theo phần được phân công.
- `ghep-sinh-vien`: nhánh tích hợp sinh viên và chống gian lận trong đợt này.

Ví dụ tạo nhánh và đẩy thay đổi:

```powershell
git switch main
git pull --ff-only origin main
git switch -c feature/ten-chuc-nang
# Chỉnh sửa, chạy kiểm tra rồi chọn các file cần commit
git add DUONG_DAN_FILE
git commit -m "Mo ta thay doi"
git push -u origin feature/ten-chuc-nang
```

Tạo Pull Request với base `main`, xem Files changed và xử lý conflict trước khi merge. Khi database thay đổi, gửi SQL/migration và hướng dẫn áp dụng cùng PR. **Git không tự đồng bộ database, tài khoản Keycloak, model hoặc virtual environment.**

Không đưa `.env`, secret thật, `.venv`, `node_modules`, model nặng, ảnh sinh viên, evidence hoặc runtime lên Git. Nếu secret đã xuất hiện trong lịch sử repo, cần đổi secret; xóa khỏi file hiện tại không xóa bản cũ trong lịch sử.

## Giới hạn hiện tại

- Python dùng webcam và micro của **máy chạy dịch vụ**, chưa nhận luồng camera/audio từ trình duyệt trên máy sinh viên khác.
- Một service local chỉ hỗ trợ **một phiên AI đồng thời**. Deploy Java/Keycloak lên cloud không tự biến nó thành giám sát nhiều sinh viên.
- Cơ chế cảnh báo/tự nộp hiện nằm phía frontend; chưa nên coi đây là biện pháp cưỡng chế đầy đủ phía server.
- Clipboard/right-click hiện được frontend chặn; chưa mặc định ghi đủ mọi thao tác đó vào database.
- Sự kiện và điểm rủi ro là tín hiệu hỗ trợ xem xét, không tự chứng minh sinh viên gian lận. Chất lượng phụ thuộc model, ánh sáng, góc camera và môi trường âm thanh.
- Bản local cần được kiểm thử trọn luồng trên cấu hình nhóm; chưa có cam kết sẵn sàng triển khai production.

## Tài liệu liên quan

- [Spring Boot](https://docs.spring.io/spring-boot/)
- [Keycloak Server Administration](https://www.keycloak.org/documentation)
- [Vite](https://vite.dev/guide/)
- [MediaPipe Python](https://ai.google.dev/edge/mediapipe/solutions/setup_python)

Repo chưa được README này cấp thêm giấy phép sử dụng. Việc chia sẻ source và model cần tuân theo giấy phép tương ứng và thống nhất của nhóm.
