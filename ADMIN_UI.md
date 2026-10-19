# Bàn giao giao diện quản trị

Đã hoàn thiện giao diện trong phân hệ admin hiện có. Các màn hình sản phẩm tiếp tục gọi API thực tế của dự án; dữ liệu giả chỉ nằm trong `frontend/tests/` phục vụ kiểm tra giao diện, không được đưa vào entry build sản phẩm.

## Nội dung cập nhật

- Đồng bộ font Inter với font dự phòng hỗ trợ tiếng Việt; mã ca/đề dùng monospace, số liệu dùng chữ số thẳng hàng. Menu xanh navy, nền sáng, bảng và hộp thoại cùng một hệ màu/khoảng cách.
- Trang đăng nhập quản trị dùng biểu mẫu tập trung trên nền sáng, logo nhỏ và hướng dẫn ngắn; có hiện/ẩn mật khẩu, báo Caps Lock, trạng thái chờ và lỗi. Giữ luồng kiểm tra quyền quản trị của backend.
- Tổng quan: ngày cập nhật, thống kê, biểu đồ, trạng thái AI và lối tắt; ưu tiên số liệu và thao tác. Cột biểu đồ có số lượng 0 không tạo chiều cao giả; số liệu cần chú ý dẫn tới danh sách cảnh báo.
- Tài khoản: bảng, phân trang, lọc và thao tác rõ ràng; bộ lọc đang dùng có nhãn để bỏ riêng từng điều kiện.
- Học phần/đề thi: thêm hộp xem chi tiết từ dữ liệu API của danh sách; đi tiếp tới đề hoặc ca theo học phần.
- Giám sát: tùy chọn tự tải lại mỗi 15 giây khi trang đang hiển thị. Tạm dừng khi mở hộp thoại, xuất dữ liệu hoặc chuyển màn hình. Có giờ cập nhật thực tế.
- Ca thi: hộp thoại rộng, cuộn bên trong, hiển thị lỗi thay đổi trạng thái mà vẫn giữ dữ liệu ca thi để xem xét tiếp.
- Lượt thi: giữ phần đánh giá và ảnh bằng chứng; kiểm tra đóng ảnh bằng Escape vẫn giữ hộp lượt thi phía dưới.
- CSV: hỗ trợ UTF-8/BOM, dấu phẩy trong ô, dấu nháy kép, xuống dòng trong ô và dấu chấm phẩy; kiểm tra tiêu đề, trùng tên/email, vai trò, mật khẩu và giới hạn 500 tài khoản / 2 MB. Lỗi chỉ rõ số dòng; tất cả lỗi phải được sửa trước khi tạo tài khoản. Không tự dùng mật khẩu chung cho ô bị bỏ trống. Khi nhập một phần thất bại, chỉ thử lại các tài khoản chưa thành công; giữ kết quả tại hộp thoại để đọc.
- Trạng thái lỗi tải bảng ẩn hàng dữ liệu cũ và khóa phân trang; trạng thái đang tải/rỗng/có dữ liệu phân biệt rõ.
- Mobile: menu dạng ngăn trượt, Escape để đóng, giữ tiêu điểm trong menu, khóa cuộn nền và trả tiêu điểm về nút mở menu; bảng cuộn ngang trong vùng riêng. Hộp thoại cuộn nội dung, không tràn trang; ô nhập cỡ chữ 16 px trên điện thoại.
- Nhật ký có nhãn hành động/đối tượng tiếng Việt; giữ mã gốc trong tooltip. Xuất CSV có trạng thái tiến độ và nút hủy.

## Kiểm tra đã thực hiện

