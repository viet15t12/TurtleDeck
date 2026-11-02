# Study App

**Study App** là ứng dụng desktop (Electron) học tập ngoại tuyến (offline-first), hỗ trợ học tập đa năng thông qua Flashcard, Trắc nghiệm (Quiz), Luyện lệnh/Điền khuyết, Từ vựng ngoại ngữ và thuật toán lặp lại ngắt quãng (SRS - Spaced Repetition).

Toàn bộ dữ liệu bộ thẻ được lưu trữ cục bộ dưới dạng gói tệp tin độc lập `.sdeck`, không phụ thuộc vào internet hay dịch vụ đám mây, đảm bảo tối đa quyền riêng tư và tốc độ phản hồi.

---

## 🌟 Tính năng nổi bật

### 1. Định dạng bộ thẻ độc lập (`.sdeck`)
- Lưu trữ trọn gói câu hỏi, từ vựng và tài nguyên hình ảnh trong một tệp `.sdeck` (định dạng ZIP mở, an toàn).
- Dễ dàng chia sẻ, sao lưu hoặc di chuyển giữa các thiết bị mà không cần cơ sở dữ liệu cồng kềnh.

### 2. Ba loại bộ thẻ chuyên biệt
- **Hỏi - Đáp (`qa`)**: Dành cho flashcard lật thẻ truyền thống (ghi nhớ kiến thức, khái niệm).
- **Trắc nghiệm (`quiz`)**: Hỗ trợ câu hỏi đơn lựa chọn (`single`), nhiều lựa chọn (`multi`), điền khuyết (`fill`), và gõ câu lệnh (`command`).
- **Từ vựng ngoại ngữ (`vocab`)**: Quản lý từ vựng đầy đủ từ loại, phiên âm IPA, giải nghĩa, ví dụ, và các dạng biến thể từ.

### 3. Nhiều chế độ học tập đa dạng
- 🗂 **Flashcard**: Lật thẻ 2 chiều (trước/sau hoặc thuật ngữ/định nghĩa), tự đánh giá mức độ ghi nhớ.
- ✍️ **Luyện tập (Practice)**: Trắc nghiệm và điền câu trả lời có tính điểm tức thì, phản hồi chi tiết và giải thích đáp án.
- 🔄 **SRS (Spaced Repetition System)**: Thuật toán giãn cách SM-2 chuẩn hóa (Again, Hard, Good, Easy) với chu trình học thẻ mới và ôn thẻ đến hạn (`due`), tính toán theo mốc thời gian thực tế.
- 🧠 **Learn (Học thích ứng)**: Chu trình học qua nhiều vòng kết hợp nhiều hình thức câu hỏi cho đến khi nắm vững toàn bộ kiến thức.
- ⚡ **Match (Ghép thẻ)**: Trò chơi ghép cặp nhanh tính thời gian giữa câu hỏi - câu trả lời hoặc từ vựng - nghĩa.
- ⏱ **Exam (Thi thử)**: Mô phỏng phòng thi bấm giờ, chấm điểm tổng kết và tự động gom các câu làm sai vào chu trình ôn tập SRS.

### 4. Soạn thảo bộ thẻ mạnh mẽ (Deck Editor)
- Trình biên tập trực quan tạo mới và chỉnh sửa câu hỏi nhanh chóng.
- **Hỗ trợ Markdown & Công thức toán học LaTeX (KaTeX)**: Soạn thảo công thức trực quan với popover hỗ trợ ký hiệu toán học phong phú.
- **Quản lý hình ảnh**: Thêm ảnh minh họa trực tiếp vào gói `.sdeck`, xem trước kích thước lớn qua Lightbox.
- **Nhập hàng loạt (Bulk Import)**: Hỗ trợ nạp dữ liệu nhanh từ CSV, TSV, Quizlet, hoặc Markdown.
- **Lịch sử Undo / Redo**: Hoàn tác và làm lại thao tác soạn thảo linh hoạt, an toàn.

### 5. Hỗ trợ học ngoại ngữ & Từ vựng
- **Tự động sinh câu hỏi đa dạng**: Tự động sinh câu hỏi trắc nghiệm (MC), gõ từ (Write), điền khuyết theo ngữ cảnh (Cloze) và nghe chép chính tả (Listen & Write).
- **Text-to-Speech (TTS)**: Phát âm từ vựng và câu ví dụ chuẩn xác qua Web Speech API với bộ lọc chọn giọng đọc theo ngôn ngữ thông minh.

### 6. Bảo mật & Hiệu năng cao
- Renderer chạy hoàn toàn cô lập (`contextIsolation: true`, `nodeIntegration: false`), giao tiếp qua IPC an toàn (`preload.js`).
- Phục vụ ảnh nội bộ qua giao thức an toàn `asset://` với chính sách CSP nghiêm ngặt, chống path traversal.
- Toàn bộ nội dung hiển thị qua `DOMPurify` ngăn chặn triệt để mã độc XSS.
- Mọi thao tác ghi file (tiến độ, cài đặt, gói thẻ) đều đảm bảo tính nguyên tử (atomic write).

