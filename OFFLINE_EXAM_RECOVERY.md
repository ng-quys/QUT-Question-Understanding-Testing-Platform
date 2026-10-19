# Khôi phục bài thi khi mất mạng

Sinh viên mở lại ca thi bằng **Tiếp tục làm bài** khi có mạng và ca còn thời gian. Backend xác minh chủ sở hữu, phân công và trạng thái của lượt thi cũ trước khi trả đề; không tạo lượt mới hoặc tính lại giờ bắt đầu. Phần này không đổi API, database hay chính sách giờ thi.

## Lưu và khôi phục

1. Mỗi lựa chọn được ghi vào IndexedDB của trình duyệt, sau đó gửi API lưu đáp án sẵn có.
2. Bản lưu được tách theo username, ID lượt thi và ID câu hỏi. Chỉ chứa các mã định danh/lựa chọn; không lưu mật khẩu, token hay đáp án đúng.
3. Khi mất mạng hoặc API lỗi, giữ lựa chọn chưa được máy chủ xác nhận. Giao diện báo số câu chưa đồng bộ; tiếp tục làm trên trang đang mở.
4. Khi trình duyệt báo online hoặc đến lần thử lại mỗi 5 giây, gửi lại lựa chọn mới nhất của mỗi câu. `navigator.onLine` chỉ là tín hiệu; API thành công mới xác nhận đã đồng bộ.
5. Sau tải lại trang/đăng nhập lại trên cùng trình duyệt, mở đúng ca đang làm. Lấy đáp án từ máy chủ rồi ghép các lựa chọn chưa đồng bộ trong IndexedDB; chỉ nhận câu hỏi và lựa chọn thật sự thuộc đề đã được backend trả về. Bản cache đã đồng bộ không ghi đè dữ liệu máy chủ.
6. Dùng revision riêng từng lần chọn để phản hồi cũ không đánh dấu nhầm lựa chọn mới là đã đồng bộ. Gửi tuần tự để hạn chế lưu ngược thứ tự khi chọn nhanh.
7. Khi nộp bài, chặn lựa chọn mới và chờ ghi cục bộ/yêu cầu autosave đang gửi. Gửi tập đáp án cuối bằng API submit sẵn có. Chỉ xóa bản lưu sau xác nhận thành công; lỗi/timeout giữ bản lưu để thử lại.
8. Nếu máy chủ đã nộp thành công nhưng phản hồi bị mất, API submit sẵn có trả lại kết quả cho lần thử lại. Khi mở kết quả đã xác nhận, xóa cache riêng của lượt thi đó.

## Giờ thi và tình huống giới hạn

- Vẫn sử dụng endTime của lượt thi từ server, đồng hồ điều chỉnh bằng server offset. Mất mạng không gia hạn.
- Tới giờ kết thúc, khóa lựa chọn mới. Có mạng thì gửi yêu cầu nộp bài; mất mạng thì thử nộp lại khi kết nối phục hồi. Backend hiện có không nhận đáp án mới sau giờ kết thúc, chỉ chấm dữ liệu đã lưu trên máy chủ.
- Lựa chọn chưa được xác nhận có thể đã tới server nhưng phản hồi bị mất: giao diện không tự kết luận chắc chắn rằng đáp án đó không được tính.
- Cần kết nối để tải lại ứng dụng, xác thực và mở lại đề. Không bổ sung service worker hay khả năng tải ứng dụng lần đầu khi offline.
- Đổi máy/trình duyệt hoặc xóa dữ liệu trang sẽ không lấy lại được phần chưa gửi. Dữ liệu máy chủ vẫn giữ nguyên. Chế độ riêng tư/bộ nhớ bị chặn có thể không giữ được bản lưu; giao diện báo rõ khi IndexedDB không truy cập được. Nếu bản ghi cục bộ chưa hoàn tất hoặc lỗi lưu và còn câu chưa đồng bộ, bật cảnh báo đóng trang.
- Không xóa phiên đăng nhập chỉ vì refresh token gặp lỗi mạng, timeout hoặc dịch vụ tạm ngừng. Vẫn xóa khi máy chủ từ chối refresh bằng 400/401. Gộp refresh đồng thời và không để phản hồi chậm khôi phục phiên đã đăng xuất.

## Kiểm tra

- `npm run build` và `node --test tests/*.test.mjs` trong frontend.
- Kiểm thử controller với store riêng: khôi phục theo tài khoản/lượt thi, reconnect, lựa chọn nhanh, phản hồi cũ, lỗi lưu cục bộ, server từ chối, chặn sau deadline, giữ cache khi chưa xác nhận nộp, dọn cache đúng phạm vi.
- Kiểm thử token: mất mạng lúc token hết hạn không xóa phiên; kết nối lại refresh được; refresh đồng thời chỉ một request; response chậm không tái tạo phiên đã logout.
- `frontend/tests/attempt-recovery.html`: fixture dữ liệu tổng hợp, dùng IndexedDB thật nhưng máy chủ mô phỏng, không gọi API thi thật. Đã chọn đáp án offline → tải lại → khôi phục → bật kết nối → đồng bộ → nộp → xác nhận cache sạch. Không dùng fixture này thay cho dữ liệu sản xuất.

Không cần migration hoặc khởi động lại backend cho thay đổi này. Tải lại frontend trước khi bắt đầu bài thi mới; không ép tải lại tab của sinh viên đang làm.
