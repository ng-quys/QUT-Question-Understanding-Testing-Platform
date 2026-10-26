# Hai frontend, một backend

## Cấu trúc

- `frontend`: đăng nhập và giao diện giảng viên/sinh viên, cổng **5173**.
- `frontend-admin`: đăng nhập và giao diện quản trị, cổng **5174**. Mở `/` là vào khu vực admin; chưa đăng nhập sẽ chuyển đến `/login`.
- `frontend-shared`: mã dùng chung (phiên đăng nhập, API, theme, giám sát, bằng chứng). Đây là thư viện nguồn, không phải dịch vụ thứ ba.
- `backend`: giữ nguyên nghiệp vụ và phân quyền API, dùng chung Supabase. Không có backend admin thứ hai.

## Chạy trên máy cá nhân

Cài Node.js theo yêu cầu hiện có. Chạy **tại thư mục gốc**:

```powershell
npm ci
```

Sau đó dùng `CHAY_QUT.bat` như trước. Trình chạy khởi động cả hai frontend và in đúng hai địa chỉ:

- Sinh viên/giảng viên: `http://localhost:5173`
- Admin: `http://localhost:5174`

`DUNG_QUT.bat` dừng cả hai frontend do trình chạy tạo. Trình chạy không dừng dịch vụ khác đang chiếm cổng.

Nếu cần chạy từng frontend, mở các terminal tại thư mục gốc:

```powershell
npm run dev:portal
```

```powershell
npm run dev:admin
```

Backend vẫn chạy một lần trên cổng 8080. Cấu hình AI Credits Worker trên từng máy được giữ nguyên; hai frontend không khởi động thêm model hay worker.

Khi vừa cập nhật cấu trúc, dừng và chạy lại các frontend để Vite nhận cấu hình/package mới. Khởi động lại backend một lần để áp dụng đầy đủ cấu hình CORS mới, đặc biệt nếu dùng địa chỉ `127.0.0.1` hoặc đổi sang tên miền triển khai. Không cần đổi mật khẩu hay chuyển dữ liệu Supabase.

## Đăng nhập và địa chỉ cũ

Hai địa chỉ có phiên đăng nhập riêng theo origin của trình duyệt. Không chia sẻ token qua URL hay sao chép token giữa hai cổng.

- Admin đăng nhập tại cổng 5174, đăng xuất về `/login` của cổng 5174.
- Sinh viên/giảng viên tiếp tục tại cổng 5173.
- Bookmark `http://localhost:5173/admin` và `/admin/login` được chuyển sang cổng admin. Bản production dùng `VITE_ADMIN_URL` để biết địa chỉ mới.
- Link “Đăng nhập sinh viên / giảng viên” trong admin dùng `VITE_PORTAL_URL`.
- Quyền admin vẫn được backend kiểm tra; truy cập giao diện admin không cấp thêm quyền API.

Mẫu cấu hình công khai ở `frontend/.env.example` và `frontend-admin/.env.example`. Giữ file `.env.local` và `.env.production` riêng trên máy; không commit bí mật. Các biến `VITE_*` là công khai.

## Build và kiểm tra

Tại thư mục gốc:

```powershell
npm run build
```

Hai kết quả độc lập:

- `frontend/dist`
- `frontend-admin/dist`

Kiểm thử frontend:

```powershell
npm run test:frontend
```

Chỉ có một `package-lock.json` tại gốc cho toàn bộ npm workspaces. Cài ở gốc để tránh hai bản React khác nhau.

## Triển khai

Build từ gốc repository, không chỉ tải riêng một thư mục frontend: mỗi ứng dụng cần `frontend-shared` và lockfile gốc trong giai đoạn build. Khi triển khai file tĩnh, chỉ cần tải `dist` của ứng dụng tương ứng.

Ví dụ `frontend/.env.production`:

```dotenv
VITE_API_URL=/api
VITE_ADMIN_URL=https://admin.example.com
```

Ví dụ `frontend-admin/.env.production`:

```dotenv
VITE_API_URL=/api
VITE_PORTAL_URL=https://app.example.com
```

Các giá trị này được đưa vào bundle lúc build: thay đổi thì build lại. Dùng hai site tĩnh độc lập trên Vercel/Netlify cũng được, nhưng phải cấu hình SPA fallback về `index.html` và proxy `/api` sang backend hoặc đặt `VITE_API_URL` là URL HTTPS của backend.

Backend cho phép hai origin qua biến môi trường:

```dotenv
APP_CORS_ALLOWED_ORIGINS=https://app.example.com,https://admin.example.com
```

Mặc định local cho phép `localhost`/`127.0.0.1` ở hai cổng 5173/5174. Không dùng `*` cho môi trường thật. Các API vẫn yêu cầu token và đúng vai trò.

Mẫu `deploy/Caddyfile` triển khai hai site trên cùng máy chủ, dùng chung backend `127.0.0.1:8080`, proxy `/api` và SPA fallback. Đặt `PORTAL_HOST`, `ADMIN_HOST`, `PORTAL_DIST`, `ADMIN_DIST` trên máy triển khai. DNS phải trỏ đúng và mở 80/443 để Caddy cấp HTTPS. Camera/micro khi thi trên Internet cần HTTPS.

Chưa có thay đổi nào được triển khai lên server thật bởi việc tách này. Trước khi phát hành, test đăng nhập/đăng xuất, quản lý đề/ca thi, sinh viên làm bài/nộp bài và khôi phục khi mất kết nối trên hai tên miền thực tế.