---

## 🛠 Môi trường phát triển

- **Hệ điều hành**: Fedora Linux, Ubuntu, macOS hoặc Windows.
- **Node.js**: Phiên bản LTS (Node.js 20 trở lên).
- **npm**: Đi kèm với Node.js.

---

## 🚀 Cài đặt và Khởi chạy

### 1. Cài đặt các gói phụ thuộc
```bash
npm install
```

### 2. Chạy ứng dụng ở chế độ phát triển
```bash
npm start
```
*Lưu ý: Ở lần chạy đầu tiên, Electron sẽ khởi tạo môi trường runtime.*

### 3. Đóng gói các bộ thẻ mẫu
Các bộ thẻ mẫu dạng thư mục nguồn nằm trong `data/samples-src/`. Để đóng gói thành các tệp `.sdeck` sẵn sàng mở trong app:
```bash
npm run build:samples
```
Các tệp đầu ra sẽ nằm tại `data/samples/` (bao gồm: `lpic-sample.sdeck`, `math-sample.sdeck`, `vocab-sample.sdeck`).

---

## 📁 Cấu trúc thư mục dự án

```text
studyApp/
├── data/
│   ├── samples/             # Các tệp bộ thẻ mẫu (.sdeck) đã đóng gói
│   └── samples-src/         # Thư mục nguồn của các bộ thẻ mẫu
├── src/
│   ├── app.js               # Điều phối giao diện chính của renderer
│   ├── index.html           # Khung HTML chính của ứng dụng
│   ├── tts.js               # Module phát âm Text-To-Speech
│   ├── core/                # Logic nghiệp vụ thuần (Pure ESM, kiểm thử độc lập)
│   │   ├── assetprotocol.js # Xử lý giao thức asset:// an toàn
│   │   ├── builder.js       # Sinh câu hỏi và bài tập từ bộ thẻ
│   │   ├── deckkinds.js     # Phân loại bộ thẻ (qa, quiz, vocab)
│   │   ├── deckmodel.js     # Thao tác dữ liệu bộ thẻ, item, undo/redo
│   │   ├── deckstats.js     # Thống kê tiến độ học tập và thẻ đến hạn
│   │   ├── exam.js          # Logic tạo đề và chấm bài thi thử
│   │   ├── filters.js       # Bộ lọc câu hỏi theo tag, topic, trạng thái
│   │   ├── grader.js        # Chấm điểm câu trả lời (trắc nghiệm, điền khuyết, regex)
│   │   ├── learnplanner.js  # Lập kế hoạch cho chế độ Learn thích ứng
│   │   ├── matchgame.js     # Logic trò chơi ghép thẻ (Match)
│   │   ├── richtext.js      # Parser Markdown + LaTeX (KaTeX) + DOMPurify
│   │   ├── sdeck.js         # Đọc / ghi gói file nén .sdeck
│   │   ├── srs.js           # Thuật toán lặp lại ngắt quãng SM-2
│   │   └── validate.js      # Kiểm tra tính hợp lệ của bộ thẻ và dữ liệu
│   ├── styles/              # CSS theo hệ thống Design Token và từng màn hình
│   └── views/               # Các màn hình và thành phần giao diện (UI modules)
│       ├── deck.js          # Màn hình chi tiết bộ thẻ
│       ├── editor/          # Toàn bộ module giao diện soạn thảo (Deck Editor)
│       ├── exam.js          # Màn hình thi thử
│       ├── home.js          # Màn hình danh sách bộ thẻ chính
│       ├── learn.js         # Màn hình chế độ học thích ứng (Learn)
│       ├── match.js         # Màn hình trò chơi ghép thẻ (Match)
│       ├── session.js       # Màn hình học Flashcard / Luyện tập
│       └── settings.js      # Màn hình cài đặt (SRS, âm thanh, dữ liệu)
├── test/                    # Các kịch bản kiểm thử tự động
├── tools/
│   ├── sdeck.mjs            # Công cụ CLI đóng gói và kiểm tra file .sdeck
│   └── gen-fixtures.mjs     # Công cụ sinh dữ liệu kiểm thử
├── main.js                  # Electron Main Process (quản lý cửa sổ, IPC, I/O)
├── preload.js               # Electron Preload Script (cầu nối bảo mật window.api)
└── package.json             # Cấu hình dự án và dependencies
```

---

## 📖 Tài liệu liên quan

- [`study-app.md`](./study-app.md): Đặc tả chi tiết sản phẩm, cấu trúc dữ liệu tệp `.sdeck` và các thuật toán.
- [`study-app-phases.md`](./study-app-phases.md): Kế hoạch phân chia giai đoạn phát triển và tiêu chuẩn nghiệm thu.
- [`study-app-architecture-ts-sqlite.md`](./study-app-architecture-ts-sqlite.md): Thiết kế kiến trúc định hướng TypeScript & SQLite.
- [`study-app-editor-ux.md`](./study-app-editor-ux.md): Đặc tả chi tiết giao diện và trải nghiệm người dùng của Deck Editor.

---
