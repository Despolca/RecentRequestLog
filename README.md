# 📋 Nhật ký Request gần đây

Một plugin SillyTavern tự động thu thập toàn bộ prompt gửi cho AI mỗi lần, giúp bạn dễ dàng xem lại bất cứ lúc nào.


## ✨ Giới thiệu tính năng

- **Tự động thu thập**: Không cần mở bảng điều khiển, tự động ghi lại.
- **Nhận diện nguồn request**: Phân biệt "Mặc định" (Native) và "Plugin".
- **Phân nhóm theo vai trò**: Mỗi bản ghi được phân loại và hiển thị theo `System` / `User` / `Assistant`.
- **Sao chép bằng một cú nhấp**: Hỗ trợ sao chép từng tin nhắn đơn lẻ hoặc toàn bộ nhóm bản ghi.
- **Quản lý thu gọn**: Cả tin nhắn và toàn bộ bảng điều khiển plugin đều có thể được mở rộng / thu gọn riêng biệt bằng cách nhấp vào.
- **Di chuyển + Thu phóng**: Nhấp vào khoảng trống trên thanh tiêu đề để kéo; kéo thả góc dưới bên phải cửa sổ để điều chỉnh kích thước.
- **Chế độ Sáng / Tối**: Chuyển đổi bằng một cú nhấp, hiệu lực vĩnh viễn.


## 🚀 Cách sử dụng

### Cài đặt

Thanh menu trên cùng `Extensions` → `Install Extension` → Sao chép và dán URL sau → `Install for all users` → Làm mới trang SillyTavern sau khi thành công.

```
https://github.com/Despolca/RecentRequestLog
```

### Lối vào bảng điều khiển

Góc dưới bên trái `Extensions (Cây đũa thần)` → `"📘Nhật ký Request gần đây"`

### Giải thích thanh tiêu đề

- **Nhật ký Request gần đây (N/10)**: Hiển thị số lượng bản ghi đã lưu hiện tại. Nhấp vào văn bản để thu gọn/mở rộng toàn bộ bảng điều khiển.
- **⏻**: Công tắc chính, màu xanh lá cây là đang bật. Sau khi tắt sẽ không ghi lại bất kỳ request mới nào nữa.
- **🗑**: Xóa tất cả các bản ghi hiện tại.
- **☀️ / 🌙**: Chuyển đổi giao diện sáng / tối.


## ⚠️ Lưu ý

### Hạn chế đã biết
- **Số Token là ước tính sơ bộ**: Số Token hiển thị trên bảng điều khiển không phải là con số chính xác tuyệt đối mà AI dùng để tính phí, chỉ mang tính chất tham khảo sơ bộ.
- **Lưu tối đa 10 mục**: Khi vượt quá giới hạn, bản ghi cũ nhất sẽ tự động bị ghi đè, bản mới nhất nằm ở trên cùng.
- **Một số ít plugin không thể ghi lại**: Có thể ghi lại request của hầu hết các plugin, nhưng không đảm bảo tất cả các plugin đều có thể được ghi lại.

### Về hiệu suất

- Hầu như không ảnh hưởng đến hiệu suất, mọi quá trình xử lý đều là thao tác trên RAM thuần túy, siêu nhẹ.
- Plugin chặn lệnh gọi `fetch` toàn cục của trình duyệt để thu thập nội dung request, chỉ phân tích payload liên quan đến AI, không ảnh hưởng đến phản hồi bình thường của các request mạng khác.

### Lưu ý về Quyền riêng tư

- Tất cả dữ liệu chỉ tồn tại trong không gian bộ nhớ của tab trình duyệt hiện tại, sẽ không bị tải lên, lưu trữ vĩnh viễn hoặc gửi đến bất kỳ dịch vụ bên ngoài nào.
- Sau khi làm mới, đóng tab hoặc khởi động lại SillyTavern, tất cả các bản ghi sẽ bị xóa.


## 📅 Nhật ký cập nhật

### [v1.5.0] - 2026-06-10

**[Mới]**
- Thêm chức năng nhận diện nguồn request, bổ sung nhãn "Mặc định" và "Plugin".

**[Tối ưu]**
- Điều chỉnh chiều cao mặc định của bảng điều khiển.