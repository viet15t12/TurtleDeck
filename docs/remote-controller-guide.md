# Hướng dẫn sử dụng Phone Remote Controller (Điều khiển từ xa bằng Điện thoại)

Tính năng **Phone Remote Controller** cho phép bạn biến điện thoại thông minh thành một bàn điều khiển từ xa:
- **Laptop**: Để trước mặt hiển thị đề bài to, rõ ràng, hình ảnh và công thức Toán.
- **Điện thoại**: Cầm trên tay bấm chọn đáp án A/B/C/D, lật thẻ flashcard (SRS), và **đọc lời giải thích chi tiết** ngay trên màn hình điện thoại.

---

## 1. Cách sử dụng nhanh qua mạng Wi-Fi (Không cần Nginx)

1. Đảm bảo **Laptop** và **Điện thoại** đang kết nối **cùng một mạng Wi-Fi** (hoặc laptop phát Wi-Fi Hotspot cho điện thoại).
2. Mở ứng dụng **Turtle Deck** trên Laptop và vào một bộ thẻ để học (chế độ Học / Luyện thi / Flashcard).
3. Ở thanh trên cùng (Topbar), bấm nút **`📱 Remote`**.
4. Hộp thoại kết nối sẽ hiện ra với:
   - **Mã QR Code**: Bạn dùng Camera điện thoại để quét mã.
   - **Địa chỉ IP**: Ví dụ `http://192.168.1.15:8765`.
   - **Mã PIN 4 số**: Ví dụ `4829`.
5. Trên điện thoại:
   - Quét mã QR hoặc gõ địa chỉ IP vào trình duyệt (Safari, Chrome).
   - Nhập **mã PIN 4 số** trên màn hình điện thoại.
   - Bấm **✓** hoặc điện thoại sẽ tự động kết nối sau khi nhập đủ 4 số.
6. Màn hình điện thoại sẽ chuyển sang giao diện điều khiển:
   - **Trắc nghiệm**: 4 nút lớn **A**, **B**, **C**, **D** (có rung nhẹ haptic). Bấm là laptop nhận đáp án tức thì. Khi có giải thích, khung giải thích sẽ hiện ngay trên điện thoại để bạn đọc.
   - **Flashcard**: Nút lớn **LẬT THẺ** $\rightarrow$ Sau khi lật hiện 4 mức đánh giá SRS: **Lại (1)**, **Khó (2)**, **Tốt (3)**, **Dễ (4)**.
   - Điều hướng: Nút **Câu trước** và **Câu tiếp** ở cạnh dưới màn hình.

---

## 2. Cách kết nối qua Nginx Reverse Proxy (Tùy chọn)

Nếu bạn muốn truy cập qua cổng 80 (không cần gõ `:8765`) hoặc qua tên miền cục bộ (ví dụ: `http://study.local`):

### Bước 1: Sao chép cấu hình Nginx
Dùng file mẫu sẵn có tại [`docs/nginx-remote-controller.conf`](file:///home/vfedora/work/07_project/studyApp/docs/nginx-remote-controller.conf):

```bash
sudo cp docs/nginx-remote-controller.conf /etc/nginx/conf.d/turtle-remote.conf
```

### Bước 2: Kiểm tra và nạp lại Nginx
```bash
sudo nginx -t
sudo systemctl reload nginx
```

### Bước 3: Truy cập
Bây giờ từ điện thoại, bạn chỉ cần gõ IP của Laptop (ví dụ `http://192.168.1.15`) hoặc tên miền `http://study.local` là vào thẳng bộ điều khiển!

---

## 3. Cơ chế bảo mật (Security)

- **Mã PIN**: Mỗi phiên chạy có một mã PIN 4 số. Bạn có thể bấm **"🔄 Đổi PIN"** bất kỳ lúc nào để sinh mã mới.
- **Session Token**: Sau khi nhập đúng PIN, điện thoại nhận được một mã Token ngẫu nhiên (UUID v4) lưu trong `sessionStorage`. Thiết bị lạ trong mạng LAN nếu không có PIN sẽ không thể gửi lệnh hay xem câu hỏi/lời giải.
- **Zero Internet Leak**: Toàn bộ luồng kết nối chạy trực tiếp trong mạng nội bộ LAN, không qua bất kỳ máy chủ bên thứ ba nào.
