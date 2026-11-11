# Nhật ký yêu cầu gần đây (Recent Request Log)

Ghi lại các yêu cầu (Request), nội dung phản hồi (Response) và các thông tin liên quan mà SillyTavern cùng các tiện ích mở rộng bên thứ ba thực tế gửi đến AI, hỗ trợ việc truy vết, xem lại và debug thuận tiện.

## Tính năng chính

- **Ghi nhật ký ngầm (Seamless Logging)**: Tự động ghi lại các yêu cầu và phản hồi do SillyTavern gốc cũng như tiện ích mở rộng bên thứ ba khởi tạo, chỉ cần mở bảng điều khiển là có thể xem lại.
- **Xem yêu cầu (Request)**: Hiển thị tin nhắn theo vai trò (Role), xem Model, nguồn gốc, thời gian, Token và JSON gốc; hỗ trợ xem toàn văn liên tục và đọc độc lập các tin nhắn dài.
- **Xem phản hồi (Response)**: Mục Response ở cuối bản ghi hiển thị nội dung phản hồi cùng thời gian phản hồi chữ đầu tiên (Time to First Token), TPS, tổng thời gian xử lý; nhấp vào `ⓘ` để xem chế độ Stream, thời điểm hoàn tất, mã trạng thái HTTP thất bại và một số trường dữ liệu gốc do upstream trả về.
- **Ghi nhật ký gọi công cụ (Tool Call Log)**: Hỗ trợ phân tích cú pháp (parse) và hiển thị các lệnh gọi công cụ tiêu chuẩn của OpenAI, Anthropic và Gemini.
- **Tìm kiếm và lọc**: Hỗ trợ tìm kiếm trong từng bản ghi đơn lẻ, tìm kiếm xuyên suốt các bản ghi, cũng như lọc theo nguồn, Model và vai trò.
- **Sắp xếp và xuất file**: Hỗ trợ sao chép từng bản ghi, sao chép toàn văn, xuất ra file TXT/JSON, ghim tạm thời, xóa bản ghi lẻ và dọn sạch toàn bộ.
- **Mô phỏng Prompt hiện tại**: Mô phỏng lại quy trình ghép nối Prompt thực tế mà không gửi yêu cầu thật. Có thể xem nội dung yêu cầu sau khi đã được Worldbook, Regex và các tiện ích mở rộng khác xử lý, hỗ trợ bao gồm cả tin nhắn User chưa gửi trong khung nhập liệu.
- **Lối vào và bố cục**: Hỗ trợ tùy chỉnh nhiều kiểu lối vào; tương thích với giao diện di động, chế độ toàn màn hình cùng giao diện sáng/tối (Day/Night Theme) của SillyTavern.

## Cài đặt

Trong SillyTavern, mở "Extensions" (Tiện ích mở rộng) → "Install Extension" (Cài đặt tiện ích mở rộng), dán địa chỉ sau:

```
https://github.com/Despolca/RecentRequestLog
```

Sau khi cài đặt hoàn tất, làm mới (refresh) lại trang SillyTavern.

## Lối vào bảng điều khiển

Lối vào mặc định nằm ở menu "Extensions" (biểu tượng cây đũa phép) ở góc dưới bên trái.
Bạn có thể chọn lối vào khác trong phần Cài đặt ưu tiên (Preferences), hoặc ẩn lối vào mặc định.
Lối vào phụ trợ: Gửi lệnh `/rlog-toggle` vào khung chat.

Khi mở bảng điều khiển lần đầu, bạn có thể làm theo hướng dẫn sử dụng để nắm bắt các tính năng; sau đó cũng có thể mở lại hướng dẫn từ ngăn kéo "More" (Thêm).

## Cài đặt ưu tiên (Preferences)

Mở cài đặt ưu tiên trong ngăn kéo "More" để điều chỉnh:

- **Quản lý bản ghi**: Giới hạn số lượng bản ghi thông thường, thời gian chờ phản hồi quá hạn (Timeout).
- **Cài đặt lối vào**: Lối vào nút nổi (Badge/Floating button) mặc định, lối vào nút QR (Quick Reply), ẩn lối vào menu tiện ích mở rộng.
- **Hiệu ứng hiển thị**: Ngưỡng cảnh báo nhấp nháy, chế độ sáng/tối đồng bộ theo Theme của ST, chế độ tối giản (Minimal mode).
- **Hành vi bảng điều khiển**: Mặc định toàn màn hình trên thiết bị di động, nhấp ra ngoài bảng điều khiển để đóng.
- **Trạng thái bộ lọc**: Có lưu lại điều kiện lọc sau khi làm mới trang hay không.

## Dữ liệu và quyền riêng tư

