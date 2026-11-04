# Bảng Kiểm thử Thị giác WebKit (Visual QA)

Bảng theo dõi hiển thị giao diện người dùng trên WebKitGTK (Linux) và WebView2 (Windows). Nếu phát hiện lỗi giao diện đặc thù WebKit, ghi nhận tại đây và xử lý tập trung trong file `src/styles/webkit-fixes.css`.

---

## 1. Danh sách màn hình & Thành phần

| Màn hình / Thành phần | Linux (WebKitGTK) | Windows (WebView2) | Ghi chú & Lỗi phát hiện | Trạng thái |
|---|---|---|---|---|
| **Màn Home** (Danh sách bộ thẻ, sidebar) | ☑ | ☑ | Hiển thị icon, khoảng cách, font chữ, badge bộ thẻ sắc nét | Đạt (Pass) |
| **Cây thư mục** (Kéo thả, đóng/mở) | ☑ | ☑ | Sidebar phong cách Nautilus, hiển thị cây phân cấp và bookmark | Đạt (Pass) |
| **Màn Session** (Học thẻ SRS) | ☑ | ☑ | Thẻ câu hỏi, thanh tiến độ phân đoạn, công thức KaTeX căn chuẩn | Đạt (Pass) |
| **Màn Feedback** (Kết quả trả lời) | ☑ | ☑ | Banner kết quả đúng/sai, giải thích KaTeX, nút đánh giá SRS chuẩn | Đạt (Pass) |
| **Màn Editor** (Biên soạn bộ thẻ) | ☑ | ☑ | Thanh công cụ ký hiệu toán KaTeX, live preview, danh sách thẻ | Đạt (Pass) |
| **Màn Stats** (Thống kê & biểu đồ) | ☑ | ☑ | Chart.js biểu đồ cột stacked, heatmap 90 ngày, streak hoạt động | Đạt (Pass) |
| **Màn Settings** (Cài đặt) | ☑ | ☑ | Form cài đặt, chọn thư mục, chuyển tab và toggle theme | Đạt (Pass) |
| **Màn Learn** (Học tập tự do) | ☑ | ☑ | Chế độ câu hỏi trắc nghiệm, điền từ khuyết, gõ lệnh | Đạt (Pass) |
| **Màn Match** (Ghép thẻ tính giờ) | ☑ | ☑ | Lưới 12 thẻ cân đối, hiệu ứng chọn thẻ, đồng hồ đếm giây chuẩn | Đạt (Pass) |
| **Màn Exam** (Thi thử) | ☑ | ☑ | Danh sách câu hỏi thi, nộp bài tính điểm | Đạt (Pass) |

---

## 2. Các điểm rủi ro cần lưu ý đặc biệt

1. **Hiển thị KaTeX**: Các công thức toán học inline và block ($\KaTeX$) render có thẳng hàng và đúng ký hiệu không.
2. **Hàm màu `color-mix`**: Kiểm tra các token màu nền và viền có hiển thị đúng tone màu mong muốn không.
3. **Thanh cuộn `::-webkit-scrollbar`**: Thanh cuộn có đúng kích thước mảnh (thin) và màu theo theme không.
4. **Phát âm TTS (`speechSynthesis`)**: Kiểm tra xem WebKitGTK có đọc được từ vựng tiếng Anh/Việt không (cần gói `speech-dispatcher`).
5. **Hiển thị hình ảnh từ custom scheme `asset://`**: Hình ảnh minh hoạ trong thẻ học có load mượt mà, đúng kích thước và không bị vỡ không.

