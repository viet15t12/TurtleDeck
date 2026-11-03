# 🐢 Turtle Deck

<p align="center">
  <img src="./build/icons/256x256.png" alt="Turtle Deck Logo" width="128" height="128">
  <br>
  <strong>Ứng dụng học tập offline-first bằng flashcard, trắc nghiệm và giãn cách ngắt quãng (SRS)</strong>
</p>

---

## 📖 Giới thiệu

**Turtle Deck** là ứng dụng desktop (Electron + SQLite + TypeScript) dành cho việc học tập sâu, ôn luyện bền bỉ và cá nhân hóa:
- **Tập trung & Kiên trì**: Lấy cảm hứng từ hình tượng chú rùa kiên nhẫn, Turtle Deck chú trọng việc ghi nhớ dài hạn thông qua thuật toán lặp lại ngắt quãng (Spaced Repetition System - SRS).
- **Offline-First & Bảo mật**: Toàn bộ dữ liệu bộ thẻ và tiến trình được lưu trữ hoàn toàn cục bộ trên máy tính của bạn dưới định dạng `.sdeck` độc lập. Không cần tài khoản, không phụ thuộc internet hay máy chủ đám mây, bảo vệ quyền riêng tư tuyệt đối.
- **Đa năng**: Hỗ trợ đầy đủ từ Flashcard truyền thống, Trắc nghiệm (Quiz), Điền từ khuyết, Gõ lệnh lập trình, Ghép thẻ nhanh, Thi thử bấm giờ, đến Từ vựng ngoại ngữ kèm phát âm Text-to-Speech (TTS).

---

## 🚀 Cài đặt & Khởi chạy

### 1. Dùng trực tiếp qua AppImage (Linux đa nền tảng)
Tải tệp `Turtle Deck-0.1.0.AppImage` trong thư mục `release/`, cấp quyền thực thi và mở ứng dụng:
```bash
chmod +x "Turtle Deck-0.1.0.AppImage"
./"Turtle Deck-0.1.0.AppImage"
```

### 2. Cài đặt trên Fedora / RHEL qua gói RPM
Trên Fedora hoặc các bản phân phối họ Red Hat:
```bash
sudo dnf install ./release/turtle-deck-0.1.0.x86_64.rpm
```
Sau khi cài đặt, hệ thống sẽ tự động liên kết định dạng `.sdeck` (`application/x-studydeck`) với Turtle Deck và xuất hiện trong menu ứng dụng (Education).

### 3. Chạy từ mã nguồn (Dành cho nhà phát triển)
Yêu cầu: **Node.js >= 20** và **npm**.
```bash
# 1. Cài đặt các gói phụ thuộc
npm install

# 2. Biên dịch mã nguồn (TypeScript & Assets)
npm run build

# 3. Đóng gói các bộ thẻ mẫu
npm run build:samples

# 4. Khởi chạy ứng dụng
npm start
```

### 4. Đóng gói phân phối
```bash
# Tạo bản cài đặt AppImage và RPM trong thư mục release/
npm run dist
```

---

## 📦 Định dạng bộ thẻ `.sdeck` & Cứu dữ liệu khẩn cấp

### 1. Cấu trúc gói `.sdeck`
Một tệp `.sdeck` thực chất là **một gói lưu trữ ZIP tiêu chuẩn (không mã hóa)** chứa:
- `deck.json`: Siêu dữ liệu bộ thẻ (`meta`), danh sách câu hỏi/thẻ học (`items`), cấu hình và liên kết.
- `img/`: Thư mục chứa toàn bộ hình ảnh minh họa (PNG, JPG, GIF, WebP, SVG).

Toàn bộ gói được đọc trực tiếp vào bộ nhớ và phục vụ hình ảnh qua giao thức nội bộ an toàn `asset://`, không bao giờ giải nén rác ra ổ đĩa.

### 2. Cứu dữ liệu khẩn cấp (Data Rescue)
Nếu một tệp `.sdeck` bị lỗi phần mềm, bạn muốn lấy lại nội dung thủ công hoặc muốn trích xuất dữ liệu mà không cần mở ứng dụng:
1. **Đổi đuôi tệp**: Đổi tên `ten_bo_the.sdeck` thành `ten_bo_the.zip`.
2. **Giải nén**: Nhấp đúp chuột hoặc dùng bất kỳ công cụ giải nén ZIP nào (Archive Manager, 7-Zip, WinRAR, lệnh `unzip`):
   ```bash
   unzip ten_bo_the.zip -d thu_muc_giai_nen/
   ```