- Nhật ký yêu cầu, nội dung phản hồi chỉ được lưu trong bộ nhớ tạm (RAM) của trang web, sẽ bị xóa sau khi làm mới hoặc đóng tab trình duyệt, hoàn toàn không được lưu trữ vĩnh viễn (no persistence).
- Cài đặt tiện ích mở rộng được lưu trong `extensionSettings.RecentRequestLog`. SillyTavern phiên bản 1.18.0 trở lên hỗ trợ dùng "Clear extension data" trong phần quản lý tiện ích, hoặc tích chọn "Clear extension data" khi xóa tiện ích.
- Vui lòng chú ý kiểm tra thông tin nhạy cảm/riêng tư khi chụp ảnh màn hình, sao chép, xuất file hoặc chia sẻ.

## Giới hạn đã biết

- Token, TPS và thời gian xử lý là giá trị quan sát hoặc ước tính cục bộ, không đại diện cho mức phí thực tế từ upstream hay thông lượng (throughput) thực sự.
- Các trường `ⓘ` từ upstream được hiển thị nguyên văn theo kết quả trả về thực tế, không xác thực độ tin cậy và không suy đoán ngữ nghĩa của trường.
- Tiện ích mở rộng được phát triển nhắm đến môi trường gốc của SillyTavern, không đảm bảo tương thích với các Client khác cũng như toàn bộ tiện ích mở rộng từ bên thứ ba.

## Nhật ký cập nhật (Changelog)

### [v1.20.0] - 2026-11-11

**[Thêm mới]**
- Phân tích cú pháp gọi công cụ (Tool Call): Hỗ trợ phân tích và ghi lại các lệnh gọi công cụ theo định dạng chuẩn của OpenAI, Anthropic, Gemini. Bổ sung mục TOOL hiển thị tên công cụ, ID cuộc gọi và tham số; sửa lỗi phản hồi bị ghi nhận là trống trong các kịch bản chỉ có Tool Call thuần túy.
- Bổ sung nội dung phản hồi trong mục xem toàn văn: Hiển thị đồng thời cùng yêu cầu gốc. Sao chép toàn văn, xuất TXT và xuất JSON cũng sẽ bao gồm cả nội dung phản hồi.

**[Tối ưu hóa]**
- Điều chỉnh thứ tự tải tiện ích mở rộng, giúp việc bắt yêu cầu (Request Interception) được thiết lập sớm hơn, giảm thiểu sai lệch ghi nhận yêu cầu do độ trễ thứ tự tải giữa các plugin.
- Tối ưu hóa logic kích hoạt và giải phóng các trình lắng nghe tương tác (Event Listener), tự động bật/tắt theo nhu cầu dựa trên trạng thái tương tác thực tế của bảng điều khiển, ngăn kéo tìm kiếm và nút nổi, giảm chi phí lắng nghe không cần thiết trên trang khi tiện ích ở trạng thái rảnh.

### [v1.19.1] - 2026-11-09

**[Sửa lỗi]**
- Bảng điều khiển thông thường và chế độ toàn màn hình trên thiết bị di động hiện tự động bám theo chiều cao khung nhìn (Viewport) thực tế, chỉ cố định chiều cao trong lúc khung nhập liệu được focus hoặc bàn phím ảo đang bật; tự động đồng bộ lại sau khi bàn phím đóng, khung nhập mất focus hoặc khung nhìn phục hồi.
- Tính năng "Nhấp ra ngoài bảng điều khiển để đóng" không còn đóng nhầm bảng điều khiển vừa mới được mở thông qua nút gửi, nút QR,...; trình lắng nghe này hiện chỉ có hiệu lực khi bảng điều khiển mở và tùy chọn được bật, tự động gỡ bỏ khi đóng bảng hoặc tắt tùy chọn.

### [v1.19.0] - 2026-11-08

