# Giao diện ca thi và chỉnh lịch

Kỳ thi sinh viên dùng thẻ có trạng thái, ngày/giờ, phòng, số câu và thời lượng theo ca. Có nút xem kết quả khi đã nộp. Giám sát admin dùng thẻ ca, số liệu tổng hợp theo trang, tiến độ nộp bài, cảnh báo và nhóm thao tác phụ. Giữ màu xanh dương hiện tại.

Chi tiết giám sát có tên/mã SV, lớp/khoa, nhãn trạng thái bài thi, trạng thái AI, số cảnh báo và thời gian rõ ràng. Tìm kiếm tên/mã/lớp, lọc trạng thái hoặc có cảnh báo, phân trang 10 dòng. Danh sách tự cập nhật 8 giây khi hộp chi tiết mở, tạm dừng khi chuyển sang xem bằng chứng hoặc xác nhận thao tác.

Chi tiết lượt thi tô màu theo `riskLevel` do backend trả về: mức cao/rất cao màu đỏ, trung bình màu cam; cảnh báo trình duyệt dùng màu vàng. Thanh điểm 0–100 và nhãn mức độ vẫn hiển thị. Không thay cách tính điểm thi, điểm rủi ro, dữ liệu cảnh báo hoặc kết luận hậu kiểm.

Trong chi tiết ca, nút **Chỉnh sửa ca thi** cho phép sửa tên, giờ bắt đầu và kết thúc (giờ Việt Nam). API `PUT /api/admin/organization/department-exams/{id}/schedule` chỉ dành cho admin, dùng thời gian cũ để kiểm tra xung đột chỉnh sửa. Giờ mới phải trong tương lai, kết thúc sau bắt đầu và dài tối đa 8 giờ. Giữ đề, phòng, giảng viên, thứ tự/danh sách sinh viên; đồng bộ tất cả nhóm đã công bố trong cùng giao dịch. Kiểm tra trùng lịch phòng, giảng viên và sinh viên.

Ca đã công bố vẫn sửa được khi chưa bắt đầu và chưa có bài làm. Ca chưa công bố quá giờ cũ có thể chuyển sang lịch tương lai. Ca đã bắt đầu, đã đóng, đã hủy hoặc có bất kỳ bài làm nào bị khóa chỉnh lịch để giữ lịch sử. Không tự sửa ca thật khi triển khai chức năng.

Không có thay đổi schema hay migration SQL mới. Kiểm thử PostgreSQL xác nhận sửa ca chưa công bố, sửa ca đã công bố, giữ thời điểm công bố/mã/đề/danh sách, chặn trùng lịch, chặn lịch quá 8 giờ, chặn ca đã bắt đầu/có bài làm và từ chối vai trò sinh viên/giảng viên. Fixture trình duyệt `frontend/tests/session-polish.html` chỉ dùng dữ liệu tổng hợp; đã kiểm tra lọc cảnh báo và lưu giờ mới hiển thị đúng.