3. Xem và chỉnh sửa trực tiếp tệp `deck.json` hoặc sao chép các ảnh trong thư mục `img/`.

### 3. Công cụ dòng lệnh `tools/sdeck.mjs`
Dự án đi kèm bộ công cụ CLI tiện ích:
```bash
# Giải nén một file .sdeck ra thư mục
node tools/sdeck.mjs unpack data/samples/math-sample.sdeck temp/math-deck

# Đóng gói một thư mục thành file .sdeck
node tools/sdeck.mjs pack temp/math-deck my-math.sdeck

# Kiểm tra tính toàn vẹn và dung lượng gói
node tools/sdeck.mjs check my-math.sdeck

# Đóng gói tất cả thư mục mẫu
node tools/sdeck.mjs pack-all data/samples-src data/samples
```

---

## ✍️ Soạn thảo bộ thẻ bằng Deck Editor

Trình soạn thảo **Deck Editor** tích hợp sẵn cung cấp trải nghiệm mượt mà, chuyên nghiệp:

### 1. Phân loại bộ thẻ (`kind`)
- **Hỏi - Đáp (`qa`)**: Chuyên về thẻ ghi nhớ flashcard (Mặt trước / Mặt sau).
- **Trắc nghiệm (`quiz`)**: Hỗ trợ 4 định dạng câu hỏi linh hoạt:
  - `single`: Trắc nghiệm 1 đáp án đúng (tự động xáo trộn lựa chọn).
  - `multi`: Trắc nghiệm chọn nhiều đáp án đúng.
  - `fill`: Điền từ/cụm từ vào chỗ trống (hỗ trợ nhiều đáp án tương đương).
  - `command`: Luyện gõ lệnh terminal/code với tùy chọn bỏ qua khoảng trắng hoặc kiểm tra regex.
- **Từ vựng ngoại ngữ (`vocab`)**: Quản lý từ vựng kèm phiên âm IPA, từ loại (pos), định nghĩa, ví dụ câu, và hỗ trợ phát âm TTS.

### 2. Soạn thảo Markdown & Công thức toán LaTeX (KaTeX)
- **Định dạng văn bản**: Hỗ trợ in đậm (`**text**`), in nghiêng (`*text*`), code inline (`` `code` ``), khối trích dẫn (`> quote`), danh sách.
- **Công thức toán học**:
  - Công thức trong dòng (inline): `$E = mc^2$` hoặc `$\alpha + \beta = \gamma$`.
  - Khối công thức nổi bật (block):
    ```markdown
    $$\int_{a}^{b} f(x) dx = F(b) - F(a)$$
    ```
  - Thanh công cụ toán học (Math Toolbar) trực quan giúp chèn nhanh các ký hiệu phân số, tích phân, căn bậc hai, ma trận và chữ cái Hy Lạp.

### 3. Quản lý hình ảnh
- Chèn ảnh vào thẻ câu hỏi dễ dàng qua nút bấm hoặc kéo thả file ảnh vào khung soạn thảo.
- Tự động đặt tên an toàn dạng `img/asset_xxxx.png` và nén tối ưu.
- Xem trước ảnh kích thước lớn qua tính năng Lightbox.

### 4. An toàn dữ liệu & Lịch sử
- **Tự động lưu nháp (Auto-draft)**: Mỗi 30 giây, trình soạn thảo tự động ghi một bản nháp vào thư mục dữ liệu cục bộ. Nếu ứng dụng bị đóng đột ngột, khi mở lại bạn sẽ được hỏi có muốn khôi phục bản nháp chưa lưu hay không.
- **Lịch sử Undo / Redo**: Nhấn `Ctrl+Z` để hoàn tác và `Ctrl+Y` (`Ctrl+Shift+Z`) để làm lại mọi thao tác thêm, xóa, sửa nội dung thẻ.

---

## 📥 Nhập dữ liệu hàng loạt (Bulk Import)

Bạn có thể đưa dữ liệu sẵn có vào Turtle Deck chỉ trong vài giây:
1. Nhấn nút **Nhập hàng loạt** trong Deck Editor.
2. Dán nội dung theo một trong các định dạng:
   - **CSV / TSV**: Hỗ trợ phân cách bằng dấu tab (`\t`), dấu phẩy (`,`), hoặc dấu chấm phẩy (`;`).
   - **Quizlet**: Sao chép danh sách thẻ từ Quizlet (mặc định phân cách giữa thuật ngữ và định nghĩa bằng Tab, giữa các thẻ bằng dòng mới).
   - **Markdown**: Danh sách dạng danh mục hoặc bảng Markdown.
