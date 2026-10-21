# Model trên web và camera Python

Web lấy camera/micro tại máy sinh viên và gửi ảnh JPEG, âm thanh PCM16 về Python.
Python trên server không mở camera của sinh viên bằng `VideoCapture(0)`.

## Đồng bộ nhận diện

- Dùng cùng bộ trọng số: InsightFace Buffalo L, MiniFASNetV2, YOLO người,
  YOLO đồ vật, M4 hướng đầu đã huấn luyện, MediaPipe bàn tay, WebRTC VAD.
- Ảnh đưa vào model được lật ngang giống pipeline camera trực tiếp. M4 tính lại
  landmark trên ảnh gốc chưa lật, cho khuôn mặt đã khớp ảnh tham chiếu.
- `app/inference_policy.py` chứa các ngưỡng chung: người 0.40, đồ vật 0.25,
  khớp khuôn mặt 0.40; cửa sổ nhận dạng 10 quan sát, giả mạo/sai người 8 phiếu,
  xác minh 6 phiếu. Crop MiniFASNet dùng cùng quy tắc làm tròn và biên ảnh.
- Bàn tay có ngưỡng detection/presence/tracking 0.35. Web dùng chế độ IMAGE
  để trạng thái theo dõi bàn tay của sinh viên này không lẫn sang sinh viên khác.
- Khi không tìm thấy bàn tay, đồ vật phải có confidence >= 0.45, ở gần người,
  đúng giới hạn kích thước và xuất hiện ít nhất 1.2 giây. Sau đó vẫn phải qua
  bộ xác nhận thời gian. Có grace 0.45 giây giống pipeline trực tiếp.
- Cảnh báo đồ vật vẫn được xét khi điện thoại che khuôn mặt.
- VAD xét 10 khối âm thanh 30ms gần nhất, ngưỡng tiếng nói 60%.
- Bộ thời gian, điểm rủi ro và cơ chế lưu/gửi bằng chứng vẫn dùng các module chung.

## Chất lượng truyền và giới hạn

Ảnh giữ tỉ lệ camera, tối đa rộng 640/cao 720, ưu tiên JPEG quality 0.9;
giảm quality nếu cần để giữ dưới 250KB. Âm thanh được cộng dồn, giữ tối đa
960ms, thay vì ghi đè mỗi khi có khối âm thanh mới. Nhịp gửi mục tiêu 250ms,
không gửi chồng các yêu cầu chưa hoàn tất. Máy chủ giữ đúng một ảnh mới nhất
cho mỗi lượt thi, không tích hàng đợi ảnh cũ.

Đây vẫn là xử lý ảnh lấy mẫu qua mạng, không đảm bảo FPS hoặc độ chính xác
giống hệt webcam nối trực tiếp. Lịch luân phiên mặc định giữ nguyên: tối đa
5 sinh viên mỗi nhóm, 10 giây mỗi lượt nhóm. Khi có nhiều nhóm, mỗi sinh viên
có khoảng chờ giám sát; khoảng chờ/mất dữ liệu không được cộng thành thời gian
vi phạm. Tải CPU và nhịp xử lý ảnh cũng ảnh hưởng thời gian xác nhận cảnh báo.
Không xem việc tải đủ model hoặc vượt qua unit test là bằng chứng độ chính xác
đã đạt trên mọi góc quay, ánh sáng hoặc mọi quy mô lớp thi.

## Test thực tế

1. Khởi động lại dịch vụ AI sau khi sửa Python; tải lại trang thi sau khi sửa web.
2. Nhìn thẳng camera, đủ ánh sáng: kiểm tra không có cảnh báo sai người/giả mạo.
3. Giữ điện thoại trước camera vài giây, thử cả khi điện thoại che mặt và che tay:
   kiểm tra cảnh báo điện thoại, độc lập với cảnh báo không thấy khuôn mặt.
4. Bỏ điện thoại xuống, kiểm tra không tiếp tục tạo cảnh báo đồ vật mới.
5. Quay đầu trái/phải/lên/xuống trong vài giây; kiểm tra hướng và bằng chứng.
6. Thêm người thứ hai, nói liên tục rồi im lặng; kiểm tra cảnh báo tương ứng.
7. Test nhiều sinh viên đồng thời để đo nhịp xử lý thực tế và khoảng chờ nhóm.

Kiểm thử tự động: `python -m unittest discover -s anticheating/tests -v`.
Test âm thanh và kích thước ảnh frontend: trong `frontend`, chạy
`node --test tests/monitor-media.test.mjs`.
