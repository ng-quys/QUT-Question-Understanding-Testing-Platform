# Xác minh camera trước và trong ca thi

Áp dụng cho ca thi có bật giám sát AI. Ca không yêu cầu AI giữ chính sách cũ.

## Hành vi

- Trước khi bắt đầu hoặc vào lại bài thi, sinh viên mở camera, giữ khuôn mặt rõ, khớp ảnh hồ sơ hiện tại. Model chống giả mạo kiểm tra người thật trên chính khuôn mặt khớp ảnh hồ sơ; máy chủ yêu cầu nhiều khung hình hợp lệ liên tiếp. Số người/khuôn mặt khác không chặn bước vào thi; cảnh báo nhiều người khi đang thi vẫn theo cơ chế giám sát hiện có.
- Máy chủ cấp bằng chứng ngắn hạn, dùng một lần, gắn với sinh viên, ca thi và phiên bản ảnh hồ sơ. Chưa đạt thì không mở đề hoặc tạo lượt thi. Đổi ảnh làm bằng chứng cũ mất hiệu lực.
- Camera bị ngắt hoặc mất hình liên tục từ 5 giây làm giao diện tạm khóa. Gián đoạn ngắn hơn không tích lũy. Hình camera vẫn chạy nhưng không thấy mặt hoặc sai khuôn mặt được xác nhận qua các mẫu AI; lịch lấy mẫu vẫn theo bộ điều phối hiện tại. Nhiều người chỉ là cảnh báo, không khóa bài nếu vẫn có khuôn mặt đúng hồ sơ và đạt kiểm tra người thật trên chính khuôn mặt đó.
- Thời điểm bắt đầu và kết thúc gián đoạn được ghi trong diễn biến; sự kiện kết thúc có thời lượng, mức rủi ro 0, không tự kết luận gian lận. Khóa không xóa đáp án hay cộng thời gian. Đáp án chưa đồng bộ được giữ trên máy và gửi tiếp sau khi khôi phục. Backend chặn thêm đáp án khi camera chưa hợp lệ. Hết giờ, chỉ đáp án máy chủ đã nhận được tính.
- Kiểm tra lại thành công tiếp tục đúng lượt thi và hạn nộp cũ. Lỗi dịch vụ xác minh yêu cầu thử lại; không tự cho vượt bước kiểm tra.

## Khởi động áp dụng

Khi không có ca thi cần giữ đang chạy, trong PowerShell tại thư mục dự án:

```powershell
.\DUNG_QUT.bat
$env:AI_CREDITS_WORKER_ENABLED="false"
.\CHAY_QUT.bat
```

Nhấn F5 trên trang. Cần khởi động lại cả AI và backend để có API xác minh mới. Không đổi `AI_CREDITS_ENABLED`.

## Kiểm tra bằng thiết bị thật

1. Ảnh hồ sơ rõ, đúng người, đủ sáng: xác minh rồi mới mở bài.
2. Đóng nắp che hoặc không cấp quyền camera trước khi thi: không mở đề.
3. Chỉ có người khác hoặc dùng ảnh thay khuôn mặt: không đạt xác minh. Có thêm người nhưng vẫn thấy thí sinh đúng hồ sơ và đạt kiểm tra người thật: được tiếp tục; khi đang thi vẫn ghi cảnh báo nhiều người.
4. Đang làm, chọn đáp án rồi ngắt camera: tạm khóa, giờ vẫn chạy; khôi phục và xác minh lại thì đáp án vẫn còn.
5. Tải lại trang trong lượt thi: yêu cầu xác minh lại, không tạo lượt mới hoặc kéo dài giờ.
6. Hết giờ khi đang khóa: kết thúc dựa trên dữ liệu đã lưu ở máy chủ.

## Giới hạn

So khớp với ảnh hồ sơ hiện tại không thay thế quy trình duyệt danh tính chính thức. Ảnh hồ sơ hiện vẫn theo quy trình cập nhật có sẵn. Chống giả mạo và nhận diện có thể có sai số, cần đánh giá với camera, ánh sáng và người dùng thật trước khi triển khai rộng.

AI dùng chung một worker và bộ model; yêu cầu xác minh đi qua hàng đợi có giới hạn, không tạo model riêng cho từng sinh viên. Khi đang chờ lượt giám sát, hệ thống không coi việc chưa được lấy mẫu là mất camera. Việc phát hiện nắp che khi driver vẫn báo camera hoạt động phụ thuộc lượt lấy mẫu AI.

Luồng camera dùng chung giữa xác minh và giám sát, không tắt/mở lại ở bước chuyển. Micro là tùy chọn. Chỉ tự kết nối micro khi đã được cấp quyền; nếu chưa cấp quyền thì hiển thị nút bật tùy chọn và không chặn bài thi. Micro và AudioContext được kiểm tra riêng: lỗi micro có cảnh báo và nút bật lại, không bị gắn nhãn mất camera. Khung hình camera vẫn được phân tích khi micro chưa sẵn sàng.

Bộ phát hiện khung hình trống trên trình duyệt hỗ trợ phát hiện nắp che; ngưỡng tương phản không thay thế nhận diện khuôn mặt của AI. Trường hợp camera còn hình nhưng sai khuôn mặt dựa vào lượt lấy mẫu AI. Lỗi mạng quá 30 giây được báo là mất kết nối giám sát, không phải mất camera.

Bằng chứng xác minh và trạng thái khóa nằm trong bộ nhớ backend. Khởi động lại backend yêu cầu sinh viên xác minh lại. Khi triển khai nhiều backend cần định tuyến cùng phiên hoặc chuyển trạng thái này sang kho dùng chung trước khi mở rộng.

Fixture `frontend/tests/camera-preflight.html` dùng camera và API giả, không truy cập camera thật. Kiểm thử tự động không thay thế thử nghiệm thiết bị thật ở trên.

Khi AI xác nhận khóa vì khuôn mặt không khớp, hệ thống chụp chính khung hình tại mốc khóa thành sự kiện `CAMERA_IDENTITY_LOCK`, rủi ro 0. Ảnh đi qua hàng đợi lưu bền và tải lên Storage như các ảnh bằng chứng khác; admin/giảng viên xem trong diễn biến lượt thi. Mỗi giai đoạn khóa chỉ tạo một ảnh bổ sung; chỉ đặt lại sau khi có chuỗi khuôn mặt hợp lệ xác nhận khôi phục. Ảnh vẫn có thể ở trạng thái đang tải hoặc tải lỗi nếu hệ thống lưu trữ gặp sự cố.


Cập nhật điều kiện cho phép làm bài: cả bước vào thi, kiểm tra lại camera và các mẫu AI trong bài đều dựa vào một khuôn mặt khớp hồ sơ đạt liveness. Không dùng số người YOLO hoặc số khuôn mặt để tạm khóa. Model nhiều người, cảnh báo và ảnh bằng chứng vẫn hoạt động. Backend không thu hồi xác minh chỉ từ một trạng thái `multiple_people`; mất camera thật, không có mặt hợp lệ và chống giả mạo vẫn theo điều kiện kiểm tra tương ứng.