- `npm run build`: đạt. Còn cảnh báo bundle lớn của build toàn dự án.
- `node --test tests/admin-import.test.mjs` (chạy trong `frontend/`): 8/8 đạt.
- ESLint cho các file mới `adminCsv.ts`, `AdminResourceDialog.tsx`, `adminAccessibility.ts` và trang đăng nhập: đạt.
- Trình duyệt, dữ liệu giả: tổng quan, tài khoản, phân trang, lọc trạng thái, bỏ nhãn lọc, phím mũi tên chuyển tab; lỗi tải ẩn hàng cũ; chi tiết học phần → đề theo bộ lọc; chi tiết ca thi và lỗi thay đổi trạng thái; chi tiết lượt thi và ảnh lồng nhau; CSV sai bị chặn, CSV hợp lệ có dấu phẩy được đọc đúng, nhập một phần rồi thử lại chỉ 1 tài khoản lỗi (tổng 3 request cho 2 tài khoản thử).
- Kiểm tra bố cục desktop 1280 px và điện thoại 390 px; menu ẩn/hiện, khóa cuộn và tiêu điểm, chiều rộng hộp thoại, ảnh bằng chứng và trang đăng nhập.

Đây là kiểm tra giao diện và logic trình duyệt bằng API giả lập tách biệt. Không thực hiện tạo tài khoản, đặt lại mật khẩu, hủy ca hay thay đổi điểm trên hệ thống thật. Luồng Supabase thật vẫn cần cấu hình và kiểm tra theo `SUPABASE_EVIDENCE.md`.

## Xem trong ứng dụng

Chạy `CHAY_QUT.bat`, đăng nhập bằng tài khoản quản trị đã có. Nếu website đã chạy, tải lại trang bằng Ctrl+F5 để nhận giao diện mới. Các phần này không yêu cầu migration database mới.

Nếu muốn kiểm tra UI độc lập, chạy `npm run dev` trong `frontend/`, mở `/tests/admin.html` hoặc `/tests/admin-login.html`. Đây là các trang kiểm thử có dữ liệu giả; không nhập thông tin đăng nhập thật vào fixture đăng nhập.

## File thuộc thay đổi này

- `frontend/src/features/admin/styles/admin.css`.
- `frontend/src/features/admin/pages/AdminLoginPage.tsx`.
- Components: `AdminWorkspace.tsx`, `AdminOverview.tsx`, `AdminUI.tsx`, `AdminAccountDialog.tsx`, `AdminSessionDialog.tsx`, `AdminImportDialog.tsx`, `AdminAttemptDialog.tsx`, `adminConfig.tsx`; thêm `AdminResourceDialog.tsx`, `adminAccessibility.ts`.
- Services: thêm `adminCsv.ts`; nối API bằng chứng sẵn có vào `adminWorkspaceApi.ts` để toàn bộ dữ liệu của hộp lượt thi dùng chung nguồn API được cấp cho workspace.
- Kiểm tra riêng: `frontend/tests/admin-import.test.mjs`, `admin.html`, `admin-fixture.tsx`, `admin-login.html`, `admin-login-fixture.tsx`, `fixtures/admin-valid.csv`, `fixtures/admin-invalid.csv`.

Các thay đổi chưa commit trước đó được giữ lại. Bản sao trước khi chỉnh giao diện nằm trong `.qut-run/admin-ui-before-20261016/` trên máy này để đối chiếu, không được đưa vào Git.

## Cập nhật bố cục đăng nhập và sidebar

- Trang đăng nhập có hai phần trên desktop: minh họa khảo thí bằng CSS/icon và biểu mẫu. Điện thoại chỉ hiển thị biểu mẫu để giữ chỗ nhập liệu rõ ràng.
- Nút ngay bên phải logo ExamFlow trong sidebar thu từ 248 px xuống 76 px hoặc mở rộng lại. Khi thu gọn, nút mở rộng nằm dưới biểu tượng E; tất cả mục con vẫn truy cập được bằng biểu tượng có nhãn hỗ trợ và tooltip. Trình duyệt ghi nhớ lựa chọn qua khóa `examflow.admin.sidebarCollapsed`; việc chặn localStorage không làm hỏng menu.
- Ở màn hình tối đa 1024 px, sidebar vẫn dùng menu trượt đầy đủ, độc lập với lựa chọn thu gọn desktop.
- Đã build frontend thành công; kiểm tra trình duyệt bằng fixture: đăng nhập 1920 px và 390 px (không tràn ngang), thu/mở sidebar, vào Học phần khi thu gọn, giữ trạng thái sau tải lại, mở/đóng menu điện thoại 390 px. Không kiểm thử đăng nhập thật trong lần chỉnh bố cục này.