**[Thêm mới]**
- Tìm kiếm toàn cục: Hỗ trợ tìm kiếm trong các bản ghi hiện đang hiển thị, kích hoạt thủ công sau khi nhập từ khóa; khi có nội dung mới xuất hiện, nhấp "Cập nhật" để làm mới kết quả.
- Định vị kết quả tìm kiếm: Cả tìm kiếm đơn lẻ lẫn tìm kiếm toàn cục đều hỗ trợ nhấp trực tiếp vào số đếm để nhập số thứ tự mục tiêu cần nhảy tới.
- Tính năng xuất file: Mục "Xem toàn văn" bổ sung nút xuất file, hỗ trợ xuất nội dung đã sắp xếp dưới dạng `.txt`, hoặc xuất dữ liệu yêu cầu gốc dưới dạng `.json`.
- Đọc tin nhắn dài độc lập: Hiển thị lối vào chế độ đọc riêng biệt khi một tin nhắn đạt từ 800 Token trở lên.
- Trình giữ chỗ đa phương tiện (Media Placeholder): Hình ảnh, video, âm thanh và tập tin sẽ hiển thị dưới dạng biểu tượng giữ chỗ trong bản ghi.
- Thông tin hiệu năng của Response: Dòng tiêu đề hiển thị thời gian phản hồi chữ đầu tiên, TPS và tổng thời gian tiêu tốn. Nhấp vào `ⓘ` để xem chế độ Stream, thời điểm hoàn tất, trạng thái HTTP thất bại, cũng như các trường dữ liệu gốc do upstream trả về như Token, Cache, suy luận (Reasoning), trạng thái kết thúc (Finish Reason) và chi phí (không hiển thị nếu không phân tích được trường liên quan).
- Điều khiển cửa sổ: Bổ sung các nút thu nhỏ, phóng to / khôi phục. Loại bỏ tính năng nhấp vào tiêu đề để thu nhỏ trước đây.
- Cài đặt ưu tiên:
  - Giới hạn bản ghi: Chuyển tùy chỉnh giới hạn bản ghi vào cài đặt ưu tiên, không còn chỉnh sửa bằng cách nhấp đúp vào số đếm trên tiêu đề.
  - Thời gian chờ phản hồi quá hạn: Tùy chỉnh thời lượng chờ phản hồi, chỉ ảnh hưởng đến việc ghi nhật ký của tiện ích chứ không làm gián đoạn quá trình tạo sinh thực tế.
  - Ngưỡng cảnh báo nhấp nháy: Tùy chỉnh ngưỡng cảnh báo số lượng Token, đặt thành 0 để tắt nhấp nháy.
  - Lối vào thanh QR: Đưa tiện ích vào thanh QR, thực hiện lệnh đóng/mở bảng điều khiển qua tập hợp QR gốc.
  - Ẩn lối vào mặc định: Ẩn lối vào của tiện ích trong menu mở rộng.
- Lệnh thường trú: Đăng ký lệnh `/rlog-toggle` trong suốt thời gian tải tiện ích, có thể mở bảng điều khiển bằng câu lệnh.

**[Tối ưu hóa]**
- Quy trình nhận diện yêu cầu: Tái cấu trúc pipeline trích xuất phần thân yêu cầu (Request Body), nhận diện định dạng AI và xử lý bản ghi; phân định rõ giữa văn bản thô, Request, đối tượng có cấu trúc, không có phần thân và loại không hỗ trợ phần thân, giảm thiểu việc phân tích trùng lặp và duyệt mảng vô nghĩa.
- Tạo bản ghi mô phỏng:
  - Tăng tốc độ: Tái sử dụng bộ nhớ đệm (Cache) sẵn có của ST, các tin nhắn không thay đổi sẽ không gửi lại yêu cầu đến API bộ tách từ (Tokenizer).
  - Tăng thời gian chờ quá hạn: Kéo dài từ 15 giây lên 30 giây.
  - Dừng thủ công: Có thể chủ động dừng tác vụ trong quá trình tạo để hủy lần mô phỏng này.
- Thống kê Token yêu cầu: Đồng bộ chuẩn hóa sâu hơn theo tiêu chí thống kê Chat Completion của OpenAI trong SillyTavern.
- Thống kê Token phản hồi: Chỉ tính toán phần suy nghĩ (Thinking) và phần thân văn bản thực tế được tạo sinh, không tính thẻ `<think>`, dòng trống hiển thị và lý do thất bại; khi không có đầu ra sẽ hiển thị `- tokens`.
- Trải nghiệm sao chép: Hiển thị trạng thái thành công hoặc thất bại dựa trên phản hồi thực tế của trình duyệt; hiển thị thông báo gợi ý dùng tính năng xuất file khi sao chép nội dung quá dài trên thiết bị di động.
- Tương thích tin nhắn dài khi toàn màn hình: Nội dung tin nhắn dài sẽ tự động giãn chiều cao khi ở chế độ toàn màn hình, khôi phục lại sau khi thoát toàn màn hình.
- Kéo thanh tiêu đề: Thống nhất vùng có thể kéo trên thanh tiêu đề, tối ưu hóa cơ chế nhận diện thao tác kéo và phản hồi con trỏ chuột.
- Bố cục bảng điều khiển: Bộ lọc, tìm kiếm toàn cục và ngăn kéo More được quy hoạch đồng nhất về phía dưới thanh tiêu đề, dùng chung vị trí và chuyển đổi loại trừ lẫn nhau (Mutual Exclusion). Bộ lọc bổ sung nút đặt lại (Reset), hỗ trợ cuộn ngang khi thiếu không gian hiển thị.
- Tương thích bàn phím di động: Chiều cao bảng điều khiển không còn bị co giãn mỗi khi bàn phím ảo bật lên hoặc thu xuống, hạn chế hiện tượng giật rung bố cục.
- Điều chỉnh icon: Thay thế một số icon để bám sát ngữ nghĩa hơn.
- Giao diện cài đặt ưu tiên: Tinh chỉnh phân nhóm cài đặt, câu chữ và mũi tên gợi ý cuộn trang, tối ưu khoảng cách các thành phần điều khiển cùng phân cấp thị giác.
- Giao diện (Theme) mặc định: Đặt Theme mặc định cho lần cài đặt đầu tiên là chế độ sáng (Light mode), các thiết lập giao diện tối đã lưu từ trước sẽ không bị ảnh hưởng.
- Lưu trữ và di chuyển thiết lập: Cài đặt tiện ích được chuyển đồng bộ sang cấu hình mở rộng của SillyTavern, tự động di chuyển cài đặt cũ trên trình duyệt; hỗ trợ dọn dẹp cấu hình tiện ích trong giao diện quản lý tiện ích mở rộng hoặc khi gỡ cài đặt.
- Hướng dẫn sử dụng: Tái cấu trúc hướng dẫn sử dụng thành 10 bước, thống nhất việc làm nổi bật lối vào ngăn kéo cùng khu vực điều khiển, bổ sung phần minh họa tìm kiếm toàn cục, lối vào chế độ đọc và thông tin Response.

