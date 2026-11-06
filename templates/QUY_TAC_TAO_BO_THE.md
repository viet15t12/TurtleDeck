# 📝 Hướng Dẫn & Quy Tắc Soạn Bộ Thẻ Ngoài Editor (Turtle Deck)

Tài liệu này hướng dẫn chi tiết cách tạo và nhập dữ liệu học tập vào **Turtle Deck** từ các phần mềm quen thuộc (Notepad, VS Code, Excel, Google Sheets, Obsidian, Logseq...) mà **không cần mở trình soạn thảo (Deck Editor)** của ứng dụng.

---

## 🎯 Hai phương thức tạo bộ thẻ ngoài Editor

| Phương thức | Định dạng tệp | Cách sử dụng | Ưu điểm |
| :--- | :--- | :--- | :--- |
| **Cách 1: Nhập hàng loạt (Bulk Import)** | `.txt`, `.csv`, `.tsv`, `.md` | Mở ứng dụng → Chọn nút **Nhập hàng loạt** → Dán hoặc nạp tệp | Nhanh, linh hoạt, dùng được cho danh sách từ vựng, đề trắc nghiệm chép từ tài liệu. |
| **Cách 2: Đóng gói trực tiếp thành `.sdeck`** | `.json` (`deck.json`) + thư mục ảnh `img/` | Dùng lệnh CLI `tools/sdeck.mjs pack` hoặc công cụ nén `zip` | Tự động hóa hoàn toàn, nạp hàng ngàn câu kèm ảnh mà không cần mở giao diện app. |

---

## 1. Định dạng `.txt` (Kiểu Quizlet / Flashcard cơ bản)

Tệp văn bản thuần, mỗi dòng biểu diễn một thẻ học, phân cách giữa thuật ngữ và định nghĩa bằng **phím Tab (`\t`)**.

- **File mẫu:** [`templates/sample.txt`](./sample.txt)
- **Quy tắc:**
  ```text
  <Mặt trước / Thuật ngữ> [TAB] <Mặt sau / Định nghĩa / Nghĩa>
  ```
- **Ví dụ:**
  ```text
  turtle	con rùa (biểu tượng bền bỉ của Turtle Deck)
  algorithm	tập hợp các chỉ thị giải quyết vấn đề
  $E = mc^2$	Hệ thức liên hệ giữa khối lượng và năng lượng của Einstein
  $$\lim_{x \to 0} \frac{\sin x}{x} = 1$$	Giới hạn cơ bản trong giải tích
  ```
- **Mẹo:**
  - Hỗ trợ đầy đủ công thức toán học LaTeX: kẹp giữa `$ công_thức $` (trong dòng) hoặc `$$ khối_công_thức $$`.
  - Có thể copy trực tiếp từ tính năng **Export** của Quizlet rồi dán vào Turtle Deck.

---

## 2. Định dạng `.csv` & `.tsv` (Bảng tính Excel / Google Sheets)

Thích hợp cho danh sách từ vựng ngoại ngữ đầy đủ phiên âm, từ loại, câu ví dụ và nhãn phân loại.

- **File mẫu CSV:** [`templates/sample.csv`](./sample.csv)
- **File mẫu TSV:** [`templates/sample.tsv`](./sample.tsv)
- **Quy tắc cột (Header hàng 1):**
  Ứng dụng tự động nhận diện các tên cột bằng tiếng Anh hoặc tiếng Việt (không phân biệt chữ hoa/thường):
  - `term` (hoặc `word`, `từ`, `vocab`): Thuật ngữ / Từ vựng *(Bắt buộc)*
  - `definition` (hoặc `meaning`, `nghĩa`): Giải nghĩa *(Bắt buộc)*
  - `phonetic` (hoặc `ipa`, `phiên âm`): Phiên âm IPA
  - `pos` (hoặc `từ loại`, `partofspeech`): Từ loại (`noun`, `verb`, `adj`, `adv`, `phrase`...)
  - `example` (hoặc `ví dụ`, `sentence`): Câu ví dụ minh họa
  - `forms` (hoặc `dạng từ`): Các biến thể từ (phân cách bằng dấu chấm phẩy `;`)
  - `synonyms` (hoặc `từ đồng nghĩa`): Từ đồng nghĩa (phân cách bằng dấu `;`)
  - `tags` (hoặc `chủ đề`, `topic`, `nhãn`): Thẻ phân loại (phân cách bằng dấu `;`)
  - `image` (hoặc `ảnh`): Đường dẫn tệp ảnh (vd: `img/photo.png`)

