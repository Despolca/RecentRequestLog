# 📋 Lịch sử Request gần đây

Một plugin SillyTavern siêu tiện lợi, tự động bắt lấy toàn bộ prompt mỗi lần gửi cho AI, giúp Editor dễ dàng tua lại và xem bất cứ lúc nào nha (๑•̀ㅂ•́)و✧


## ✨ Tính năng sơ lược

- **Tự động bắt**: Không cần mở bảng điều khiển, hệ thống tự động ghi lại luôn (*¯︶¯*)
- **Nhận diện nguồn request**: Phân biệt rạch ròi giữa "Native" (Gốc) và "Plugin" nha.
- **Nhóm theo vai trò**: Mỗi log sẽ được phân loại rõ ràng thành `System` / `User` / `Assistant` nè.
- **Copy một chạm**: Hỗ trợ copy từng tin nhắn lẻ hoặc bê nguyên cả nhóm log luôn (≧◡≦)
- **Quản lý thu gọn**: Tin nhắn và cả bảng điều khiển plugin đều có thể click để bung ra hoặc thu gọn lại siêu gọn gàng.
- **Di chuyển + Zoom**: Click vào chỗ trống trên thanh tiêu đề để kéo đi; nắm góc dưới bên phải cửa sổ để điều chỉnh kích thước tùy ý.
- **Chế độ Sáng / Tối**: Đổi màu chỉ với một click, lưu thiết lập vĩnh viễn luôn ✨


## 🚀 Cách sử dụng

### Cài đặt

Menu trên cùng `Extensions` → `Install Extension` → Copy và dán URL bên dưới vào → `Install for all users` → Cài xong nhớ F5 làm mới trang SillyTavern nha 🌸

```
https://github.com/akira59851/RecentRequestLog
```

### Lối vào bảng điều khiển

Góc dưới bên trái `Extensions (cây đũa phép)` → `「📘Lịch sử Request gần đây」`

### Giải thích thanh tiêu đề

- **Lịch sử Request gần đây (N/10)**: Hiển thị số lượng log đang được lưu trữ. Click vào chữ để thu gọn/bung mở toàn bộ bảng điều khiển nhé.
- **⏻**: Công tắc tổng, màu xanh lá là đang bật. Nếu tắt đi thì Tawa sẽ không lưu thêm request mới nào nữa đâu.
- **🗑**: Xóa sạch sành sanh mọi log hiện tại.
- **☀️ / 🌙**: Chuyển đổi qua lại giữa giao diện Sáng / Tối.


## ⚠️ Lưu ý nhỏ

### Giới hạn đã biết
- **Số Token chỉ là ước tính**: Số Token hiển thị trên bảng không phải là con số tính tiền chính xác tuyệt đối của AI đâu, chỉ để Editor tham khảo sương sương thôi nha.
- **Lưu tối đa 10 dòng**: Vượt quá giới hạn là log cũ nhất sẽ tự động bị ghi đè, log mới nhất luôn nằm trên cùng.
- **Vài plugin không thể lưu**: Có thể lưu request của đại đa số plugin, nhưng Tawa không dám đảm bảo 100% plugin nào cũng bắt được đâu (´・ω・`)

### Thông số hiệu năng

- Gần như không ăn mòn hiệu năng, mọi thao tác xử lý đều là dạng siêu nhẹ chạy thuần trên RAM.
- Plugin sẽ chặn các cuộc gọi `fetch` toàn cục của trình duyệt để tóm gọn nội dung request, nhưng chỉ soi các dữ liệu liên quan đến AI thôi, hoàn toàn không làm ảnh hưởng đến các request mạng khác nha 🧠

### Nhắc nhở bảo mật

- Toàn bộ dữ liệu chỉ ngự trị trong không gian RAM của tab trình duyệt hiện tại, tuyệt đối không bị upload, lưu trữ vĩnh viễn hay tuồn ra cho bất kỳ dịch vụ bên ngoài nào cả 🚨
- Chỉ cần F5, đóng tab hoặc khởi động lại SillyTavern là toàn bộ log sẽ bay màu sạch sẽ.


## 📅 Nhật ký cập nhật

### [v1.5.0] - 2026-06-10

**[Mới]**
- Thêm tính năng nhận diện nguồn gốc request, gắn thêm nhãn "Native" và "Plugin".

**[Tối ưu]**
- Tinh chỉnh lại chiều cao mặc định của bảng điều khiển cho vừa vặn hơn (*¯︶¯*)