## Cập nhật quản lý danh mục admin (16/10/2026)

Chỉ sửa UI admin, API admin và kiểm thử liên quan. Không sửa màn hình hay API sinh viên/giảng viên. Luồng tạo đề của admin gọi lại dịch vụ tạo đề có sẵn, không sao chép thuật toán chọn câu hỏi.

- Ca thi dùng một nhãn **Mã ca thi** trong bảng, chi tiết, biểu mẫu và CSV; bỏ hiển thị riêng mã tham gia. Ca mới ghi cùng một mã vào `room_code` và `access_code` để tương thích luồng vào thi hiện có. Không đổi mã dữ liệu cũ hàng loạt.
- Học phần: thêm/sửa mã, tên, tín chỉ, khoa, mô tả, trạng thái và giảng viên phụ trách; chi tiết hiển thị các trường này. Đổi giảng viên là thay đổi người quản lý nội dung/lượt thi của học phần. Chặn sửa khi học phần có bài đang làm; chỉ xóa học phần chưa có nội dung hay dữ liệu phụ thuộc.
- Đề thi: tạo đề nháp thật từ câu hỏi đã duyệt, chọn số câu, tỷ lệ độ khó, giới hạn trùng đề, trộn câu/đáp án và giám sát AI. Báo lỗi nếu ngân hàng không đáp ứng. Sửa thông tin và xóa chỉ áp dụng đề nháp chưa có ca/bài làm; xóa các liên kết đề, giữ nguyên ngân hàng câu hỏi.
- Ca thi: thêm tên, mã, đề có câu hỏi, lớp tùy chọn và thời gian Việt Nam; mã bỏ trống được sinh tự động. Chỉ sửa ca chưa bắt đầu/chưa có bài làm, không đổi đề của ca đã tạo. Chỉ xóa ca chưa bắt đầu hoặc đã hủy, không có đăng ký/bài làm. Trạng thái/ngày của đề được đồng bộ theo các ca còn lại khi tạo/sửa/xóa ca qua API này.
- Các thao tác ghi nhật ký; backend kiểm tra lại điều kiện ngay cả khi bỏ qua nút bị khóa trên UI. Xóa kiểm tra cả quan hệ khóa ngoại trong PostgreSQL để tránh vô tình xóa dây chuyền dữ liệu chưa lường trước.
- Tài khoản tiếp tục dùng thêm/sửa/khóa/mở khóa/đặt lại mật khẩu/nhập CSV sẵn có. Không thêm xóa vĩnh viễn tài khoản, bài làm, cảnh báo hay nhật ký; các dữ liệu này cần giữ lịch sử. Báo cáo là dữ liệu tổng hợp, không có CRUD riêng.

API mới chỉ admin: `GET /api/admin/catalog/options`, `GET /api/admin/catalog/{courses|exams|sessions}/{id}`, `POST /api/admin/catalog/{courses|exams|sessions}`, `PUT /api/admin/catalog/{courses|exams|sessions}/{id}`, `DELETE /api/admin/catalog/{courses|exams|sessions}/{id}`. Không thêm migration; dùng schema hiện có (bao gồm migration admin 006 đã triển khai trước đó).

Kiểm tra lần cập nhật này:

