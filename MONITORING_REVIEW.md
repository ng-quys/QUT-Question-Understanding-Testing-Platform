# Mức độ cần xem xét khi giám sát

Điểm phục vụ ưu tiên kiểm tra bằng chứng, không phải xác suất gian lận và không thay đổi điểm bài thi. Các mức ban đầu là quy tắc của ứng dụng, có thể điều chỉnh sau khi đánh giá dữ liệu thực tế: 1–24 thấp, 25–49 trung bình, từ 50 cao; 0 hiển thị “Thông tin giám sát”.

| Quan sát | Điểm | Ghi nhận |
| --- | --- | --- |
| Quyền camera bị trình duyệt báo `denied`, mất hình liên tục ít nhất 5 giây | 30 | `CAMERA_PERMISSION_DENIED` |
| Camera không có hình, chưa rõ nguyên nhân | 0 | `CAMERA_DEVICE_UNAVAILABLE` |
| Không có heartbeat giám sát quá 30 giây | 0 | `MONITORING_CONNECTION_LOST` |
| Mặt chưa khớp ở lần quan sát đầu | 0 | `CAMERA_IDENTITY_OBSERVATION`, lưu ảnh và xếp hàng ngay |
| Mặt không khớp kéo dài đủ mốc tạm khóa | 50 | `CAMERA_IDENTITY_LOCK`, dùng ảnh ban đầu |
| Thoát toàn màn hình dưới 10 giây, dưới 3 lần | 0 | `FULLSCREEN_EXIT` |
| Thoát toàn màn hình ít nhất 10 giây | 20 | Cập nhật lần bắt đầu khi quay lại hoặc tác vụ nền mỗi 5 giây |
| Thoát toàn màn hình từ lần thứ 3 trong cùng lượt thi | 30 | Đếm trên backend; callback trùng không tạo thêm lần |

Frontend chỉ gửi nguyên nhân quan sát được, không gửi điểm. Chỉ `PermissionStatus.state === 'denied'` được phân loại là quyền bị chặn; track kết thúc, hình đen và lỗi mở camera riêng lẻ không chứng minh điều đó. Trình duyệt không hỗ trợ API quyền sẽ dùng nhóm chưa rõ nguyên nhân. Đây là tín hiệu từ trình duyệt, không chứng minh thí sinh cố ý vi phạm. Mất kết nối cũng không tự khẳng định nguyên nhân là mạng của thí sinh thay vì máy chủ.

Backend giữ nguyên nguyên nhân trên từng khoảng gián đoạn, đóng khoảng cũ khi đổi nguyên nhân, lưu thời lượng và chỉ gán điểm ở bản ghi bắt đầu. Bản ghi kết thúc không cộng thêm điểm. Các khoảng tạm khóa do AI chỉ là nhật ký; điểm nằm ở cảnh báo AI tương ứng. Các lỗi gọi AI/máy chủ không được tự phân loại thành chặn quyền camera.

Các cảnh báo mặt không khớp và lần tạm khóa cùng đợt dùng chung capture UUID/ảnh. Nhóm bằng chứng và tổng hợp lượt thi lấy điểm lớn nhất, không cộng các bản ghi trùng cùng bằng chứng. Camera hoạt động lại vẫn cần xác minh để tiếp tục; giữ đáp án và hạn nộp như trước. Micro không bắt buộc.

Admin và giảng viên dùng chung nhãn tiếng Việt. Dữ liệu lịch sử không được sửa lại hay tự suy đoán nguyên nhân. Khởi động lại backend và AI, tải lại frontend để áp dụng cho các sự kiện mới.
