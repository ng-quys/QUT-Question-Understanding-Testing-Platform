# Giám sát AI theo nhóm

## Hoạt động

Sinh viên bấm Vào thi: backend tạo/tiếp tục bài và trả đề ngay. Đồng hồ tính từ khi bài được tạo, không chờ AI. Chỉ sau khi transaction commit, hàng đợi nền mới lấy ảnh tham chiếu đúng tài khoản và đăng ký lượt thi với Python. Mất kết nối AI/Storage không hoàn tác bài thi.

Python nạp một bộ model dùng chung ở nền khi dịch vụ khởi động. Một worker xử lý lần lượt ảnh của nhóm tối đa 5 người trên **toàn server**, kể cả nhiều phòng thi cùng lúc. Không nhân thêm 5 worker cho mỗi phòng. Mặc định mỗi lượt nhóm 10 giây. 1–5 người còn kết nối được chọn liên tục; 6 người đổi nhóm 5 rồi 1; 30 người chia 6 lượt nhóm. Người vừa vào được thêm cuối danh sách, người nộp/hết giờ/mất heartbeat được loại.

Trình duyệt xin quyền camera và micro khi mở đề. Nó chỉ gửi JPEG 640×480 và đoạn PCM mono 16 kHz khi backend trả quyền gửi cùng mã lượt `lease`. Ngoài lượt, không gửi ảnh/âm thanh và xóa bộ đệm âm thanh. Camera/micro vẫn có thể giữ mở tại máy sinh viên để không xin quyền lại khi đổi nhóm. Không ghi video hay lưu âm thanh. Các sự kiện chuyển tab/thoát toàn màn hình tiếp tục gửi riêng cho backend ở mọi nhóm.

Backend xác thực Keycloak, kiểm tra đúng chủ bài, trạng thái/thời hạn và chính sách AI trước khi nhận ảnh. ID sinh viên/attempt truyền cho Python được backend xác định; không tin ID chủ sở hữu do trình duyệt tự gửi. Khóa nội bộ không được đưa lên frontend.

Python chỉ nhận frame của lượt đang được chọn và đúng lease. Mỗi người có một ô ảnh mới nhất, không tích lũy video. Frame cũ quá 3 giây hoặc kết quả hoàn thành sau khi đổi lượt/nộp bài bị loại. Tracker/voting/ảnh tham chiếu/bằng chứng tách riêng từng bài. Khoảng trống giám sát không được tính thành thời lượng hành vi liên tục.

Adapter headless dùng model hiện có: InsightFace/nhận diện, MiniFASNetV2, YOLO người/vật thể, model M4 207 đặc trưng, MediaPipe tay, WebRTC VAD; dùng TemporalTracker, RiskEngine, EvidenceLogger và outbox Supabase hiện có. Không mở webcam/micro của server. Pipeline webcam local cũ vẫn được giữ làm công cụ độc lập; luồng web mới dùng `/monitoring/*`, không gọi handshake local `/session/start`.

Các ngưỡng và voting của adapter lấy mẫu không tương đương FPS cao của pipeline local. Ví dụ identity cần nhiều mẫu xác nhận, hành vi hướng đầu/không thấy mặt dùng tracker; cần đánh giá lại độ nhạy với ảnh thật trước khi triển khai. Không dùng cảnh báo để tự kết luận gian lận hay thay điểm.

## Giới hạn tải

- Một bộ model, một worker inference; tối đa 5 người được quyền gửi trong mỗi lượt.
- Mục tiêu gửi tối đa 2 frame/giây/người, không gửi chồng request; thực tế tùy tốc độ model/mạng.
- Mỗi ảnh tối đa 250 KB, PCM tối đa 32 KB, ảnh nhận kiểm tra kích thước trước khi decode.
- Tối đa 300 lượt kết nối mặc định, heartbeat 45 giây; 24 handler HTTP Python; hàng đợi đăng ký Java 300 tác vụ/2 worker, timeout HTTP 4 giây, tự thử đăng ký tối đa 3 lần với backoff. Có nút kết nối lại khi cần.
- Model khởi động lỗi thử tối đa 3 lần; sau đó cần sửa nguyên nhân và khởi động lại dịch vụ AI. Lỗi một frame không dừng nhóm khác hoặc bài thi.
- Outbox bằng chứng giữ cơ chế local/retry/upload và phân quyền xem ảnh cũ. Không tải hàng loạt ảnh có sẵn.

Chia nhóm tạo khoảng trống quan sát: 30 người, nhóm 5, lượt 10 giây thì một vòng khoảng 60 giây. Đây không phải giám sát hình ảnh liên tục cho cả 30 người. Chưa có benchmark 30 camera thật; giới hạn trên không bảo đảm server bất kỳ đều chịu được tải đó.

## Chạy và kiểm tra