- Build frontend và ESLint các file admin/fixture đã sửa: đạt (build còn cảnh báo bundle lớn có sẵn).
- 17 kiểm thử service và 5 kiểm thử HTTP: đạt; gồm phân quyền anonymous/student/teacher/admin, validation, mã trùng, dữ liệu đã sử dụng, thời gian ca, ghi nhật ký và giữ ngân hàng câu hỏi.
- 4 kiểm thử tích hợp với PostgreSQL 17 Docker tạm: đạt; tạo/sửa/xóa học phần, tạo đề bằng thuật toán thật, tạo/sửa/xóa ca, kiểm tra mã hai cột thống nhất, đồng bộ trạng thái đề, bảo toàn câu hỏi và chặn khóa ngoại có ON DELETE CASCADE. Không kết nối Supabase trong các test này; container tự dừng, không gắn volume dữ liệu dự án.
- Trình duyệt bằng fixture: thêm/sửa/xóa học phần; sửa/xóa ca; tạo/sửa/xóa đề; chặn tỷ lệ độ khó sai; lỗi lưu giữ biểu mẫu và thử lại thành công; nút khóa cho dữ liệu đã sử dụng. Biểu mẫu 390 px cuộn trong hộp thoại, giữ nút lưu nhìn thấy. Tạo/sửa thời gian ca được kiểm tra ở backend/PostgreSQL; thao tác nhập datetime bằng công cụ trình duyệt chưa xác minh được đầy đủ.
- Chưa chạy thao tác CRUD bằng tài khoản Keycloak trên Supabase thật. Không tự sửa hoặc xóa dữ liệu đang sử dụng của người dùng để kiểm thử.

Chạy lại kiểm thử trong `backend/` (cần Maven/JDK 17 và Docker cho bài PostgreSQL):

```powershell
mvn "-Dtest=AdminCatalogTests,AdminCatalogHttpSecurityTests,AdminCatalogPostgresTests" "-Dqut.catalog.postgres=true" test
```

Nếu không chạy Docker, bỏ `-Dqut.catalog.postgres=true`: bốn bài PostgreSQL được bỏ qua rõ ràng. Trong `frontend/`, chạy `npm run build` và kiểm tra fixture `/tests/admin.html` khi dev server hoạt động.

Để nhận API mới, dừng và khởi động lại backend bằng lệnh đang dùng, rồi Ctrl+F5 trang admin. Test thật nên tạo học phần trống → sửa → xóa; tạo đề trên học phần có câu hỏi đã duyệt → tạo ca trong tương lai → sửa → xóa ca → xóa đề nháp. Xác nhận đề có lịch sử không cho xóa và ngân hàng câu hỏi vẫn còn.

File chính: `AdminCatalogService.java`, `AdminCatalogController.java`, `AdminCatalogExceptionHandler.java`, `AdminWorkspaceService.java`; `AdminCatalogDialog.tsx`, `AdminWorkspace.tsx`, `AdminResourceDialog.tsx`, `AdminSessionDialog.tsx`, `adminConfig.tsx`, `adminWorkspaceApi.ts`, `admin.css`; ba lớp kiểm thử `AdminCatalogTests`, `AdminCatalogHttpSecurityTests`, `AdminCatalogPostgresTests` và `frontend/tests/admin-fixture.tsx`.


### Phần hoàn thiện sau khi tiếp tục

- Bộ lọc lượt thi/giám sát/báo cáo nhập **Mã ca thi** (không phân biệt hoa thường) thay cho ID nội bộ. Backend vẫn giữ tham số `sessionId` để tương thích, đồng thời hỗ trợ `sessionCode` cho cả list và report. CSV và danh sách bài thi hiển thị mã ca thực tế.
- API admin hủy/kết thúc ca khóa bản ghi và kiểm tra bài có trạng thái `in_progress`; còn bài đang làm thì trả 409, không thay đổi ca hay bài làm. Không tự nộp bài hoặc sửa điểm. Ca đã đóng không được mở lại qua API này; ca tương lai chỉ có thể hủy, không đánh dấu hoàn thành.
- Sau đổi trạng thái ca, trạng thái/ngày của đề được đồng bộ theo các ca còn lại. Nếu hủy hết ca chưa có bài làm thì đề trở lại nháp; vẫn giữ các ca đã hủy để tra cứu.
- Hộp chi tiết ghi rõ điều kiện hủy/kết thúc, thông báo dùng mã ca, đổi nhãn trống thành “Chưa có lượt làm bài” và nhãn khoa đúng nội dung.
- Kiểm tra bổ sung: 26/26 backend (17 service, 5 HTTP, 4 PostgreSQL), build và ESLint đạt. PostgreSQL xác nhận mã đúng/sai, báo cáo đúng phạm vi, chặn đóng ca có bài đang làm, giữ điểm bài đã nộp, chặn mở lại ca đã đóng, hủy ca tương lai và đồng bộ đề. Trình duyệt fixture xác nhận mã không tồn tại cho 0 kết quả, `web2401` khớp `WEB2401`, bỏ nhãn lọc xóa nội dung ô mã ca. Không thực hiện các thao tác này trên database Supabase thật.


