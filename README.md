# 📋 Nhật ký yêu cầu gần đây

Một plugin SillyTavern, tự động lấy toàn bộ prompt được gửi cho AI mỗi lần, tiện lợi để xem lại bất cứ lúc nào.


## ✨ Giới thiệu tính năng

- **Tự động lấy**: Không cần mở bảng điều khiển, tự động ghi lại.
- **Nhận diện nguồn yêu cầu**: Phân biệt "Native" và "Plugin".
- **Gộp nhóm theo vai trò**: Mỗi bản ghi được phân loại hiển thị theo `System` / `User` / `Assistant`.
- **Sao chép bằng 1 click**: Hỗ trợ sao chép một tin nhắn hoặc toàn bộ nhóm bản ghi.
- **Quản lý thu gọn**: Có thể nhấp để mở rộng / thu gọn riêng lẻ từng tin nhắn và toàn bộ bảng điều khiển plugin.
- **Di chuyển + Thu phóng**: Nhấp vào khoảng trống trên thanh tiêu đề để kéo; kéo góc dưới bên phải cửa sổ để điều chỉnh kích thước.
- **Chế độ sáng / tối**: Chuyển đổi bằng 1 click, hiệu lực vĩnh viễn.


## 🚀 Cách sử dụng

### Cài đặt

Thanh menu trên cùng `Extensions` → `Install Extension` → Sao chép và dán URL bên dưới → `Install for all` → Sau khi thành công, làm mới trang SillyTavern

```text
https://github.com/Despolca/RecentRequestLog
```

### Lối vào bảng điều khiển

Góc dưới bên trái `Extensions (Cây đũa phép)` → `[📘Nhật ký yêu cầu gần đây]`

### Mô tả thanh tiêu đề

- **Nhật ký yêu cầu gần đây (N/10)**: Hiển thị số lượng bản ghi đã lưu hiện tại. Nhấp vào chữ có thể thu gọn / mở rộng toàn bộ bảng điều khiển.
- **⏻**: Công tắc tổng, màu xanh lá là bật. Sau khi tắt sẽ không ghi lại bất kỳ yêu cầu mới nào.
- **🗑**: Xóa toàn bộ bản ghi hiện tại.
- **☀️ / 🌙**: Chuyển đổi giao diện sáng / tối.


## ⚠️ Lưu ý

### Giới hạn đã biết
- **Số Token là ước tính thô**: Số lượng Token hiển thị trên bảng điều khiển không phải là con số chính xác mà AI dùng để tính phí thực tế, chỉ mang tính chất tham khảo chung.
- **Lưu tối đa 10 mục**: Sau khi vượt quá giới hạn, bản ghi cũ nhất sẽ tự động bị ghi đè, bản mới nhất nằm ở trên cùng.
- **Một vài plugin không thể ghi lại**: Có thể ghi lại yêu cầu của phần lớn plugin, nhưng không đảm bảo tất cả plugin đều có thể ghi lại được.

### Mô tả hiệu suất

- Gần như không ảnh hưởng đến hiệu suất, mọi quá trình xử lý đều là các thao tác bộ nhớ thuần túy hạng nhẹ.
- Plugin nắm bắt nội dung yêu cầu bằng cách đánh chặn các lệnh gọi `fetch` toàn cục của trình duyệt, chỉ phân tích nội dung yêu cầu liên quan đến AI, không ảnh hưởng đến phản hồi bình thường của các yêu cầu mạng khác.

### Lưu ý về quyền riêng tư

- Toàn bộ dữ liệu chỉ tồn tại trong không gian bộ nhớ của tab trình duyệt hiện tại, sẽ không bị tải lên, lưu trữ lâu dài hoặc gửi đến bất kỳ dịch vụ bên ngoài nào.
- Sau khi làm mới, đóng tab hoặc khởi động lại SillyTavern, tất cả bản ghi đều sẽ bị xóa sạch.


## 📅 Nhật ký cập nhật

### [v1.5.0] - 2026-06-10

**[Mới]**
- Thêm chức năng nhận diện nguồn yêu cầu, thêm nhãn "Native", "Plugin".

**[Tối ưu hóa]**
- Điều chỉnh chiều cao mặc định của bảng điều khiển.