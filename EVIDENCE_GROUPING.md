# Gộp ảnh và cảnh báo cùng lần ghi nhận

Các sự kiện camera mới được gắn `capture_uuid` chung cho đúng một khung hình đã xử lý của một lượt thi. Mỗi cảnh báo vẫn có `event_uuid`, thời lượng và điểm rủi ro riêng. Không gộp theo ảnh trông giống nhau hoặc thời gian gần nhau.

- AI lưu một file JPEG cho một lần ghi nhận. Ngay khung hình AI đầu tiên phát hiện mặt không khớp, lưu ảnh và đưa cảnh báo cần xem xét (rủi ro 0) vào hàng đợi bền vững. Khi xác nhận cảnh báo hoặc tạm khóa bài thi, dùng lại đúng mã ảnh và thời gian chụp ban đầu; không chụp ảnh đã phục hồi để gắn vào cảnh báo cũ. Chỉ chuyển sang trạng thái tạm khóa sau khi bằng chứng được lưu và xếp hàng thành công. Upload lên admin/giảng viên chạy bất đồng bộ, tùy kết nối. Sau ba khung hình hợp lệ liên tiếp trong ít nhất một giây, kết thúc đợt để lần phát hiện sau có ảnh mới. Các cảnh báo khác vẫn gắn với khung hình thực sự phát hiện chúng.
- Hàng đợi vẫn lưu từng cảnh báo để có thể gửi lại độc lập. Ảnh trên Storage dùng khóa `attempt-{id}/{capture_uuid}.jpg`; bộ nhớ đệm có giới hạn tránh tải lại cùng ảnh cho từng cảnh báo. Khởi động lại hoặc gửi lại có thể tải lại cùng khóa, không tạo ảnh mới cho mỗi cảnh báo.
- Backend thêm cột và chỉ mục tương ứng qua `EvidenceSchema`. Script triển khai thủ công: `database/migrations/020_evidence_capture_groups.sql`.
- Endpoint mới `/api/{admin|teacher}/evidence/attempts/{id}/event-groups` phân trang theo lần ghi nhận, sau đó trả đầy đủ sự kiện thuộc các nhóm trên trang. `total` là số sự kiện; `groupTotal` là số mục hiển thị. Endpoint sự kiện cũ vẫn giữ nguyên.
- Admin và giảng viên dùng chung giao diện: một mục, một nút xem ảnh, tất cả nhãn cảnh báo và thời lượng. Điểm rủi ro hiển thị là giá trị lớn nhất trong nhóm, không cộng lặp các điểm của cùng khung hình. Thống kê sự kiện gốc được giữ nguyên.
- Link ảnh vẫn được kiểm tra quyền theo lượt thi và chỉ cấp khi người xem mở ảnh. Trạng thái đang tải/thất bại vẫn hiển thị rõ; một sự kiện có ảnh đã tải thành công có thể làm đại diện cho cả nhóm.

Dữ liệu cũ không có mã khung hình giữ riêng từng sự kiện; không tự đoán hoặc sửa dữ liệu lịch sử. Cần khởi động lại AI và backend, sau đó tải lại hai frontend để áp dụng đầy đủ. Khi triển khai nhiều máy, cập nhật backend/schema trước, rồi AI và frontend.

Fixture giao diện: `frontend/tests/evidence.html?grouped` (dữ liệu giả). Các kiểm thử tự động bao gồm một ảnh nhiều nhãn, ảnh cùng thời gian nhưng khác khung hình, phân trang không cắt nhóm, quyền truy cập và tải lại ảnh.