### [v1.18.0] - 2026-10-09

**[Thêm mới]**
- Tạo bản ghi mô phỏng: Bổ sung tính năng mô phỏng yêu cầu, bám sát quy trình tạo sinh thực tế để ghép Prompt, chặn bắt và ghi lại nội dung yêu cầu cuối cùng trước khi gửi đi mà không thực sự phát lệnh, không tốn hạn ngạch (Quota) hay chỉnh sửa lịch sử chat. Bản ghi mô phỏng có nhãn phân biệt riêng, đồng thời cung cấp thông báo trạng thái tạo, cơ chế bảo vệ quá hạn và giới hạn kích hoạt lặp lại.
- Lối vào tìm kiếm toàn cục: Bổ sung nút giữ chỗ cho tìm kiếm toàn cục, tính năng chưa hoạt động và sẽ được hoàn thiện trong các bản cập nhật tiếp theo.

**[Tối ưu hóa]**
- Hiệu năng bảng điều khiển và dựng danh sách: Chuyển sang tạo nội dung bản ghi và tin nhắn theo nhu cầu (On-demand), đồng thời thu hồi và khôi phục nội dung văn bản nằm ngoài màn hình (Off-screen), giảm đáng kể mức tiêu tốn tài nguyên trang web trong kịch bản có lượng lớn bản ghi hoặc tin nhắn dài, nâng cao hiệu năng mở bảng điều khiển, làm mới danh sách và thao tác cuộn.
- Bố cục và hiệu năng cuộn: Tối ưu định vị ghim đỉnh của thanh tiêu đề, thanh cuộn tùy chỉnh cho tin nhắn dài và thuật toán tính toán bố cục khi kích thước cửa sổ thay đổi, giảm thiểu việc tính toán lại bố cục (Reflow) và cập nhật không cần thiết; thanh cuộn chuyển sang tạo theo từng đợt (Batch) và được đồng bộ thu hồi khi nội dung nằm ngoài màn hình.
- Hiệu năng tìm kiếm và tương tác: Nâng cao đáng kể hiệu quả xử lý bôi sáng (Highlight) đối với kết quả tìm kiếm mật độ cao, tối ưu vị trí nhảy tìm kiếm và hành vi ghim đỉnh của thanh tiêu đề, cải thiện độ ổn định của bảng điều khiển khi bàn phím di động bật lên.
- Chi tiết giao diện và tương tác: Tối ưu bố cục thanh tiêu đề trên màn hình hẹp và di động, hiệu ứng mở/thu gọn ngăn kéo, điểm dừng khi cuộn nhanh xuống đáy và hoạt ảnh gợi ý; thu hẹp vùng chạm của thanh cuộn tùy chỉnh để tránh bấm nhầm trên di động.
- Đồng bộ hiển thị nội dung và tìm kiếm: Khắc phục cách xử lý hiển thị dòng trống ở đầu văn bản, đảm bảo nội dung thực tế và vị trí bôi sáng tìm kiếm luôn ăn khớp với nhau.
- Phong cách thị giác: Tối ưu khoảng cách khung tìm kiếm, thông báo đếm số lần không khớp và màu sắc liên quan đến các thao tác nguy hiểm, thống nhất phong cách thị giác trên toàn giao diện.
- Hiệu năng chuyển đổi Theme: Hủy bỏ hiệu ứng chuyển màu từng phần tử (Gradient) trên máy tính khi đổi Theme nhằm giảm hiện tượng giật lag khi có nhiều bản ghi; vẫn giữ lại hiệu ứng thở (Breathing Animation).

