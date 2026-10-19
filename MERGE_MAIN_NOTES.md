# Ghép main vào TrongTruong

Giữ giao diện admin hiện tại của TrongTruong và các màn hình giảng viên từ main. Không thêm AI Credits vào menu admin theo yêu cầu của chủ nhánh; mã nguồn màn hình đã có trên main vẫn được giữ trong repository.

Các điểm ghép dùng chung:

- Giữ bảng điều khiển, tài khoản, phòng/lớp, ca thi, giám sát và khôi phục bài khi mất mạng của TrongTruong.
- Giữ ngân hàng câu hỏi riêng, AI generator/quota, hồ sơ và giao diện giảng viên từ main.
- Giữ mô hình scalar ID của `ExamQuestion`/`StudentAnswer` từ main; các kiểm thử cũ chuyển sang truyền ID.
- Sinh viên đọc snapshot của đề mới. Đề cũ chưa có snapshot tiếp tục đọc nội dung Main DB; không làm mất các ca thi/bài làm có sẵn. Đồng hồ tiếp tục dựa trên ca thi.
- Admin xem/sửa bản nháp và tạo bản chỉnh sửa trên snapshot của đề mới. Không sửa ngân hàng câu hỏi hoặc nội dung của lượt thi cũ. Bản chỉnh sửa không cập nhật đề đang được sinh viên sử dụng.
- Câu hỏi do admin tạo trong snapshot dùng `-examQuestionId` làm ID riêng, tránh trùng với ID dương của ngân hàng. Đáp án snapshot được xác minh trong đúng câu hỏi; không dựa vào quan hệ JPA tới ngân hàng. ID này không phải mã hiển thị cho người dùng.
- Thống kê học phần lấy số câu từ ngân hàng riêng; không xóa học phần còn câu hỏi ở ngân hàng.
- Giữ cấu hình lưu ảnh và `.env.storage`; dùng giới hạn multipart lớn hơn từ main cho tải tài liệu AI. Giới hạn ảnh sinh viên vẫn do dịch vụ ảnh kiểm tra riêng.

Kiểm tra: build frontend, các kiểm thử frontend và script AI credits; backend unit/HTTP tests (loại `BackendApplicationTests` vì đó là kiểm thử khởi động với kết nối thật); PostgreSQL tạm cho ca thi, giờ thi, cấp mã, lịch sử, sửa đề cũ và đề snapshot. Không áp dụng DDL lên cơ sở dữ liệu thật trong quá trình ghép này.