## Cảnh báo theo ca thi — cập nhật 19/10/2026

Tab Ca thi có cảnh báo hiển thị từng ca có ít nhất một sự kiện active, gồm số sinh viên duy nhất và tổng sự kiện trình duyệt/AI. Không giới hạn ca đang diễn ra; ca đã kết thúc vẫn có thể xuất hiện nếu còn cảnh báo. Dữ liệu phân trang ở backend qua resource warning-sessions, không nhóm dữ liệu từ một trang lượt thi trên trình duyệt.

Xem sinh viên mở các lượt thi có cảnh báo trong đúng exam_session_id đã chọn; sinh viên không có cảnh báo không hiển thị ở danh sách này. Nút Xem mở luồng xem xét/bằng chứng hiện có. Có nút trở về danh sách ca; lọc, phân trang, xuất CSV và tự cập nhật giữ đúng phạm vi đang xem. Cảnh báo dùng nền vàng nhạt/chữ vàng nâu; màu trạng thái và nhãn thường giữ nguyên.

Không cần migration SQL mới. Khởi động lại backend/frontend để nhận resource và giao diện mới. Kiểm chứng: 29 kiểm thử PostgreSQL, build frontend và 27 test frontend đạt; ESLint hai component admin sửa đạt. Browser dùng fixture tổng hợp để đối chiếu ca → sinh viên, không thao tác dữ liệu Supabase thật.


## Biểu đồ kết quả — cập nhật 19/10/2026

Trang Tổng quan và Báo cáo dùng chung biểu đồ thang điểm 10, trục số bài và năm khoảng: [0,2), [2,4), [4,6), [6,8), [8,10]. Chọn cột bằng chuột, chạm hoặc Tab để xem số lượng và tỷ lệ; phần Cách đọc giải thích công thức và ranh giới. Mốc 5/10 là tham chiếu thống kê, không khẳng định quy định đạt môn của trường.

Tổng bài đã nộp giữ nguyên phạm vi submitted/completed của báo cáo. Backend bổ sung graded/ungraded: điểm hợp lệ cần không NULL, tổng điểm đề >0 và 0 <= điểm <= tổng điểm đề. Phân bố, điểm trung bình, tỷ lệ từ 5/10 và trung bình từng học phần dùng cùng điều kiện. Bài chưa có điểm hợp lệ hiển thị riêng, không gán thành điểm 0. Đây là thay đổi cách đọc thống kê, không sửa điểm gốc hay bài làm.

Kết quả theo học phần có số bài đã có điểm/tổng bài và thanh điểm trung bình trên thang 10. Không có điểm hiển thị dấu gạch cùng thông báo thay vì trung bình 0. Trang Báo cáo giữ bộ lọc có sẵn; Tổng quan giữ phạm vi toàn hệ thống.

Không cần SQL mới; cần khởi động lại backend/frontend. Đã đạt build frontend, 29 test frontend và 30 test PostgreSQL tạm, gồm các biên 0/2/4/5/6/8/10, thiếu điểm, điểm ngoài khoảng và tổng điểm đề bằng 0. Kiểm tra browser bằng fixture, gồm trường hợp 84 bài nộp/83 bài có điểm và tooltip. Chưa đối chiếu dữ liệu Supabase thật trong lượt sửa này.