- **Ví dụ CSV:**
  ```csv
  term,definition,phonetic,pos,example,tags
  turtle,con rùa,/ˈtɜː.təl/,noun,The turtle moves steadily.,biology;nature
  persistent,kiên trì bền bỉ,/pəˈsɪs.tənt/,adj,She was persistent in her studies.,vocab;advanced
  "E = mc^2","Năng lượng nghỉ tỉ lệ với khối lượng",,/formula,"Hệ thức nổi tiếng của Einstein: E = mc^2",physics
  ```

- **Lưu ý định dạng CSV (RFC 4180):**
  - Nếu nội dung ô có chứa dấu phẩy `,` hoặc dấu xuống dòng, hãy đặt toàn bộ ô trong dấu ngoặc kép `"..."`.
  - Nếu bên trong ô có dấu ngoặc kép, hãy gõ 2 lần: `""`.

---

## 3. Định dạng `.md` (Markdown Quiz & Markdown Vocab)

Định dạng Markdown lý tưởng cho các câu hỏi trắc nghiệm phức tạp hoặc ghi chép từ vựng trong Obsidian / VS Code.

### A. Markdown Trắc nghiệm & Bài tập (Quiz)
- **File mẫu:** [`templates/sample-quiz.md`](./sample-quiz.md) hoặc [`templates/sample.md`](./sample.md)
- **Cấu trúc một câu hỏi:**
  ```markdown
  ## Q <mã_id> | <loại_câu> | topic=<chủ_đề> | tags=<tag1,tag2>
  Nội dung câu hỏi (hỗ trợ Markdown, công thức $LaTeX$ và ảnh).
  - [ ] Lựa chọn sai 1
  - [x] Lựa chọn đúng
  - [ ] Lựa chọn sai 2
  > Giải thích chi tiết đáp án tại đây (bắt đầu bằng dấu >).
  ```

- **Các loại câu hỏi (`<loại_câu>`):**
  1. `single`: Trắc nghiệm 1 đáp án đúng (đánh dấu `- [x]`).
  2. `multi`: Trắc nghiệm nhiều đáp án đúng (đánh dấu nhiều ô `- [x]`).
  3. `fill`: Điền từ vào chỗ trống `[___]`:
     ```markdown
     ## Q fill_1 | fill | topic=Lịch sử
     Thủ đô của Việt Nam là [___]?
     answer: Hà Nội | Ha Noi | Hanoi
     > Hà Nội là thủ đô của Việt Nam.
     ```
  4. `command`: Luyện gõ lệnh code / terminal:
     ```markdown
     ## Q cmd_1 | command | topic=Linux
     Gõ lệnh xem thư mục hiện tại:
     answer: pwd
     match: normalized
     ```
  5. `translate`: Dịch câu có sử dụng từ gợi ý bắt buộc (Key Word Transformation):
     ```markdown
     ## Q tr_1 | translate | topic=Tiếng Anh | tags=writing,grammar
     Tôi đã ngăn anh ấy bỏ cuộc.
     keyword: prevent (v)
     pattern: prevent\s+\w+\s+from\s+\w+ing
     answer: I prevented him from giving up. | I prevented him from quitting.
     > Cấu trúc: prevent someone from doing something. Thì quá khứ đơn chia 'prevented'.
     ```
  - **Tùy chọn kiểu chấm (`match`):**
    - `normalized`: Chuẩn hóa khoảng trắng và chữ hoa/thường (mặc định).
    - `exact`: Khớp chính xác 100% từng ký tự.
    - `regex`: Kiểm tra biểu thức chính quy.
    - `number`: So sánh số học (có thể kèm `tolerance: 0.01`).
    - `latex`: So sánh tương đương biểu thức toán học.

### B. Markdown Từ vựng (Vocab)
- **File mẫu:** [`templates/sample-vocab.md`](./sample-vocab.md)
- **Cấu trúc:**
  ```markdown
  ## <từ_vựng> | <phiên_âm> | <từ_loại>
  - definition: Giải nghĩa từ
  - example: Câu ví dụ chứa từ vựng
  - forms: biến thể 1, biến thể 2
  - synonyms: từ đồng nghĩa 1, từ đồng nghĩa 2
  - tags: nhãn 1, nhãn 2
  ```