**[Sửa lỗi]**
- Rò rỉ bộ nhớ và tài nguyên: Sửa lỗi các đăng ký tải chậm (Lazy loading) bị vô hiệu hóa khi làm mới danh sách không được dọn dẹp, dẫn đến việc tích tụ tài nguyên liên kết và danh sách cũ.
- Bất thường trong tạo và thu hồi thanh cuộn: Sửa lỗi mất đăng ký tạo thanh cuộn khi nội dung tạm thời không hiển thị, cũng như việc hủy đăng ký chậm trễ trong thời gian thu hồi văn bản ngoài màn hình; đảm bảo thanh cuộn được tạo bình thường sau khi nội dung hiển thị trở lại.
- Bất thường thanh cuộn khi xem toàn văn: Sửa lỗi việc làm mới danh sách gây ảnh hưởng đến thanh cuộn của lớp phủ (Overlay) xem toàn văn.
- Lệch vị trí bôi sáng tìm kiếm: Sửa lỗi vị trí bôi sáng tìm kiếm không khớp với văn bản thực tế khi nội dung bắt đầu bằng ký tự xuống dòng hoặc ký tự NUL.
- Định vị sai khi nhảy tìm kiếm: Sửa lỗi lệch định vị kết quả tìm kiếm ở cuối tin nhắn dài, cũng như lỗi thanh tiêu đề bản ghi bất ngờ rời khỏi vị trí ghim đỉnh khi thực hiện lệnh nhảy.
- Lặp lại hoạt ảnh gợi ý: Sửa lỗi hoạt ảnh gợi ý chưa chạy xong bị phát lại khi mở lại bảng điều khiển sau khi đã thu gọn hoặc đóng.

### [v1.17.0] - 2026-09-20

**[Thêm mới]**
- Hỗ trợ ghi lại yêu cầu qua XHR / `$.ajax`.
- Hỗ trợ ghi lại yêu cầu qua Proxy Backend của tiện ích mở rộng, có khả năng nhận diện và giải nén một lớp yêu cầu proxy để ghi nhận chính xác phần thân yêu cầu và phản hồi thực tế.

**[Tối ưu hóa]**
- Tối ưu hóa việc nhận diện nguồn yêu cầu gốc và yêu cầu từ tiện ích: Chuyển sang kết hợp giữa nhận diện chủ động, loại trừ ngược và bù trừ phân tầng phản hồi, giảm phán đoán sai nguồn gốc khi có các yêu cầu gửi liên tiếp, không còn phụ thuộc vào việc ước đoán khung thời gian (Time window).
- Che giấu mật khẩu Reverse Proxy trong JSON gốc: Khi tồn tại mật khẩu proxy trong thiết lập Reverse Proxy, trường `proxy_password` sẽ được che thành `***` ngay ở giai đoạn lưu dữ liệu, bảo đảm không lộ mật khẩu khi xem hoặc sao chép JSON gốc.
- Tinh giản chú thích mã nguồn trong JS, CSS và hướng dẫn sử dụng.
- Gỡ bỏ nhật ký nhấp chuột tạm thời và giao diện debug từng dùng để xử lý sự cố nhận diện nguồn gốc.

**[Sửa lỗi]**
- Sửa lỗi định vị và hiệu ứng nhấp nháy của nút "Thu gọn tất cả tin nhắn" trên từng bản ghi đơn lẻ, hiện tại khi nhấp sẽ định vị chính xác và làm nổi bật tin nhắn nhân vật đầu tiên bên trong bản ghi đó.
- Sửa lỗi tiêu chí đánh giá trường tin nhắn nội bộ của ST vô tình chứa các trường của bên thứ ba.

### [v1.16.0] - 2026-09-13

**[Thêm mới]**
- Cài đặt ưu tiên "Chế độ sáng/tối đồng bộ theo Theme ST": Sau khi bật, bảng điều khiển tiện ích sẽ tự động bám theo việc chuyển đổi giao diện sáng/tối của SillyTavern mà không cần chỉnh thủ công; có hiệu lực tức thì sau khi đổi Theme. Nút chuyển đổi sáng/tối thủ công sẽ tạm khóa khi tính năng này đang bật.

**[Tối ưu hóa]**
- Tái cấu trúc kiểu dáng nút nổi: Thiết kế lại ngoại quan và hiệu ứng tương tác, bổ sung 2 bộ phối màu sáng/tối tự động đảo chiều theo Theme hiện tại của ST để tránh bị chìm vào hình nền.
- Icon lối vào của nút nổi và menu tiện ích mở rộng đổi từ `fa-book` sang `fa-clock-rotate-left`, bám sát hơn với ngữ nghĩa truy vết lịch sử yêu cầu.
- Phân biệt thị giác cho bản ghi được ghim: Tăng độ dày dải màu nhận diện nguồn gốc của bản ghi được ghim, đồng thời điều chỉnh màu nền tĩnh và màu nền khi di chuột (Hover) để dễ phân biệt với bản ghi thông thường.
- Tối ưu hóa ngoại quan thông báo Toast: Loại bỏ hiệu ứng đổ bóng, thu gọn khoảng cách đệm (Padding).
- Tinh giản chú thích mã: Cắt giảm các ghi chú quá trình phát triển không liên quan.

## [v1.15.0] - 2026-09-07

