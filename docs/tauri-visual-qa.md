# Bảng Kiểm thử Thị giác WebKit (Visual QA)

Bảng theo dõi hiển thị giao diện người dùng trên WebKitGTK (Linux) và WebView2 (Windows). Nếu phát hiện lỗi giao diện đặc thù WebKit, ghi nhận tại đây và xử lý tập trung trong file `src/styles/webkit-fixes.css`.

---

## 1. Danh sách màn hình & Thành phần

| Màn hình / Thành phần | Linux (WebKitGTK) | Windows (WebView2) | Ghi chú & Lỗi phát hiện | Trạng thái |
|---|---|---|---|---|
| **Màn Home** (Danh sách bộ thẻ, sidebar) | ☐ | ☐ | Kiểm tra hiển thị icon, khoảng cách, font | Chưa test |
| **Cây thư mục** (Kéo thả, đóng/mở) | ☐ | ☐ | Kiểm tra hiệu ứng hover, drop target | Chưa test |
| **Màn Session** (Học thẻ SRS) | ☐ | ☐ | Thẻ câu hỏi, nút lật thẻ, thanh tiến độ | Chưa test |
| **Màn Feedback** (Kết quả trả lời) | ☐ | ☐ | Banner, nút đánh giá SRS, phím tắt | Chưa test |
| **Màn Editor** (Biên soạn bộ thẻ) | ☐ | ☐ | Bảng danh sách câu hỏi, form nhập | Chưa test |
| **Màn Stats** (Thống kê & biểu đồ) | ☐ | ☐ | Chart.js biểu đồ đường/cột, heatmap 90 ngày | Chưa test |
| **Màn Settings** (Cài đặt) | ☐ | ☐ | Form cài đặt, nút bấm, chuyển tab | Chưa test |
| **Màn Learn** (Học tập tự do) | ☐ | ☐ | Chế độ câu hỏi trắc nghiệm, gõ từ | Chưa test |
| **Màn Match** (Ghép thẻ tính giờ) | ☐ | ☐ | Lưới ghép thẻ, đồng hồ đếm giây | Chưa test |
| **Màn Exam** (Thi thử) | ☐ | ☐ | Danh sách câu hỏi thi, nộp bài | Chưa test |

---

## 2. Các điểm rủi ro cần lưu ý đặc biệt

1. **Hiển thị KaTeX**: Các công thức toán học inline và block ($\KaTeX$) render có thẳng hàng và đúng ký hiệu không.
2. **Hàm màu `color-mix`**: Kiểm tra các token màu nền và viền có hiển thị đúng tone màu mong muốn không.
3. **Thanh cuộn `::-webkit-scrollbar`**: Thanh cuộn có đúng kích thước mảnh (thin) và màu theo theme không.
4. **Phát âm TTS (`speechSynthesis`)**: Kiểm tra xem WebKitGTK có đọc được từ vựng tiếng Anh/Việt không (cần gói `speech-dispatcher`).
5. **Hiển thị hình ảnh từ custom scheme `asset://`**: Hình ảnh minh hoạ trong thẻ học có load mượt mà, đúng kích thước và không bị vỡ không.