---

## 4. Định dạng `.json` (`deck.json`) — Đóng gói trực tiếp thành `.sdeck`

Đây là định dạng gốc của Turtle Deck. Bạn có thể tự viết file này hoặc dùng script để sinh hàng ngàn câu hỏi.

- **File mẫu:** [`templates/sample.json`](./sample.json) và [`templates/sample-translate.json`](./sample-translate.json)
- **Cấu trúc JSON chuẩn:**
  ```json
  {
    "meta": {
      "id": "my-custom-deck",
      "title": "Tên bộ thẻ của bạn",
      "kind": "quiz",
      "lang": "vi",
      "format": "studydeck",
      "formatVersion": 1
    },
    "items": [
      {
        "id": "q1",
        "type": "card",
        "front": "Mặt trước: Câu hỏi?",
        "back": "Mặt sau: Câu trả lời!"
      },
      {
        "id": "q2",
        "type": "single",
        "question": "Câu hỏi trắc nghiệm?",
        "choices": ["Lựa chọn A", "Lựa chọn B", "Lựa chọn C", "Lựa chọn D"],
        "answer": [1],
        "explanation": "Giải thích vì sao B đúng."
      },
      {
        "id": "q3",
        "type": "fill",
        "question": "Điền vào chỗ trống: $1 + 1 =$ [___]?",
        "answer": ["2", "hai"],
        "match": "normalized"
      },
      {
        "id": "q4",
        "type": "translate",
        "vi": "Tôi đã ngăn anh ấy bỏ cuộc.",
        "keyword": "prevent",
        "pos": "v",
        "pattern": "prevent\\s+\\w+\\s+from\\s+\\w+ing",
        "answers": [
          "I prevented him from giving up.",
          "I prevented him from quitting."
        ],
        "explanation": "Cấu trúc: prevent someone from doing something."
      }
    ]
  }
  ```

> [!IMPORTANT]
> **Quy tắc quan trọng trong JSON:**
> 1. Dấu gạch chéo ngược `\` trong công thức LaTeX phải viết thành `\\` (ví dụ `\\frac{a}{b}`, `\\sqrt{x}`).
> 2. `answer` của câu trắc nghiệm (`single`, `multi`) là **mảng chỉ số** bắt đầu từ 0 (ví dụ `[0]` là lựa chọn đầu tiên, `[0, 2]` là lựa chọn thứ 1 và 3).
> 3. `answer` của câu điền từ (`fill`, `command`) là **mảng chuỗi** các đáp án được chấp nhận (ví dụ `["Hà Nội", "Ha Noi"]`).
> 4. Câu dịch có từ gợi ý (`translate`): yêu cầu `vi` (câu tiếng Việt), `keyword` (từ neo), `answers` (mảng các câu tiếng Anh chấp nhận được). Tham khảo tệp mẫu chuyên biệt: [`templates/sample-translate.json`](./sample-translate.json).

---

## 5. Đóng gói thành tệp `.sdeck` bằng dòng lệnh (CLI)

Gói `.sdeck` thực chất là một tệp nén ZIP chứa file `deck.json` và thư mục ảnh `img/`.

### Bước 1: Chuẩn bị thư mục nguồn
Tạo một thư mục bất kỳ (ví dụ `my-deck-source/`):
```text
my-deck-source/
├── deck.json
└── img/
    ├── photo1.png
    └── diagram.svg
```

### Bước 2: Đóng gói

**Cách A: Dùng công cụ `tools/sdeck.mjs` có sẵn của Turtle Deck (Khuyên dùng)**
```bash
# Đóng gói và tự động kiểm tra cú pháp, tối ưu hóa ảnh
node tools/sdeck.mjs pack my-deck-source/ ~/StudyDecks/my-new-deck.sdeck
```

**Cách B: Dùng lệnh `zip` của Linux / macOS**
```bash
cd my-deck-source
zip -r ../my-new-deck.sdeck deck.json img/
```

### Bước 3: Học ngay lập tức!
- Nếu lưu vào `~/StudyDecks`, mở Turtle Deck lên là bộ thẻ đã có sẵn trên trang chính.
- Hoặc nhấp đúp trực tiếp vào tệp `my-new-deck.sdeck`, hệ thống sẽ tự động khởi động Turtle Deck và nạp bộ thẻ để bạn học ngay!