Không cần migration mới riêng cho chia nhóm. Các migration phân phòng/tác giả đề của bước trước (009–011) vẫn phải có.

Khởi động lại AI, backend và frontend bằng launcher hiện có hoặc các lệnh đang dùng. Không chạy đồng thời pipeline webcam local và dịch vụ nhóm để tránh tốn hai bộ model. Backend vẫn dùng `app.anticheat.url` và secret nội bộ đã cấu hình; Supabase giữ cấu hình hiện tại.

Có thể đặt các biến môi trường sau trước khi chạy Python, hoặc thêm vào `anticheating/.env`:

```dotenv
ANTICHEAT_BATCH_SIZE=5
ANTICHEAT_BATCH_SECONDS=10
ANTICHEAT_MAX_SESSIONS=300
```

Giới hạn được chấp nhận: nhóm 1–5; lượt nhóm 5–120 giây; số kết nối 5–2000. Không sửa bí mật hay thông số khác chỉ để bật chia nhóm.

Camera và AudioWorklet cần localhost hoặc HTTPS. Khi truy cập từ máy bạn khác qua IP LAN, phải cấu hình HTTPS, URL API/Keycloak và CORS cho đúng địa chỉ. Cho phép camera/micro; nếu trình duyệt yêu cầu thao tác để mở audio, nhấn Bật camera/micro. Đề vẫn mở khi quyền thiết bị bị từ chối, đồng thời hiển thị lỗi để sinh viên báo giảng viên.

1. Dùng ca thử đã công bố, có ảnh hồ sơ, bật AI. Vào thi: đề và đồng hồ mở ngay; không có màn chờ model 90 giây.
2. Cho phép thiết bị. Sau khi model và ảnh đầu được xử lý, thấy Giám sát đang hoạt động. Trong Network có `ai-status` và `ai-frame`; không thấy server key.
3. Một mình thi: không bị chuyển sang chờ nhóm khác. Đáp án vẫn lưu khi AI đang khởi động hoặc Python bị dừng.
4. Sáu tài khoản trên thiết bị/profile riêng: 5 người được gửi, người thứ 6 chờ; sau lượt nhóm thứ 6 được gửi và nhóm đầu ngừng gửi. Không dùng chung token giữa các tab để giả nhiều sinh viên.
5. Admin mở chi tiết ca: cột Giám sát AI cho biết đang giám sát/chờ lượt/đang kết nối/lỗi, cùng thời điểm xử lý gần nhất. Chưa kết nối AI cũng có thể do ca không bật AI; kiểm tra cấu hình đề.
6. Tạo cảnh báo trên tài khoản thử, xem đúng attempt/event và ảnh bằng chứng; không có ảnh thuộc người khác. Nộp bài/hết giờ thì frame mới bị chặn, lịch sử/bằng chứng vẫn còn.

## File chính và xác minh

Mới: `anticheating/app/batch_monitor.py`, `shared_inference.py`; `BatchMonitoringService.java`; `StudentMonitoring.tsx`, `public/monitor-audio-worklet.js`; bộ test batch Python/Java/audio frontend và script `scripts/test_batch_models.py`.

Cập nhật: `run_service.py`, `evidence_logger.py`, `StudentService`, `AntiCheatService`, `StudentController`, `ExamOrganizationService`, `StudentPortalPage`, `AssignedExams`, `studentService`, `ExamOrganization`, `AdminOverview`, `adminService` và test render/trạng thái dịch vụ.

Đã kiểm tra tải model thật và xử lý hai JPEG/PCM tổng hợp bằng một bộ model, trạng thái tracker tách biệt; không mở camera, không dùng ảnh cá nhân hoặc upload cloud. Kiểm tra này không xác nhận độ chính xác nhận diện, thiết bị trình duyệt hay sức tải thực tế. Quyền điều khiển trình duyệt local đang tắt nên chưa kiểm thử camera/AudioWorklet/thao tác thi thật trên trình duyệt; cần chạy các bước trọn luồng nêu trên.

Tài liệu API đã đối chiếu: [getUserMedia](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia), [AudioContext](https://developer.mozilla.org/en-US/docs/Web/API/AudioContext/AudioContext), [MediaPipe Hand Landmarker](https://developers.google.com/edge/mediapipe/solutions/vision/hand_landmarker/python).

Kết quả kiểm tra ngày 17/10/2026: 92 test Python đạt; báo cáo backend 107 test, 0 thất bại/lỗi/bỏ qua (gồm PostgreSQL tạm, kiểm tra quyền và đăng ký sau commit); 23 test frontend đạt; build frontend đạt. ESLint các file mới không lỗi; StudentPortalPage còn 3 cảnh báo dependency effect cũ. Build còn cảnh báo bundle lớn. Không sử dụng database Supabase thật trong các kiểm thử này.