**[Tối ưu hóa]**
- **Tương thích tiện ích thu gom nút nổi**: Nút nổi được tách từ Shadow DOM của bảng điều khiển chính thành Light DOM host độc lập (`#rlog-badge-host`) + Shadow Root riêng. Phần host mang đủ các thuộc tính `script_id`/`role`/`title`/`class`/định vị cố định để các plugin dạng khay chứa (Dock/Drawer) có thể nhận diện và gom gọn; sau khi gom gọn, nhấp vào lối vào tương ứng vẫn có thể mở bảng điều khiển của tiện ích này.

## [v1.14.0] - 2026-09-06

**[Thêm mới]**
- Ghim tạm thời: Nhấn giữ thanh tiêu đề của bản ghi đơn lẻ để ghim hoặc bỏ ghim. Bản ghi được ghim không chiếm vào giới hạn bản ghi thông thường, không bị dọn dẹp khi chạm trần số lượng; bản ghi ghim sẽ biến mất sau khi làm mới trang web.

**[Tối ưu hóa]**
- Dọn sạch bản ghi: Nút dọn sạch chỉ xóa các bản ghi thông thường và giữ lại bản ghi được ghim; khi không có bản ghi nào để dọn dẹp sẽ chuyển sang dùng thông báo Toast nhẹ nhàng.
- Theme ban ngày: Làm đậm thêm màu nền Hover của bản ghi và tin nhắn.

## [v1.13.0] - 2026-09-05

**[Thêm mới]**
- Lối vào nút nổi: Bổ sung lối vào dạng nổi, có thể thu gọn bảng điều khiển tiện ích thành một nút nổi nhỏ, nhấp vào nút nổi để khôi phục lại bảng; màu nút nổi tự động đổi theo Theme hiện tại.
- Cài đặt ưu tiên: Bổ sung bảng cài đặt ưu tiên, hỗ trợ các tùy chọn sau:
  - Dùng nút nổi làm lối vào mặc định: Mặc định hiển thị nút nổi khi khởi động tiện ích.
  - Toàn màn hình trên di động: Mặc định mở bảng điều khiển ở chế độ toàn màn hình khi dùng thiết bị di động.
  - Nhấp ra ngoài bảng điều khiển để đóng: Tự động đóng bảng điều khiển khi nhấp vào vùng bên ngoài.
  - Lưu trạng thái bộ lọc: Giữ nguyên trạng thái lọc hiện tại sau khi làm mới hoặc mở lại trang.
  - Chế độ tối giản: Tắt toàn bộ hiệu ứng chuyển cảnh và hoạt ảnh trong giao diện tiện ích.

**[Tối ưu hóa]**
- Hiển thị khi thu nhỏ: Tối ưu logic thu nhỏ và khôi phục của tiện ích, sau khi thu nhỏ bảng điều khiển sẽ chuyển sang dùng nút nổi làm lối vào.

## [v1.12.0] - 2026-08-30

**[Tối ưu hóa]**
- Kiểu dáng tiện ích được tích hợp cô lập toàn diện qua Shadow DOM: Bảng điều khiển, Popup và phần hướng dẫn sử dụng được đưa vào Shadow Root độc lập, ngăn chặn việc Theme bên thứ ba ghi đè lên icon, font chữ, độ đậm chữ, màu sắc,... của tiện ích.
- Tối ưu bộ điều khiển "Xem trước nội dung" trên thanh tiêu đề: Thay đổi từ thanh trượt phân đoạn "Ẩn/Xem trước" thành nút icon thông thường, dùng biểu tượng mở mắt/nhắm mắt để phân biệt trạng thái hiện tại.
- Tối ưu bộ chuyển đổi định dạng hiển thị trong cửa sổ "Xem toàn văn": Thay đổi từ thanh trượt phân đoạn "Sắp xếp/JSON" thành nút icon `{}` thông thường. Khi định dạng JSON được kích hoạt sẽ sử dụng màu nhấn (Accent color) và màu nền nổi bật để biểu thị trạng thái.

**[Sửa lỗi]**
- Sửa lỗi chữ trong tiện ích bị kế thừa thuộc tính đổ bóng chữ (Text Shadow) từ Theme bên thứ ba, khiến chữ xuất hiện quầng sáng mờ.
- Sửa lỗi thanh cuộn tùy chỉnh của tiện ích không thể cuộn bình thường dưới một số Theme bên thứ ba đặc thù.

## [v1.11.0] - 2026-08-22

**[Thêm mới]**
- Bổ sung tính năng lọc đa chiều: Hỗ trợ lọc theo nguồn yêu cầu (Gốc/Tiện ích mở rộng), loại Model cũng như vai trò tin nhắn, đi kèm các bước hướng dẫn tương ứng.
- Bổ sung khả năng bắt yêu cầu từ iframe cùng nguồn (Same-origin): Tự động nhận diện và ghi nhận các yêu cầu liên quan do các iframe nội suy cùng nguồn phát ra.