3. Xem trước (Preview) kết quả phân tích dữ liệu trước khi đồng ý nạp vào bộ thẻ.

---

## 🧠 Các chế độ học tập

| Chế độ | Mô tả |
| :--- | :--- |
| **Flashcard** | Lật thẻ 2 chiều (Trước ↔ Sau hoặc Thuật ngữ ↔ Định nghĩa). Tự đánh giá mức độ nhớ theo 4 nút: `Again`, `Hard`, `Good`, `Easy`. |
| **Luyện tập (Practice)** | Làm trắc nghiệm và điền câu trả lời, có chấm điểm tức thì kèm giải thích chi tiết đáp án. |
| **SRS (Spaced Repetition)** | Thuật toán SM-2 chuẩn hóa: tính toán khoảng cách ngày ôn tập tự động dựa trên lịch sử nhớ/quên, tối ưu hóa thời gian học. |
| **Học thích ứng (Learn)** | Vòng lặp học thông minh: tự động đưa lại các câu chưa thuộc ở các hình thức khác nhau cho đến khi bạn nắm vững 100%. |
| **Ghép thẻ (Match)** | Trò chơi ghép cặp nhanh giữa câu hỏi và đáp án, đua tốc độ bảng vàng cá nhân. |
| **Thi thử (Exam)** | Đề thi bấm giờ tổng hợp ngẫu nhiên, chấm điểm phần trăm và tự động gom các câu làm sai để bạn ôn lại. |

---

## ⌨️ Bảng phím tắt tiện lợi (Shortcuts)

| Màn hình | Phím tắt | Chức năng |
| :--- | :--- | :--- |
| **Chung** | `Ctrl + O` | Mở tệp bộ thẻ `.sdeck` |
| | `Ctrl + ,` | Mở màn hình Cài đặt |
| | `Esc` | Quay lại màn hình chính (Home) |
| **Học tập (Session)** | `Space` / `Enter` | Lật thẻ Flashcard hoặc nộp câu trả lời |
| | `1`, `2`, `3`, `4` | Chọn đáp án trắc nghiệm hoặc đánh giá SRS (`Again`, `Hard`, `Good`, `Easy`) |
| | `S` | Đánh dấu sao (Star) câu hỏi để ôn lại sau |
| | `R` | Nghe lại phát âm Text-To-Speech (với thẻ từ vựng) |
| **Soạn thảo (Editor)** | `Ctrl + S` | Lưu bộ thẻ |
| | `Ctrl + N` | Thêm thẻ / câu hỏi mới |
| | `Ctrl + Z` | Hoàn tác (Undo) |
| | `Ctrl + Y` / `Ctrl + Shift + Z` | Làm lại (Redo) |
| | `Ctrl + M` | Bật/tắt thanh công thức toán học LaTeX |

---

## 🛡️ An toàn & Sao lưu dữ liệu (Backup)

- **Thư viện mặc định**: Ứng dụng tự động theo dõi thư mục `~/StudyDecks`. Mọi tệp `.sdeck` bạn lưu vào đây sẽ lập tức xuất hiện trên màn hình chính của ứng dụng.
- **Tự động sao lưu tiến trình (Daily Auto-Backup)**: Mỗi ngày học tập, Turtle Deck tự động tạo bản sao lưu tiến trình và lịch sử học vào thư mục `userData/backups/`, tự động giữ 7 bản sao mới nhất.
- **Xuất / Nhập thủ công**: Trong phần **Cài đặt**, bạn có thể xuất toàn bộ tiến độ ra tệp `.json` để chuyển sang máy khác, hoặc nhập lại dữ liệu bất cứ lúc nào.
- **An toàn giao thức & Bộ nhớ**: Kiểm duyệt mã độc bằng DOMPurify, Content Security Policy nghiêm ngặt (chặn kết nối mạng ngoài, cô lập iframe, vô hiệu hóa eval), bảo vệ hệ thống tuyệt đối.

---

## ⚖️ Giấy phép

Dự án phát hành dưới giấy phép mã nguồn mở ISC License.
Logo & thương hiệu thuộc về dự án **Turtle Deck**.
