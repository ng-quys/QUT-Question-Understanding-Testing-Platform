# Đăng nhập nhiều tài khoản để kiểm thử

Token truy cập, refresh token, ID token và hồ sơ đăng nhập dùng `sessionStorage` riêng của từng tab. Admin ở tab thứ nhất, sinh viên/giảng viên ở tab khác không ghi đè phiên của nhau. Việc làm mới token, đăng nhập lỗi và đăng xuất chỉ tác động tab hiện tại. Không chuyển token cũ từ `localStorage` vào phiên mới vì có thể đã bị tài khoản khác ghi đè.

Sau khi cập nhật từ phiên bản cũ, tải lại và đăng nhập lại từng tab một lần. Có thể mở tab admin, sau đó mở tab sinh viên cùng URL frontend; không cần tách frontend thành hai folder. Trong cùng một tab vẫn chỉ dùng một tài khoản tại một thời điểm. Đóng tab kết thúc việc lưu phiên trên tab đó; tham số `remember` cũ được giữ trong chữ ký hàm để tương thích lời gọi nhưng không lưu hồ sơ toàn trình duyệt nữa.

Backend tiếp tục kiểm tra vai trò JWT và hồ sơ; không cấp thêm quyền cho sinh viên/giảng viên. Lỗi API 403 không có nội dung được giải thích là thiếu quyền, thay vì chỉ hiện mã HTTP.

Kiểm thử `frontend/tests/tab-auth.test.mjs` mô phỏng hai tab dùng chung localStorage: đăng nhập, refresh, logout, đăng nhập thất bại và từ chối token cũ; xác nhận không làm mất phiên admin.