**[Tối ưu hóa]**
- Ẩn các nút thao tác phụ khi tiêu đề chính ở trạng thái thu gọn, chỉ giữ lại tiêu đề, số đếm và nút đóng để tránh bấm nhầm.

## [v1.10.0] - 2026-08-16

**[Thêm mới]**
- Bổ sung tính năng ghi lại đồng thời phản hồi của AI (Response): Tin nhắn cuối cùng ghi lại phản hồi thực tế của AI (bao gồm cả chuỗi suy nghĩ - Chain of Thought), thuận tiện cho việc kiểm tra nội dung phản hồi trước khi bị một số tiện ích khác cắt gọt xử lý.
- Bổ sung nhãn trạng thái phản hồi: Thành công / Thất bại / Quá hạn (5 phút).
- Bổ sung ghi nhận thông báo lỗi: Lý do thất bại được ghi trực tiếp vào khu vực nội dung phản hồi. Giữ lại phần nội dung đã nhận được nếu bị quá hạn hoặc bị ngắt đoạn.
- Bổ sung nút cuộn nhanh xuống đáy cho từng bản ghi: Một chạm cuộn ngay đến tin nhắn cuối cùng (thuận tiện cho việc xem phản hồi của AI).
- Bổ sung nút một chạm lên đỉnh / xuống đáy trong cửa sổ "Xem toàn văn".
- Bổ sung chỉ dẫn nhấp nháy tương tác: Khi thực hiện các thao tác cuộn xuống đáy / lên đỉnh / có bản ghi mới tới, bản ghi tương ứng sẽ nhấp nháy để dễ dàng định vị.

**[Tối ưu hóa]**
- Tinh giản định dạng số đếm tin nhắn: `~12,345 tokens / 8 条消息` được rút gọn thành `~12,345 tokens [8]`.
- Màu dải nhận diện khi di chuột lên thanh tiêu đề bản ghi sẽ tự động đổi theo nhãn nguồn gốc (Gốc/Tiện ích).
- Tối ưu hóa cấu trúc mã tầng dưới: Chuẩn hóa cấu trúc Style và Script cốt lõi, thống nhất quy chuẩn chú thích và quản lý tập trung bảng màu.

**[Sửa lỗi]**
- Sửa lỗi bản ghi do một số tiện ích bên thứ ba tạo ra chứa ký tự ngắt dòng CRLF dẫn đến việc bôi sáng tìm kiếm bị lệch vị trí.

## [v1.9.0] - 2026-08-11

**[Thêm mới]**
- Bổ sung tính năng "Xem toàn văn" (thay thế vị trí nút "Sao chép toàn bộ tin nhắn" cũ): Nhấp để xem toàn bộ nội dung yêu cầu, hỗ trợ chuyển đổi giữa hai định dạng "Sắp xếp / JSON", sao chép định dạng hiện tại chỉ với một chạm.
- Tổng số Token được chia làm 8 mức màu hiển thị khác nhau (`<4K` đến `>200K`), khi `>200K` sẽ kèm theo hiệu ứng nhấp nháy để dễ đánh giá dung lượng yêu cầu.
- Bổ sung một nút kiểm thử tạm thời (đã gỡ bỏ ở các phiên bản sau).

**[Tối ưu hóa]**
- Nút "Sao chép toàn bộ tin nhắn" ban đầu được chuyển vào giao diện "Xem toàn văn", đổi thành tính năng sao chép theo định dạng đang hiển thị.
- Khi nhận được yêu cầu mới trong lúc bảng điều khiển đang thu gọn/đóng, khi mở lại sẽ tự động nhảy đến bản ghi mới nhất thay vì giữ ở vị trí cũ.

**[Sửa lỗi]**
- Sửa lỗi tính năng ghim đỉnh của tiêu đề tin nhắn bị vô hiệu khi chiều rộng bảng điều khiển quá hẹp (như trên di động hoặc cửa sổ bị thu nhỏ).
- Sửa lỗi nhận bản ghi mới trong lúc đang chạy hướng dẫn sử dụng làm lệch khung chọn và làm mất bản ghi mới sau khi kết thúc hướng dẫn.
- Sửa lỗi thanh cuộn nổi đè lên trên thanh tiêu đề sau khi văn bản đã cuộn ra ngoài màn hình.
- Sửa lỗi kéo biểu tượng tam giác nhỏ ở góc dưới bên phải để đổi kích thước khiến giao diện bị co giãn đối xứng cả hai bên trái phải (hiện sửa thành chỉ dịch chuyển cạnh phải và cạnh dưới).

## [v1.8.0] - 2026-08-08

**[Thêm mới]**
- Bổ sung tính năng tìm kiếm nội bộ trong bản ghi, nhấp vào biểu tượng kính lúp bên phải bản ghi đơn lẻ để mở rộng khung tìm kiếm.
- Bôi sáng từ khóa theo thời gian thực (màu vàng khớp toàn bộ, màu cam mục khớp hiện tại) và hiển thị `Hiện tại / Tổng số`.
- Nhấp mũi tên lên xuống hoặc dùng phím tắt Enter / Shift+Enter để chuyển đổi giữa các kết quả, nhấn Esc hoặc nhấp lại kính lúp để thoát.
- Quản lý vòng đời trạng thái tìm kiếm: Các thao tác thu gọn, xóa, dọn sạch bản ghi đều sẽ tự động đặt lại (Reset) tìm kiếm.
- Bổ sung các bước hướng dẫn liên quan đến tìm kiếm vào phần hướng dẫn sử dụng tích hợp sẵn.

**[Tối ưu hóa]**
- Tối ưu tốc độ phản hồi trên di động trong kịch bản có lượng lớn tin nhắn; vô hiệu hóa một số hiệu ứng chuyển cảnh trên di động nhằm giảm tải chi phí render.

**[Sửa lỗi]**
- Sửa lỗi thanh tiến trình tùy chỉnh có thể gây ra hiện tượng giật lag khi mở rộng nhiều tin nhắn trên thiết bị di động.
- Sửa lỗi biểu tượng tam giác kéo đổi kích thước ở góc dưới bên phải trên di động bị thanh tiêu đề bản ghi đơn lẻ che khuất.

## [v1.7.0] - 2026-08-02

**[Tối ưu hóa]**
- Làm lại thanh cuộn khu vực tin nhắn, nâng cấp trải nghiệm cuộn văn bản dài trên thiết bị di động. Mở rộng vùng tương tác, khi nhấn giữ sẽ chuyển thành chấm tròn nhỏ hỗ trợ kéo định vị, giải quyết vấn đề thanh cuộn khó bấm và khó kéo.
- Tối ưu hóa logic định vị sau khi thu gọn và mở rộng: Mở rộng lại sau khi thu gọn sẽ tự động trở về vị trí bắt đầu của nội dung, giúp nhanh chóng quay lại đầu danh sách hoặc đầu văn bản.
- Tự động cuộn lên trên cùng khi có bản ghi mới xuất hiện, thuận tiện cho việc theo dõi nội dung mới nhất.
- Tối ưu quy trình thao tác xóa, bổ sung hộp thoại xác nhận; yêu cầu xác nhận lần hai khi xóa bản ghi lẻ hoặc xóa toàn bộ để tránh bấm nhầm.

## [v1.6.0] - 2026-07-26

**[Thêm mới]**
- Cho phép tùy chỉnh số lượng bản ghi tối đa, nhấp đúp vào vùng số đếm trên thanh tiêu đề để mở Popup cài đặt.
- Bổ sung tính năng mở rộng/thu gọn và xóa cho từng bản ghi lẻ, hiển thị icon bên phải khi ở trạng thái mở rộng.
- Bổ sung tính năng một chạm thu gọn toàn bộ bản ghi.
- Bổ sung tính năng xem trước nội dung tin nhắn, cho phép quét nhanh nội dung mà không cần mở rộng, đi kèm công tắc bật/tắt toàn cục.
- Bổ sung hiển thị tên Model của yêu cầu.
- Bổ sung hướng dẫn sử dụng tương tác tích hợp sẵn, tự động bật lên sau khi cài đặt lần đầu hoặc sau khi cập nhật.

**[Tối ưu hóa]**
- Tái cấu trúc toàn diện giao diện UI, tối ưu phong cách thị giác. Loại bỏ cấu trúc lồng nhau nhiều tầng, gia tăng mật độ thông tin.
- Các nút chức năng tần suất dùng thấp trên thanh tiêu đề được thu gọn vào mục "More", các nút chức năng của từng mục chỉ hiển thị khi mở rộng, giữ giao diện luôn gọn gàng.
- Đưa vào bộ Tokenizer gốc của ST, số đếm Token đạt độ chính xác cao thay vì ước tính sơ bộ.
- Cố định thanh tiêu đề không bị giật nảy khi thu gọn và mở rộng.
- Nâng mức giới hạn trần chiều cao của từng tin nhắn đơn lẻ, giải quyết bất tiện khi đọc văn bản dài.
- Loại bỏ thanh chỉnh kích thước thô dày ở đáy giao diện, đổi thành hình tam giác nhỏ nổi ở góc dưới bên phải.
- Bổ sung phản hồi trực quan khi tiện ích bị vô hiệu hóa: Thêm lớp phủ mờ thông báo sau khi tắt công tắc tổng, hiển thị chữ mờ nền khi ở trạng thái không có bản ghi.

## [v1.5.0] - 2026-06-10

**[Thêm mới]**
- Bổ sung tính năng nhận diện nguồn yêu cầu, gắn nhãn "Gốc" (Native) và "Tiện ích" (Plugin/Extension).

**[Tối ưu hóa]**
- Điều chỉnh chiều cao mặc định của bảng điều khiển.