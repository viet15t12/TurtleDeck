# Study App (Electron) — học đa môn + tiếng Anh kiểu Quizlet

App desktop offline để học **bất kỳ thứ gì** (LPIC, kiến thức chung, từ vựng tiếng Anh...), thay Anki và Quizlet. Dữ liệu là các **bộ thẻ (deck)** đóng gói trong **một file `.sdeck` duy nhất** (gồm cả ảnh), tạo và chỉnh sửa ngay trong app bằng giao diện trực quan — không phải giải nén hay sửa JSON; app lo phần luyện tập, lên lịch ôn và thống kê.

---

## 1. Ý tưởng cốt lõi

Mọi thứ quy về một khái niệm: **Item** (mục cần nhớ) nằm trong **Deck**. Từ một Item, app sinh ra nhiều **kiểu câu hỏi** khác nhau. Nhờ đó:

- LPIC: item là "lệnh/khái niệm + giải thích" hoặc câu trắc nghiệm có sẵn.
- Tiếng Anh: item là "từ + nghĩa + phiên âm + ví dụ" → sinh trắc nghiệm, gõ lại, nghe-gõ, điền từ vào ví dụ, ghép cặp.
- Học khác: item là thẻ hỏi/đáp bất kỳ.

Tiến độ nhớ (SRS) gắn với **item + hướng học**, lưu riêng với file deck.

---

## 2. Chức năng

### 2.1 Quản lý Deck
- Mỗi bộ thẻ là **một file `.sdeck`** — gói nén ZIP đơn giản (không mã hoá, không mật khẩu) chứa câu hỏi và toàn bộ ảnh (mục 3.0). Chuyển máy / sao lưu / chia sẻ = chép một file.
- **Thư viện**: thư mục mặc định (`~/StudyDecks`, đổi trong Settings); app tự quét và liệt kê mọi `.sdeck`, thư mục con thành nhóm (`LPIC/101`, `English/IELTS`). Ngoài ra có *Mở file…* và double-click file `.sdeck` (đăng ký liên kết file).
- **Tạo và sửa bộ thẻ ngay trong app** bằng Deck Editor (mục 2.7): không cần giải nén, không cần sửa JSON.
- **Nhập** từ nguồn cũ để chuyển thành `.sdeck`: `.json` (hoặc thư mục `deck.json` + `img/`), `.csv/.tsv`, `.md`, **Quizlet export** (tab giữa term/definition, xuống dòng giữa các thẻ), CSV từ Anki. Nhập xong app hỏi nơi lưu `.sdeck`; app không ghi ngược lại các định dạng này.
- Tự reload khi file `.sdeck` bị thay (vd Syncthing đồng bộ từ máy khác); nếu bộ thẻ đang soạn dở trong Editor thì hỏi trước.
- Mỗi deck có "loại" (`vocab`, `qa`, `quiz`) quyết định các chế độ khả dụng.

### 2.2 Các chế độ học
| Chế độ | Giống | Mô tả |
|---|---|---|
| **Flashcards** | Quizlet/Anki | Lật thẻ, tự chấm Again/Hard/Good/Easy, có SRS |
| **Learn (thích ứng)** | Quizlet Learn | App tự chọn dạng câu hỏi theo mức nhớ của từng thẻ (mục 6) |
| **Trắc nghiệm** | Quizlet Test | Chọn nghĩa đúng; hỗ trợ 1 hoặc nhiều đáp án (LPIC "Choose TWO") |
| **Gõ đáp án (Write)** | Quizlet Write | Gõ từ/nghĩa/lệnh, chấm có dung sai lỗi chính tả |
| **Điền chỗ trống (Cloze)** | Anki cloze | Câu có `___`, điền từ/lệnh |
| **Nghe – Gõ (Listen)** | — | Phát âm (TTS) rồi gõ lại từ, luyện chính tả |
| **Ghép cặp (Match)** | Quizlet Match | Kéo/chạm ghép term–definition, tính giờ |
| **Thi thử (Exam)** | — | Trộn N câu, đồng hồ, điểm, xem lại câu sai |

### 2.3 Tính năng riêng cho tiếng Anh
- Trường dữ liệu: `term`, `definition` (EN/VI), `phonetic`, `pos` (loại từ), `example`, `audio`, `image`, `synonyms`.
- Phát âm bằng **Web Speech API** (`speechSynthesis`, chọn giọng en-US/en-GB), không cần mạng nếu máy có giọng.
- Học **hai chiều**: EN→VI (nhận biết) và VI→EN (nhớ chủ động); mỗi chiều có lịch SRS riêng.
- **Tự sinh cloze** từ `example` (thay `term` bằng `___`, nhận cả dạng chia động từ nếu có `forms`).
- Chấm gõ từ: bỏ qua hoa/thường, dấu cách thừa; cho qua lỗi 1 ký tự với từ dài (Levenshtein), nhưng báo "gần đúng".
- (Tuỳ chọn) tra từ điển online [dictionaryapi.dev] để điền phiên âm/ví dụ khi import — chỉ chạy khi người dùng bấm, không bắt buộc.

### 2.4 Tính năng riêng cho kỹ thuật (LPIC)
- Câu `command`: gõ nguyên lệnh, chấp nhận nhiều dạng (`rpm -qa`, `rpm --query --all`), có `regex`.
- Hiển thị Markdown + code block + giải thích sau khi trả lời.
- Lọc theo topic (`101.1`...), tag, độ khó.

### 2.5 Chung
- SRS, thống kê, streak, heatmap, leech (thẻ hay sai).
- Sao/đánh dấu thẻ, ghi chú cá nhân, nút "tôi chấm lại là đúng" (override).
- Phím tắt, dark mode, import/export tiến độ, backup.

### 2.6 Nội dung phong phú: công thức LaTeX và hình ảnh
- Mọi trường văn bản (câu hỏi, lựa chọn, đáp án, giải thích, `front/back`, `term/definition`, `example`, ghi chú) là **Markdown + LaTeX**: `$...$` (trong dòng), `$$...$$` (khối riêng), code block có tô màu.
- Hình ảnh **svg / png / jpg (jpeg) / gif / webp** chèn bằng `![mô tả](img/hinh1.png)` ở bất kỳ trường nào, hoặc dùng trường tắt `image` (hiện dưới đề / mặt trước) và `answerImage` (hiện dưới đáp án / mặt sau). Lựa chọn trắc nghiệm cũng có thể có ảnh/công thức: `{"text": "...", "image": "..."}`.
- Đường dẫn ảnh **tương đối so với gốc gói `.sdeck`** (thường `img/...`) và do Editor tự quản lý. App chỉ đọc ảnh nằm trong gói và **không tải ảnh từ internet** (chạy offline, an toàn).
- Render công thức bằng **KaTeX** (nhanh, offline, đóng gói sẵn font). Công thức sai cú pháp hiển thị mã gốc màu đỏ, không làm hỏng cả câu.
- Chấm đáp án là số/công thức: `match: "number"` (dung sai, phân số `1/3`, dấu `,` hoặc `.`) và `match: "latex"` (chuẩn hoá khoảng trắng, `\left/\right`, `\dfrac` → `\frac`). Xem mục 4.3b.
- Giao diện: bấm vào ảnh để phóng to; công thức dài cuộn ngang; ảnh trong dark mode có nền sáng để không mất nét; TTS, tìm kiếm và xem trước tự bỏ LaTeX/ảnh (`toPlain()`).

### 2.7 Soạn bộ thẻ trong app (Deck Editor)
> **Cập nhật thiết kế UX/UI:** Chi tiết giao diện, bố cục 100vh 3 cột có vách ngăn kéo thả, quy tắc ẩn thông tin kỹ thuật (`id`, tên trường JSON, đường dẫn ảnh thô), gộp `single`/`multi` thành một nút *Trắc nghiệm*, kiểm tra lỗi đúng lúc (sau `blur`) và cấu trúc thư mục `src/views/editor/` được quy định đầy đủ trong **`study-app-editor-ux.md`** (thay thế mục 2.7 và 9.3 này).

Mục tiêu: **tạo bộ thẻ mới, thêm / xoá / sửa câu hỏi và ảnh bằng giao diện trực quan**, rồi bấm *Lưu* ra file `.sdeck`. Người dùng không bao giờ phải giải nén gói hay mở file JSON.

- **Tạo mới**: *Bộ thẻ mới* → nhập tên, loại (`vocab` / `qa` / `quiz`), ngôn ngữ → vào Editor với một mục trống. **Sửa bộ thẻ có sẵn**: nút *Sửa* ở Home / Deck view.
- **Bố cục 3 khu vực** (xem mục 9): danh sách mục | form soạn | xem trước.
- **Danh sách mục**: tìm kiếm; lọc theo topic / tag / dạng / "chưa hoàn chỉnh"; kéo thả để sắp xếp; thêm (chọn dạng câu hỏi), nhân đôi, xoá; chọn nhiều mục để xoá hoặc gán topic/tag hàng loạt.
- **Form soạn** đổi theo dạng câu hỏi:

| Dạng | Các ô trong form |
|---|---|
| `single` / `multi` | câu hỏi; danh sách lựa chọn (chữ và/hoặc ảnh; thêm / xoá / kéo sắp xếp); tích đáp án đúng (radio cho `single`, checkbox cho `multi`); giải thích |
| `fill` / `command` | câu hỏi; danh sách đáp án chấp nhận (thêm / xoá); kiểu chấm `match` (normalized / exact / regex / number / latex), `tolerance` khi `number`; `answerDisplay`; ô **"thử đáp án"** chạy đúng `grader` để kiểm tra regex / dung sai |
| `card` | mặt trước, mặt sau, ảnh trước / sau |
| vocab (GĐ4) | term, definition, phonetic, pos (danh sách chọn), example, forms (chip), synonyms, tags, ảnh |
| chung | topic, tags (chip), giải thích, `image`, `answerImage` |

- **Xem trước**: hiển thị **đúng như lúc học** (cùng `richtext.js` và cùng component của session), cập nhật khi gõ; có nút *Thử trả lời*.
- **Soạn nội dung**: ô Markdown có thanh công cụ (đậm, nghiêng, code, công thức trong dòng `$…$`, công thức khối `$$…$$`, chèn ảnh) và bảng ký hiệu LaTeX hay dùng (phân số, căn, tổng, tích phân, mũ / chỉ số, chữ Hy Lạp, mũi tên…) bấm là chèn. LaTeX sai hiện mã đỏ ngay trong xem trước.
- **Ảnh**: *Chèn ảnh* (chọn nhiều file), **kéo thả file vào ô soạn**, hoặc **dán từ clipboard** (`Ctrl+V` — chụp màn hình rồi dán thẳng). App kiểm tra là ảnh thật, ≤ 5 MB, chép vào gói (`img/<hash>-<tên>.<đuôi>`), tự chèn `![mô tả](img/...)` và đặt con trỏ vào phần mô tả để nhập alt. *Trình quản lý ảnh*: thumbnail, dung lượng, "đang dùng ở N mục", xoá ảnh không dùng. Khi Lưu, ảnh không còn được tham chiếu → hỏi có dọn không.
- **Kiểm tra ngay khi soạn**: thiếu đáp án đúng, lựa chọn trùng / rỗng, regex sai, số không đọc được, ảnh không có trong gói, thiếu mô tả ảnh → cảnh báo tại ô đó và đánh dấu ⚠ ở danh sách. Cho phép lưu bản dở; mục chưa hoàn chỉnh **bị bỏ qua khi học** và được liệt kê trong Deck view.
- **An toàn dữ liệu**: Undo / Redo nhiều bước (`Ctrl+Z` / `Ctrl+Y`, gộp các lần gõ liên tiếp); chỉ báo `● chưa lưu`; `Ctrl+S` lưu; hỏi khi đóng / thoát mà chưa lưu; mỗi lần lưu giữ bản `.sdeck.bak` của lần trước; tự lưu nháp (GĐ6).
- **Nhập hàng loạt** (GĐ4): dán văn bản TSV / CSV / Quizlet / Markdown quiz → xem trước bảng → thêm vào bộ thẻ đang soạn.
- **`id` mục do app tự sinh**, ẩn khỏi người dùng và **không đổi khi sửa nội dung** → sửa câu hỏi không làm mất tiến độ học; nhân đôi mục sinh id mới; xoá mục không xoá tiến độ (mục 8). *Lưu thành bản sao…* tạo `meta.id` mới (tiến độ bắt đầu lại).

---

## 3. Định dạng dữ liệu

### 3.0 Gói bộ thẻ `.sdeck` (định dạng lưu duy nhất)

Mỗi bộ thẻ là **một file `.sdeck`**: thực chất là file **ZIP chuẩn** (nén deflate), **không mã hoá, không mật khẩu**; chỉ dùng đuôi riêng để app nhận diện, gắn biểu tượng / liên kết file, và để người dùng khỏi giải nén rồi sửa tay.

```
toan-101.sdeck             (file ZIP)
├── deck.json              # bắt buộc, UTF-8 không BOM: meta + items (mục 3.1)
└── img/                   # tuỳ chọn: toàn bộ ảnh của bộ thẻ
    ├── 3fa9c1d2-x2-graph.svg
    └── 9b01e7a4-triangle.png
```

Quy ước:
- `deck.json` nằm ở gốc gói và có `meta.format = "studydeck"`, `meta.formatVersion = 1`. App đọc được mọi phiên bản ≤ phiên bản nó biết; gặp phiên bản cao hơn thì báo "bộ thẻ này tạo bằng bản app mới hơn".
- Ảnh chỉ nằm dưới `img/`, đuôi `png/jpg/jpeg/gif/webp/svg`. Ảnh thêm bằng Editor được đặt tên `<8 ký tự đầu SHA-1 nội dung>-<tên gốc đã làm sạch>.<đuôi>` (cùng một ảnh thêm nhiều lần chỉ lưu một bản); ảnh nhập từ nguồn cũ giữ tên gốc.
- Mọi đường dẫn ảnh trong `deck.json` (`![](img/...)`, `image`, `answerImage`, `choices[].image`) là đường dẫn **tương đối so với gốc gói**.
- Tên entry trong gói dùng `/`, không bắt đầu bằng `/`, không có `..`, `\` hay ký tự điều khiển. Entry vi phạm, entry lạ (không phải `deck.json` hoặc `img/*.<ảnh>`) hoặc file "ảnh" có nội dung không phải ảnh bị **bỏ qua kèm cảnh báo**.
- Giới hạn chống file nén độc hại: ≤ 2000 entry; `deck.json` ≤ 20 MB; mỗi ảnh ≤ 5 MB (lớn hơn: cảnh báo, không nạp); tổng dung lượng giải nén ≤ 500 MB. Kiểm tra kích thước khai báo **trước khi** giải nén và đối chiếu lại kích thước thật **sau khi** giải nén (header có thể khai sai).
- **Không giải nén ra đĩa**: main đọc cả gói vào bộ nhớ; ảnh được phục vụ thẳng từ bộ nhớ qua `asset://` (mục 7.10).
- Ghi gói luôn atomic: nén → đọc lại kiểm tra hợp lệ → ghi `.tmp` → `rename`; giữ 1 bản `.sdeck.bak` của lần lưu trước.
- `meta.id` là khoá gắn tiến độ (mục 8): sinh một lần khi tạo bộ thẻ, **không đổi** khi đổi tên file / tiêu đề. Hai file khác nhau cùng `meta.id` → app cảnh báo và chỉ nạp một. *Lưu thành bản sao* trong Editor cấp `meta.id` mới.
- Cứu dữ liệu / kiểm tra: đổi đuôi `.sdeck` → `.zip` là mở được bằng mọi trình giải nén. Công cụ cho dev: `node tools/sdeck.mjs pack <thư-mục> [file.sdeck]`, `unpack <file.sdeck> [thư-mục]`, `check <file.sdeck>`, `pack-all <thư-mục-nguồn> <thư-mục-ra>`.

### 3.1 Nội dung `deck.json` trong gói (người dùng không phải sửa tay)

Đây là đặc tả cho dev, cho `tools/sdeck.mjs` và cho việc nhập deck do AI / script sinh; Editor tự sinh và tự escape đúng định dạng này.

```json
{
  "meta": { "id": "eng-ielts-01", "title": "IELTS Vocab 01", "kind": "vocab", "lang": "en" },
  "items": [
    {
      "id": "w-0001",
      "term": "mitigate",
      "definition": "giảm nhẹ, làm dịu",
      "phonetic": "/ˈmɪtɪɡeɪt/",
      "pos": "verb",
      "example": "Trees help mitigate the effects of climate change.",
      "forms": ["mitigates", "mitigated", "mitigating"],
      "tags": ["ielts", "environment"]
    }
  ]
}
```

```json
{
  "meta": { "id": "lpic-101", "title": "LPIC-1 101", "kind": "quiz" },
  "items": [
    {
      "id": "101.1-001", "type": "single", "topic": "101.1",
      "question": "Lệnh nào liệt kê thiết bị PCI?",
      "choices": ["lsusb", "lspci", "lsmod", "lshw -usb"],
      "answer": [1], "explanation": "`lspci` liệt kê PCI."
    },
    {
      "id": "102.4-020", "type": "command", "topic": "102.4",
      "question": "Liệt kê tất cả gói đã cài bằng rpm.",
      "answer": ["rpm -qa", "rpm --query --all"], "match": "normalized"
    },
    {
      "id": "x-001", "type": "card",
      "front": "inode là gì?", "back": "Metadata của file, không chứa tên file."
    }
  ]
}
```

### 3.2 Quy ước
- `id` item duy nhất trong deck và **không đổi** (khoá để gắn tiến độ); Editor tự sinh (`q-` + 8 ký tự base36 ngẫu nhiên), nhân đôi item thì sinh id mới. Id của deck là `meta.id` (mục 3.0).
- `vocab` deck: mọi chế độ tự sinh từ `term/definition/example`. `quiz` deck: dùng `type` đã khai báo; `card` dùng được flashcard + gõ đáp án.
- `match`: `normalized` (mặc định) / `exact` / `regex`.

### 3.3 CSV/TSV (định dạng *nhập*, chuyển thành `.sdeck`)
Dùng để nhập nhanh từ vựng; kết quả được đóng thành gói `.sdeck` (mục 3.0).
```
term<TAB>definition<TAB>phonetic<TAB>example
mitigate<TAB>giảm nhẹ<TAB>/ˈmɪtɪɡeɪt/<TAB>Trees help mitigate ...
```
App sinh `id` ổn định bằng hash của `term` để import lại không trùng/mất tiến độ.

### 3.4 Markdown (định dạng *nhập*, soạn nhanh ngoài app)
```md
## mitigate | giảm nhẹ
- phonetic: /ˈmɪtɪɡeɪt/
- example: Trees help mitigate the effects of climate change.
```
Parser đọc `## term | definition`, các dòng `- key: value`.

### 3.5 Công thức LaTeX và hình ảnh trong dữ liệu

**Ảnh trong gói và thư mục nguồn**

Trong gói `.sdeck`, ảnh nằm ở `img/` (mục 3.0). Deck do AI / script sinh thường ở dạng thư mục nguồn; đóng gói bằng `node tools/sdeck.mjs pack` hoặc nhập vào app (*Nhập…* → chọn thư mục hoặc `deck.json`):
```
decks-src/
└── math-101/
    ├── deck.json
    └── img/
        ├── x2-graph.svg
        ├── triangle.png
        └── circuit.jpg
```
Deck không có ảnh thì chỉ cần `deck.json`.

**Ví dụ JSON**
```json
{
  "meta": { "id": "math-101", "title": "Giải tích 1", "kind": "quiz" },
  "items": [
    {
      "id": "m-001", "type": "single", "topic": "tich-phan",
      "question": "Tính $\\int_0^1 x^2\\,dx$ (xem đồ thị):\n\n![đồ thị y=x²](img/x2-graph.svg)",
      "choices": ["$\\frac{1}{2}$", "$\\frac{1}{3}$", "$1$", { "text": "xem hình", "image": "img/triangle.png" }],
      "answer": [1],
      "explanation": "$$\\int_0^1 x^2\\,dx=\\left[\\frac{x^3}{3}\\right]_0^1=\\frac13$$"
    },
    {
      "id": "m-002", "type": "fill",
      "question": "Nghiệm dương của $x^2-2=0$ (làm tròn 3 chữ số): $x\\approx$ ___",
      "answer": ["1.414"], "match": "number", "tolerance": 0.001,
      "answerDisplay": "$\\sqrt{2}\\approx 1{,}414$"
    },
    {
      "id": "m-003", "type": "card",
      "front": "Công thức nghiệm phương trình bậc hai?", "image": "img/triangle.png",
      "back": "$$x=\\frac{-b\\pm\\sqrt{b^2-4ac}}{2a}$$"
    }
  ]
}
```

**Trường liên quan**
| Trường | Ghi chú |
|---|---|
| `image` | Ảnh hiện dưới đề / mặt trước / term |
| `answerImage` | Ảnh hiện dưới đáp án / mặt sau |
| `choices[]` | Chuỗi, hoặc `{ "text": "...", "image": "..." }` (cả hai đều có thể chứa LaTeX) |
| `answerDisplay` | Markdown/LaTeX để *hiển thị* đáp án đẹp, trong khi `answer` là chuỗi thuần để *chấm* |
| `match` | Thêm `number` (kèm `tolerance`) và `latex` |

**Lưu ý (chỉ khi viết / sinh `deck.json` ngoài app):** trong chuỗi JSON, dấu `\` của LaTeX phải viết thành `\\` (`\\frac`, `\\int`), xuống dòng là `\n`. Soạn nhiều công thức rất dễ sai → ngoài app nên dùng định dạng Markdown nhập bên dưới hoặc để script sinh JSON. **Trong Editor người dùng không cần quan tâm**: app tự escape khi lưu.

**Định dạng Markdown cho quiz** (định dạng *nhập*: soạn hàng loạt ngoài app, không phải escape; dán vào Editor bằng *Nhập hàng loạt* hoặc *Nhập…* ở Home):
````md
## Q m-001 | single | topic=tich-phan
Tính $\int_0^1 x^2\,dx$ (xem đồ thị):

![đồ thị y=x²](img/x2-graph.svg)

- [ ] $\frac{1}{2}$
- [x] $\frac{1}{3}$
- [ ] $1$

> $$\int_0^1 x^2\,dx=\left[\frac{x^3}{3}\right]_0^1=\frac13$$

## Q m-002 | fill | topic=dai-so
Nghiệm dương của $x^2-2=0$ (3 chữ số thập phân): ___

answer: 1.414
match: number
tolerance: 0.001
````
Quy tắc: heading `## Q <id> | <type> | key=value`; `- [ ]`/`- [x]` là lựa chọn (nhiều `[x]` → `multi`); khối `>` cuối là giải thích; `fill/command` dùng dòng `answer:` (nhiều đáp án ngăn bởi ` | `), tuỳ chọn `match:` và `tolerance:`.

**Quy tắc ảnh:** đuôi `png/jpg/jpeg/gif/webp/svg`; ≤ 5 MB (lớn hơn thì cảnh báo); thiếu `alt` → cảnh báo; thiếu file → cảnh báo và hiện khung "không tìm thấy ảnh" (deck vẫn học được). Cách hiển thị và bảo mật: xem mục 7.9–7.10.

---

## 4. Thuật toán và phương pháp sử dụng

### 4.1 Lặp lại ngắt quãng — SM-2 có "learning steps"
Mỗi cặp **(item, hướng)** là một *card state*:
```
{ state: 'new'|'learning'|'review'|'relearning',
  step, ease: 2.5, interval, due, reps, lapses }
```
- **new/learning**: đi qua các bước ngắn (vd 1 phút → 10 phút) trong cùng phiên, rồi "tốt nghiệp" sang review với interval 1 ngày.
- **review**: đúng → `interval = interval × ease` (kèm `Hard ×1.2`, `Easy ×1.3`); sai → `relearning`, `lapses++`, `ease -= 0.2`.
- **leech**: `lapses ≥ 8` → gắn cờ để người dùng viết lại thẻ cho dễ nhớ.
- Có thể nâng cấp sang **FSRS** sau (thư viện `ts-fsrs`), cùng giao diện `schedule(card, rating, now)` nên thay được.

Với quiz/trắc nghiệm: đúng → rating `Good`, sai → `Again`; người dùng tuỳ chọn bấm `Easy` nếu thấy quá dễ.

### 4.2 Tạo đáp án nhiễu cho trắc nghiệm (distractors)
Với vocab deck (không có `choices` sẵn):
1. Lấy ngẫu nhiên 3 `definition` của item khác **cùng `pos`/tag** (giống nhau hơn → khó hơn).
2. Loại trùng, loại cái quá giống đáp án đúng.
3. Xáo trộn, nhớ chỉ số đúng.

### 4.3 Chấm gõ đáp án
```
normalize(s) = trim → gộp khoảng trắng → NFC → (không phân biệt hoa/thường nếu mode normalized)
đúng nếu normalize(input) ∈ normalize(answers)
gần đúng nếu levenshtein ≤ 1 (độ dài ≥ 5) hoặc ≤ 2 (độ dài ≥ 9)
```
Gần đúng: tính là *đúng nhưng nhắc chính tả*, trừ điểm ease nhẹ (hoặc cho người dùng quyết).

### 4.3b Chấm số và công thức
`gradeText` rẽ nhánh theo `match`:
- `number`: đọc `"1/3"`, `"0,5"`, `"1e-3"`, `"-2.5"` thành số; đúng nếu `|x − đáp án| ≤ tolerance` (mặc định `1e-9`). Mặc định hiểu dấu `,` là dấu thập phân.
- `latex`: chuẩn hoá (bỏ khoảng trắng, `\left`/`\right`, `\dfrac`/`\tfrac` → `\frac`) rồi so khớp chuỗi.
- Chưa kiểm tra **tương đương đại số** (`2x` với `x+x`); nếu cần sau này dùng `mathjs`/`nerdamer`.

```js
function parseNumber(s) {
  s = String(s).trim().replace(',', '.');
  const f = s.match(/^(-?\d+(?:\.\d+)?)\s*\/\s*(-?\d+(?:\.\d+)?)$/);
  if (f) return Number(f[1]) / Number(f[2]);
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}

function gradeNumber(input, answers, tol = 1e-9) {
  const x = parseNumber(input);
  const ok = !Number.isNaN(x) && answers.some(a => Math.abs(parseNumber(a) - x) <= tol);
  return { ok, near: false };
}

const normLatex = s => String(s)
  .replace(/\\left|\\right/g, '')
  .replace(/\\[dt]frac/g, '\\frac')
  .replace(/\s+/g, '');

function gradeLatex(input, answers) {
  const x = normLatex(input);
  return { ok: answers.some(a => normLatex(a) === x), near: false };
}
```

### 4.4 Chọn câu cho phiên học
1. Câu `due` (quá hạn trước) → 2. câu `learning` → 3. câu mới (giới hạn N/ngày).
2. Xáo trộn nhẹ nhưng không đặt hai hướng của cùng một item sát nhau (tránh lộ đáp án).
3. Câu sai được chèn lại sau ~3–7 câu khác.

---

## 5. Cơ chế hoạt động (luồng dữ liệu)

```
 file .sdeck ─▶ main: đọc ZIP vào RAM (kiểm tra giới hạn) ─▶ parse + validate ─▶ IPC ─▶ renderer
 (hoặc nhập .json/.csv/.md)              │
                                         └─ ảnh nằm trong RAM ─▶ asset://<deckKey>/img/... ─▶ <img>

 renderer: sessionPlanner → questionBuilder → UI → grader → srs ─┐
                                                                 ▼ IPC saveReview
                                                   main: ghi progress (atomic)

 Editor (renderer): sửa deck trong bộ nhớ ─▶ IPC deck:save ─▶ main: kiểm tra + nén ZIP + ghi atomic ─▶ file .sdeck
```

- **Main process**: đọc/ghi file, dialog, watch; đọc/ghi gói `.sdeck` (`core/sdeck.js`); giữ các gói đang mở trong bộ nhớ và phục vụ `asset://`; (tuỳ chọn) SQLite. Không chứa logic học. **Main không tin dữ liệu từ renderer**: ảnh thêm từ Editor và nội dung `deck.json` đều được kiểm tra lại trước khi ghi.
- **Renderer**: toàn bộ UI + logic thuần (grader, srs, planner, deckmodel) — dễ unit test, không cần Electron.
- **Preload**: `contextBridge.exposeInMainWorld('api', {...})`, chỉ expose hàm cần thiết.
- **Lưu trữ**:
  - Bộ thẻ: các file `.sdeck` (tách riêng khỏi tiến độ, nên đổi tên / chép file không mất tiến độ vì khoá là `meta.id`).
  - Giai đoạn đầu: `progress.json` và `settings.json` (Thư viện, danh sách deck đã mở, theme…) trong `app.getPath('userData')`, ghi atomic (`.tmp` rồi `rename`).
  - Khi nhiều dữ liệu/log: chuyển **SQLite** (`better-sqlite3`) với bảng `cards`, `reviews`.
- Mỗi lần trả lời → ghi 1 dòng `review log` (id, hướng, kết quả, thời gian) → làm thống kê và có thể tính lại lịch.

---

## 6. Học phối hợp như thế nào

### 6.1 Chế độ Learn (thích ứng) — tiến theo mức thành thạo
Mỗi thẻ có `mastery` 0→4 trong phiên và tự đi lên khi trả lời đúng:

| mastery | Dạng hỏi | Mục đích |
|---|---|---|
| 0 (mới) | Flashcard xem trước (term + nghĩa + ví dụ) | làm quen |
| 1 | Trắc nghiệm EN→VI | nhận biết |
| 2 | Trắc nghiệm VI→EN | nhận biết chiều ngược |
| 3 | Gõ từ (Write) VI→EN hoặc Nghe–Gõ | nhớ chủ động |
| 4 | Cloze trong câu ví dụ | dùng đúng ngữ cảnh |

- Sai → tụt 1 bậc (không về 0), thẻ quay lại sau vài câu.
- Đạt mastery 4 → thẻ "xong phiên" và được đẩy vào lịch SRS dài hạn.
- Với deck LPIC (đã có `type`): bỏ bước flashcard, ưu tiên `single/multi` rồi `command/fill`.

### 6.2 Quy trình học đề xuất
1. **Học mới** (Learn): 10–20 thẻ mỗi phiên, đi hết các bậc mastery.
2. **Ôn hàng ngày** (Flashcards/SRS): chỉ các thẻ đến hạn; đây là xương sống ghi nhớ lâu dài.
3. **Luyện sâu cuối tuần**: Match (cho vui, tăng tốc độ), Listen–Write, Cloze.
4. **Thi thử** trước kỳ thi LPIC/IELTS: Exam mode, xem lại câu sai, rồi đưa câu sai quay lại SRS.

### 6.3 Học tiếng Anh nên phối hợp
- Từ mới: Learn → hôm sau SRS → thêm Listen–Write để gắn *âm – chữ*.
- Mỗi từ có `example`; chuyển sang cloze khi từ đã ổn để học cách dùng (collocation).
- Từ hay sai (leech): thêm hình, ví dụ cá nhân, hoặc tách thành thẻ riêng.

---

## 7. Mã nguồn mẫu (xương sống)

### 7.1 Cấu trúc thư mục
```
study-app/
├── package.json
├── main.js
├── preload.js
├── tools/
│   └── sdeck.mjs           # CLI cho dev: pack / unpack / check / pack-all
├── src/
│   ├── index.html
│   ├── styles.css
│   ├── app.js              # router màn hình
│   ├── core/               # logic thuần, test được; có package.json {"type":"module"}
│   │   ├── sdeck.js        # đọc/ghi gói .sdeck (fflate), kiểm tra tên entry, giới hạn, nhận dạng ảnh
│   │   ├── parser.js       # deck.json + nhập csv/md -> items
│   │   ├── validate.js     # validateItem/validateDeck dùng chung cho parser và Editor
│   │   ├── deckmodel.js    # thao tác soạn: newDeck/newItem/add/remove/move/update, undo-redo, ảnh dùng/không dùng
│   │   ├── builder.js      # item -> question (mc, write, cloze, listen)
│   │   ├── grader.js
│   │   ├── srs.js
│   │   ├── planner.js      # chọn câu, learn mastery
│   │   ├── stats.js
│   │   └── richtext.js     # Markdown + LaTeX (KaTeX) + ảnh, sanitize
│   ├── views/              # home, deck, editor, session, result, stats, settings
│   └── tts.js              # speechSynthesis wrapper
├── data/
│   ├── samples-src/        # deck mẫu dạng thư mục (deck.json + img/), chỉ dùng để build
│   └── samples/            # *.sdeck sinh bởi `npm run build:samples`
└── test/
```
Về module: `sdeck.js`, `parser.js` chạy ở **main**; `deckmodel.js`, `grader.js`, `srs.js`, `planner.js`… chạy ở **renderer**; `validate.js` và `deckmodel.js` (hàm `imageRefs`) được cả hai phía dùng. Vì vậy mọi file trong `src/core/` viết dạng **ES module** (`export`), main (CommonJS) nạp bằng `await import()`, renderer nạp bằng `<script type="module">`, và `node --test` chạy trực tiếp được. (Các mã mẫu `module.exports` ở 7.4–7.8 đổi sang `export` khi đưa vào.)

### 7.2 main.js
```js
const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');

const progressFile = () => path.join(app.getPath('userData'), 'progress.json');
const settingsFile = () => path.join(app.getPath('userData'), 'settings.json');

async function atomicWrite(file, data) {
  const tmp = file + '.tmp';
  await fs.writeFile(tmp, data);
  await fs.rename(tmp, file);
}

// core là ES module → nạp bằng import() động
let sdeck;                                         // src/core/sdeck.js (mục 7.3b)
const loadCore = async () => { sdeck = await import('./src/core/sdeck.js'); };

// Các gói đang mở: deckKey -> { file, assets: Map<'img/x.png', Uint8Array> }
// deckKey ngẫu nhiên (a-f0-9), dùng làm "host" của asset://
const packages = new Map();
const newKey = () => crypto.randomBytes(6).toString('hex');

const SDECK_FILTER = [{ name: 'Bộ thẻ', extensions: ['sdeck'] }];

function createWindow() {
  const win = new BrowserWindow({
    width: 1100, height: 760,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', e => e.preventDefault());
  win.loadFile('src/index.html');
}

// ── Mở / nhập / tạo / lưu bộ thẻ ─────────────────────────────────────────────

// Mở file .sdeck. Có filePath: mở thẳng (Thư viện, mở lại); không có: hiện hộp thoại.
ipcMain.handle('deck:open', async (_e, filePath) => {
  let paths = filePath ? [filePath] : null;
  if (!paths) {
    const r = await dialog.showOpenDialog({ properties: ['openFile', 'multiSelections'], filters: SDECK_FILTER });
    if (r.canceled) return [];
    paths = r.filePaths;
  }
  const out = [];
  for (const p of paths) {
    const res = sdeck.readPackage(await fs.readFile(p));       // { ok, deckText, assets, issues }
    if (!res.ok) { out.push({ path: p, ok: false, issues: res.issues }); continue; }
    const deckKey = newKey();
    packages.set(deckKey, { file: p, assets: res.assets });
    out.push({ path: p, ok: true, deckKey, deckText: res.deckText, issues: res.issues });
  }
  return out;
});

// Bộ thẻ mới (chưa có file) cho Editor; renderer tự dựng deckText bằng deckmodel.newDeck()
ipcMain.handle('deck:new', () => {
  const deckKey = newKey();
  packages.set(deckKey, { file: null, assets: new Map() });
  return { deckKey };
});

// Nhập .json hoặc thư mục (deck.json + img/) → gói trong bộ nhớ, chưa có file; sau đó renderer gọi deck:save.
// GĐ4 thêm csv/tsv/md (parse ở main rồi trả deckText đã chuẩn hoá).
ipcMain.handle('deck:import', async () => {
  const r = await dialog.showOpenDialog({
    properties: ['openFile', 'openDirectory'],
    filters: [{ name: 'Nguồn bộ thẻ', extensions: ['json'] }],
  });
  if (r.canceled) return null;
  const src = r.filePaths[0];
  const isDir = (await fs.stat(src)).isDirectory();
  const dir = isDir ? src : path.dirname(src);
  const deckText = await fs.readFile(isDir ? path.join(src, 'deck.json') : src, 'utf8');
  // đọc các ảnh được tham chiếu từ thư mục nguồn: realpath phải nằm trong `dir`, đúng đuôi/nội dung ảnh, ≤ 5 MB
  const assets = await sdeck.collectAssetsFromDir(dir, deckText);
  const deckKey = newKey();
  packages.set(deckKey, { file: null, assets });
  return { deckKey, deckText };
});

// Lưu. saveAs=true hoặc chưa có file → hộp thoại "Lưu thành…". Luôn kiểm tra lại ở main.
ipcMain.handle('deck:save', async (_e, { deckKey, deckText, saveAs, pruneUnused = true }) => {
  const pkg = packages.get(deckKey);
  if (!pkg) return { ok: false, error: 'Bộ thẻ không còn mở.' };
  let file = saveAs ? null : pkg.file;
  if (!file) {
    const r = await dialog.showSaveDialog({ defaultPath: 'bo-the-moi.sdeck', filters: SDECK_FILTER });
    if (r.canceled) return { ok: false, canceled: true };
    file = r.filePath.endsWith('.sdeck') ? r.filePath : r.filePath + '.sdeck';
  }
  const built = sdeck.writePackage(deckText, pkg.assets, { prune: pruneUnused });
  if (!built.ok) return built;
  if (!sdeck.readPackage(built.bytes).ok) return { ok: false, error: 'Gói vừa nén không đọc lại được.' };
  try { await fs.copyFile(file, file + '.bak'); } catch {}      // chưa có file cũ thì bỏ qua
  await atomicWrite(file, built.bytes);
  pkg.file = file;
  pkg.assets = built.keptAssets;
  return { ok: true, path: file };
});

ipcMain.handle('deck:close', (_e, deckKey) => packages.delete(deckKey));

// ── Ảnh trong gói (Editor) ───────────────────────────────────────────────────

ipcMain.handle('asset:add', async (_e, deckKey) => {            // nút "Chèn ảnh"
  const pkg = packages.get(deckKey);
  const r = await dialog.showOpenDialog({
    properties: ['openFile', 'multiSelections'],
    filters: [{ name: 'Ảnh', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'] }],
  });
  if (r.canceled || !pkg) return [];
  return Promise.all(r.filePaths.map(async p =>
    sdeck.addImage(pkg.assets, path.basename(p), await fs.readFile(p))));   // [{ ok, path } | { ok:false, error }]
});

ipcMain.handle('asset:addBytes', (_e, deckKey, name, bytes) => { // kéo thả / dán clipboard
  const pkg = packages.get(deckKey);
  return pkg ? sdeck.addImage(pkg.assets, String(name), Buffer.from(bytes))
             : { ok: false, error: 'Bộ thẻ không còn mở.' };
});

ipcMain.handle('asset:list', (_e, deckKey) => {
  const pkg = packages.get(deckKey);
  return pkg ? [...pkg.assets].map(([name, d]) => ({ name, size: d.length })) : [];
});

// ── Tiến độ và cài đặt ──────────────────────────────────────────────────────

ipcMain.handle('progress:load', async () => {
  try { return JSON.parse(await fs.readFile(progressFile(), 'utf8')); }
  catch { return { version: 1, cards: {}, log: [] }; }
});
ipcMain.handle('progress:save', (_e, data) => atomicWrite(progressFile(), JSON.stringify(data)));

ipcMain.handle('settings:load', async () => {
  try { return JSON.parse(await fs.readFile(settingsFile(), 'utf8')); }
  catch { return { version: 1, decks: [] }; }                    // decks: đường dẫn các .sdeck đã mở
});
ipcMain.handle('settings:save', (_e, data) => atomicWrite(settingsFile(), JSON.stringify(data)));

app.whenReady().then(async () => {
  await loadCore();
  registerAssetProtocol();                                       // mục 7.10
  createWindow();
});
app.on('window-all-closed', () => process.platform !== 'darwin' && app.quit());
```
> Ghi chú: mã trên rút gọn để thấy cấu trúc. Cần thêm: kiểm tra `filePath` do renderer gửi (chỉ mở đuôi `.sdeck`), xử lý lỗi `readFile`, hỏi xác nhận khi đóng cửa sổ lúc Editor còn thay đổi chưa lưu, và `collectAssetsFromDir` (đặt trong `sdeck.js`, chỉ dùng cho nhập từ thư mục).

### 7.3 preload.js
```js
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('api', {
  openDecks:     filePath => ipcRenderer.invoke('deck:open', filePath),
  newDeck:       () => ipcRenderer.invoke('deck:new'),
  importDeck:    () => ipcRenderer.invoke('deck:import'),
  saveDeck:      (deckKey, deckText, opts) => ipcRenderer.invoke('deck:save', { deckKey, deckText, ...opts }),
  closeDeck:     deckKey => ipcRenderer.invoke('deck:close', deckKey),
  addImages:     deckKey => ipcRenderer.invoke('asset:add', deckKey),
  addImageBytes: (deckKey, name, bytes) => ipcRenderer.invoke('asset:addBytes', deckKey, name, bytes),
  listAssets:    deckKey => ipcRenderer.invoke('asset:list', deckKey),
  loadProgress:  () => ipcRenderer.invoke('progress:load'),
  saveProgress:  d => ipcRenderer.invoke('progress:save', d),
  loadSettings:  () => ipcRenderer.invoke('settings:load'),
  saveSettings:  d => ipcRenderer.invoke('settings:save', d),
});
```

### 7.3b core/sdeck.js (đọc/ghi gói `.sdeck`)
Dùng `fflate` (thuần JS, không cần native, có `unzipSync` với `filter` chạy *trước khi* giải nén từng entry). Đã chạy thử round-trip, tên entry độc hại, ảnh giả, quá nhiều entry.
```js
// src/core/sdeck.js — đọc/ghi gói .sdeck (ZIP đơn giản, không mã hoá). Chạy ở main; test bằng node --test.
import { unzipSync, zipSync, strFromU8, strToU8 } from 'fflate';
import { createHash } from 'node:crypto';
import { collectImageRefs } from './deckmodel.js';

export const LIMITS = { entries: 2000, deckJson: 20e6, image: 5e6, total: 500e6 };
export const FORMAT = 'studydeck';
export const FORMAT_VERSION = 1;

const IMG_EXT = /\.(png|jpe?g|gif|webp|svg)$/i;
const fail = error => ({ ok: false, error, issues: [error] });

// tên entry hợp lệ: không rỗng, không tuyệt đối, không '\', không ký tự điều khiển, không '.', '..' hay đoạn rỗng
export function isSafeEntry(name) {
  if (!name || name.startsWith('/') || name.includes('\\') || /[\x00-\x1f]/.test(name)) return false;
  return name.split('/').every(seg => seg !== '' && seg !== '.' && seg !== '..');
}

// nhận dạng ảnh bằng nội dung (không tin đuôi file): 'png'|'jpg'|'gif'|'webp'|'svg'|null
export function detectImageType(b) {
  const at = (i, str) => [...str].every((c, k) => b[i + k] === c.charCodeAt(0));
  if (b.length >= 8 && b[0] === 0x89 && at(1, 'PNG')) return 'png';
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpg';
  if (at(0, 'GIF87a') || at(0, 'GIF89a')) return 'gif';
  if (at(0, 'RIFF') && at(8, 'WEBP')) return 'webp';
  const head = strFromU8(b.subarray(0, 2048)).replace(/^\uFEFF/, '');
  if (/^(?:\s|<\?xml[^>]*\?>|<!--[\s\S]*?-->|<!DOCTYPE[^>]*>)*<svg[\s>]/i.test(head)) return 'svg';
  return null;
}

// bytes (Uint8Array của file .sdeck) -> { ok, deckText, assets: Map<'img/..', Uint8Array>, issues[] }
export function readPackage(bytes) {
  if (!(bytes?.length > 4 && bytes[0] === 0x50 && bytes[1] === 0x4b))
    return fail('Không phải file .sdeck (không phải gói nén ZIP).');
  const issues = [];
  let count = 0, total = 0, files;
  try {
    files = unzipSync(bytes, {
      filter(f) {                                          // chạy TRƯỚC khi giải nén từng entry
        if (f.name.endsWith('/')) return false;            // bỏ thư mục
        if (++count > LIMITS.entries) throw new Error('Gói có quá nhiều tập tin.');
        if (!isSafeEntry(f.name)) { issues.push(`Bỏ qua tập tin có tên không an toàn: ${f.name}`); return false; }
        const isDeck = f.name === 'deck.json';
        if (!isDeck && !(f.name.startsWith('img/') && IMG_EXT.test(f.name))) {
          issues.push(`Bỏ qua tập tin lạ trong gói: ${f.name}`); return false;
        }
        if (f.originalSize > (isDeck ? LIMITS.deckJson : LIMITS.image)) {
          issues.push(`Bỏ qua ${f.name}: dung lượng quá lớn.`); return false;
        }
        total += f.originalSize;
        if (total > LIMITS.total) throw new Error('Dung lượng giải nén quá lớn.');
        return true;
      },
    });
  } catch (e) {
    return fail('File hỏng hoặc không đọc được: ' + e.message);
  }
  // header có thể khai sai kích thước → đối chiếu lại kích thước thật
  let real = 0;
  for (const [name, u8] of Object.entries(files)) {
    real += u8.length;
    if (u8.length > (name === 'deck.json' ? LIMITS.deckJson : LIMITS.image))
      return fail(`${name} lớn hơn khai báo trong gói.`);
  }
  if (real > LIMITS.total) return fail('Dung lượng giải nén quá lớn.');
  if (!files['deck.json']) return fail('Gói không có deck.json — đây không phải bộ thẻ hợp lệ.');

  const deckText = strFromU8(files['deck.json']).replace(/^\uFEFF/, '');
  const assets = new Map(Object.entries(files).filter(([n]) => n !== 'deck.json'));
  for (const [n, u8] of [...assets])
    if (!detectImageType(u8)) { assets.delete(n); issues.push(`Bỏ qua ${n}: nội dung không phải ảnh.`); }
  return { ok: true, deckText, assets, issues };
}

// deckText (chuỗi JSON) + assets -> { ok, bytes, keptAssets }; prune=true bỏ ảnh không còn được tham chiếu
export function writePackage(deckText, assets, { prune = true } = {}) {
  let deck;
  try { deck = JSON.parse(deckText); } catch (e) { return fail('deck.json không hợp lệ: ' + e.message); }
  if (!deck?.meta?.id || !Array.isArray(deck.items)) return fail('Thiếu meta.id hoặc danh sách items.');
  deck.meta.format = FORMAT;
  deck.meta.formatVersion = FORMAT_VERSION;
  const used = collectImageRefs(deck);
  const keptAssets = new Map([...assets].filter(([n]) => !prune || used.has(n)));
  const files = { 'deck.json': strToU8(JSON.stringify(deck, null, 2)) };
  for (const [name, data] of keptAssets)
    files[name] = [data, { level: /\.(png|jpe?g|gif|webp)$/i.test(name) ? 0 : 6 }];   // ảnh đã nén sẵn → lưu nguyên
  return { ok: true, bytes: zipSync(files), keptAssets };
}

// thêm ảnh vào gói đang mở (nút Chèn ảnh / kéo thả / dán) → { ok, path:'img/<hash>-<tên>.<đuôi>' }
export function addImage(assets, originalName, bytes) {
  const type = detectImageType(bytes);
  if (!type) return { ok: false, error: 'Không phải ảnh hợp lệ (png, jpg, gif, webp, svg).' };
  if (bytes.length > LIMITS.image) return { ok: false, error: 'Ảnh lớn hơn 5 MB.' };
  const hash = createHash('sha1').update(bytes).digest('hex').slice(0, 8);
  const slug = String(originalName).replace(/\.[^.]*$/, '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/gi, 'd').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'anh';
  const name = `img/${hash}-${slug}.${type}`;
  if (!assets.has(name)) assets.set(name, new Uint8Array(bytes));      // cùng nội dung → cùng tên → chỉ lưu 1 bản
  return { ok: true, path: name, size: bytes.length };
}
```
`imageRefs` / `collectImageRefs` nằm trong `core/deckmodel.js` (Editor cũng dùng để biết ảnh nào đang được dùng):
```js
const MD_IMG = /!\[[^\]]*\]\(\s*([^)\s]+)/g;

// Tập đường dẫn ảnh mà một item tham chiếu: ![](img/..), image, answerImage, choices[].image
export function imageRefs(item) {
  const out = new Set();
  const walk = (v, key) => {
    if (typeof v === 'string') {
      if (key === 'image' || key === 'answerImage') out.add(v);
      for (const m of v.matchAll(MD_IMG)) out.add(m[1]);
    } else if (Array.isArray(v)) v.forEach(x => walk(x, key));
    else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) walk(x, k);
  };
  walk(item);
  return out;
}

export function collectImageRefs(deck) {
  const all = new Set();
  for (const it of deck.items ?? []) for (const r of imageRefs(it)) all.add(r);
  return all;
}
```

### 7.4 core/grader.js
```js
const norm = s => s.normalize('NFC').trim().replace(/\s+/g, ' ');

function lev(a, b) {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      dp[i][j] = Math.min(
        dp[i-1][j] + 1, dp[i][j-1] + 1,
        dp[i-1][j-1] + (a[i-1] === b[j-1] ? 0 : 1));
  return dp[a.length][b.length];
}

// returns { ok: boolean, near: boolean }
function gradeText(input, answers, mode = 'normalized') {
  const x = mode === 'exact' ? input : norm(input).toLowerCase();
  const list = answers.map(a => mode === 'exact' ? a : norm(a).toLowerCase());
  if (mode === 'regex')
    return { ok: answers.some(r => new RegExp(r).test(norm(input))), near: false };
  if (list.includes(x)) return { ok: true, near: false };
  if (mode === 'normalized') {
    const maxD = x.length >= 9 ? 2 : x.length >= 5 ? 1 : 0;
    if (maxD && list.some(a => lev(a, x) <= maxD)) return { ok: true, near: true };
  }
  return { ok: false, near: false };
}

function gradeChoices(selected, correct) {
  const a = [...selected].sort().join(), b = [...correct].sort().join();
  return { ok: a === b, near: false };
}

module.exports = { gradeText, gradeChoices };
```

### 7.5 core/srs.js (SM-2 + learning steps)
```js
const DAY = 86400000;
const LEARN_STEPS = [1, 10];            // phút

function newCard() {
  return { state: 'new', step: 0, ease: 2.5, interval: 0, due: 0, reps: 0, lapses: 0 };
}

// rating: 1=Again 2=Hard 3=Good 4=Easy
function schedule(card, rating, now = Date.now()) {
  const c = { ...card };
  if (c.state === 'new' || c.state === 'learning' || c.state === 'relearning') {
    if (rating === 1) { c.state = c.state === 'new' ? 'learning' : c.state; c.step = 0; }
    else if (rating === 4) { c.step = LEARN_STEPS.length; }
    else if (rating === 3) c.step++;
    if (c.step >= LEARN_STEPS.length) {
      c.state = 'review'; c.interval = rating === 4 ? 4 : 1; c.due = now + c.interval * DAY;
    } else {
      c.state = c.state === 'relearning' ? 'relearning' : 'learning';
      c.due = now + LEARN_STEPS[c.step] * 60000;
    }
    return c;
  }
  // review
  if (rating === 1) {
    c.state = 'relearning'; c.step = 0; c.lapses++;
    c.ease = Math.max(1.3, c.ease - 0.2);
    c.interval = Math.max(1, Math.round(c.interval * 0.5));
    c.due = now + LEARN_STEPS[0] * 60000;
  } else {
    const mult = rating === 2 ? 1.2 : rating === 4 ? c.ease * 1.3 : c.ease;
    c.interval = Math.max(c.interval + 1, Math.round(c.interval * mult));
    if (rating === 2) c.ease = Math.max(1.3, c.ease - 0.15);
    if (rating === 4) c.ease += 0.15;
    c.reps++; c.due = now + c.interval * DAY;
  }
  return c;
}

const isDue = (c, now = Date.now()) => c.state !== 'new' && c.due <= now;
module.exports = { newCard, schedule, isDue };
```

### 7.6 core/builder.js (sinh câu hỏi từ item vocab)
```js
const shuffle = a => a.map(v => [Math.random(), v]).sort((x, y) => x[0] - y[0]).map(p => p[1]);

function buildMC(item, all, dir = 'en-vi') {
  const prompt = dir === 'en-vi' ? item.term : item.definition;
  const key = dir === 'en-vi' ? 'definition' : 'term';
  const pool = all.filter(i => i.id !== item.id && (!item.pos || i.pos === item.pos));
  const wrong = shuffle(pool).slice(0, 3).map(i => i[key]);
  const choices = shuffle([item[key], ...wrong]);
  return { kind: 'mc', prompt, choices, answer: [choices.indexOf(item[key])] };
}

function buildWrite(item, dir = 'vi-en') {
  return dir === 'vi-en'
    ? { kind: 'write', prompt: item.definition, answers: [item.term] }
    : { kind: 'write', prompt: item.term, answers: [item.definition] };
}

function buildCloze(item) {
  if (!item.example) return null;
  const forms = [item.term, ...(item.forms || [])];
  const re = new RegExp('\\b(' + forms.map(f => f.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')\\b', 'i');
  const m = item.example.match(re);
  return m ? { kind: 'cloze', prompt: item.example.replace(re, '_____'), answers: [m[0]], hint: item.definition } : null;
}

module.exports = { buildMC, buildWrite, buildCloze };
```

### 7.7 tts.js
```js
export function speak(text, lang = 'en-US') {
  const u = new SpeechSynthesisUtterance(text);
  u.lang = lang;
  const v = speechSynthesis.getVoices().find(v => v.lang === lang);
  if (v) u.voice = v;
  speechSynthesis.cancel();
  speechSynthesis.speak(u);
}
```
> Trên Fedora/Chromium trong Electron, `speechSynthesis` có thể không có giọng nếu máy chưa cài speech-dispatcher + giọng (espeak-ng/…); cần kiểm tra `getVoices()` và báo người dùng. Phương án dự phòng: cho phép gắn file `audio` cho từng item.

### 7.8 core/planner.js (Learn mastery)
```js
const STAGES = ['preview', 'mc-en-vi', 'mc-vi-en', 'write-vi-en', 'cloze'];

function nextStage(entry, correct) {
  if (correct) entry.mastery = Math.min(STAGES.length, entry.mastery + 1);
  else entry.mastery = Math.max(1, entry.mastery - 1);
  return entry.mastery >= STAGES.length ? null : STAGES[entry.mastery];
}

// hàng đợi: lấy câu chưa xong, không lặp lại cùng item liền kề
function pickNext(queue, lastId) {
  const i = queue.findIndex(q => q.itemId !== lastId);
  return queue.splice(i === -1 ? 0 : i, 1)[0];
}
module.exports = { STAGES, nextStage, pickNext };
```

### 7.9 core/richtext.js (Markdown + LaTeX + ảnh, renderer)
```js
import { Marked } from 'marked';               // marked >= 12: renderer.image nhận 1 object token
import markedKatex from 'marked-katex-extension';
import DOMPurify from 'dompurify';

const esc = s => String(s).replace(/[&<>"']/g,
  c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const IMG_EXT = /\.(png|jpe?g|gif|webp|svg)$/i;

// chỉ nhận đường dẫn tương đối trong gói deck (img/...); chặn http:, file:, data:, //...
function assetUrl(href, deckKey) {
  if (!href || /^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith('//')) return null;
  if (!IMG_EXT.test(href)) return null;
  return `asset://${deckKey}/${href.split('/').map(encodeURIComponent).join('/')}`;
}

export function makeRich(deckKey) {
  const m = new Marked({ gfm: true });
  // KaTeX giữ mặc định an toàn (không bật trust) → \href{javascript:...} không chạy
  m.use(markedKatex({ throwOnError: false, output: 'htmlAndMathml' }));
  m.use({ renderer: {
    image({ href, title, text }) {
      const src = assetUrl(href, deckKey);
      if (!src) return `<span class="img-bad">[ảnh không hợp lệ: ${esc(text)}]</span>`;
      return `<img class="rich-img" loading="lazy" src="${src}" alt="${esc(text)}"` +
             `${title ? ` title="${esc(title)}"` : ''}>`;
    },
  } });

  // DOMPurify mặc định chặn scheme lạ như asset: → phải cho phép tường minh
  const CFG = { ADD_ATTR: ['loading'], ALLOWED_URI_REGEXP: /^(?:asset:|#)/i };
  return {
    html:   md => DOMPurify.sanitize(m.parse(String(md ?? '')), CFG),
    inline: md => DOMPurify.sanitize(m.parseInline(String(md ?? '')), CFG),
  };
}

// văn bản thuần cho TTS, tìm kiếm, xem trước: bỏ LaTeX, ảnh, ký hiệu Markdown
export function toPlain(md, formula = ' ') {
  return String(md ?? '')
    .replace(/\$\$[\s\S]*?\$\$/g, formula)
    .replace(/\$[^$\n]+\$/g, formula)
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/[`*_>#~]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}
```
Ghi chú:
- Sau khi sanitize, công thức vẫn phải hiển thị (kiểm tra bằng test; nếu MathML bị lọc quá tay thì đổi `output: 'html'`).
- Cần copy `node_modules/katex/dist/katex.min.css` **cùng thư mục `fonts/`** vào `src/vendor/katex/` và nạp trong `index.html`.
- Dùng `<img>` cho SVG (không nhúng inline) nên `<script>` trong SVG không bao giờ chạy.

### 7.10 Giao thức `asset://` và CSP (main.js bổ sung)
Ảnh nằm **trong bộ nhớ** (`packages.get(deckKey).assets`), không có file trên đĩa để trỏ tới, nên handler chỉ tra `Map`:
```js
const { protocol } = require('electron');

// phải gọi TRƯỚC app ready
protocol.registerSchemesAsPrivileged([
  { scheme: 'asset', privileges: { standard: true, secure: true, supportFetchAPI: true } },
]);

const MIME = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml' };
const IMG_PATH = /^img\/.+\.(png|jpe?g|gif|webp|svg)$/i;

function registerAssetProtocol() {                  // gọi trong app.whenReady() (mục 7.2)
  protocol.handle('asset', req => {
    try {
      const u = new URL(req.url);
      const pkg = packages.get(u.hostname);          // hostname = deckKey
      const rel = decodeURIComponent(u.pathname).replace(/^\/+/, '');
      const data = pkg && IMG_PATH.test(rel) ? pkg.assets.get(rel) : null;   // khoá chính xác trong Map
      if (!data) return new Response('Not found', { status: 404 });
      return new Response(data, { headers: {
        'Content-Type': MIME[rel.split('.').pop().toLowerCase()],
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox",
      } });
    } catch {
      return new Response('Not found', { status: 404 });
    }
  });
}
```
- **Không có path traversal / symlink để phòng**: không đường dẫn đĩa nào được ghép từ dữ liệu người dùng. `..`, `%2e%2e`, `deck.json`, entry không thuộc `img/*.<đuôi ảnh>`, `deckKey` lạ → đều 404. (Lưu ý: không dùng lại `registerDeck`/`realpath` kiểu cũ.)
- SVG hiển thị bằng `<img>` kèm header CSP `sandbox` → script trong SVG không chạy.
- **Editor**: ảnh vừa thêm nằm ngay trong `assets` nên xem trước dùng luôn `asset://`; chỉ ghi xuống file khi bấm Lưu. `deck:close` xoá gói khỏi `packages` để giải phóng bộ nhớ.
- Đã chặn điều hướng / cửa sổ lạ trong `createWindow` (7.2): `setWindowOpenHandler(() => ({ action: 'deny' }))` và `will-navigate`.
- CSP trong `index.html` (KaTeX dùng style inline nên cần `unsafe-inline` cho style, không cần cho script):
```html
<meta http-equiv="Content-Security-Policy"
  content="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' asset:; font-src 'self'">
```
- Nếu sau này thêm `audio` cho thẻ từ vựng: mở rộng whitelist trong `sdeck.js` (vd `audio/*.mp3|ogg|wav`), trong `IMG_PATH`/`MIME` ở trên và thêm `media-src asset:` vào CSP.

---

## 8. Mô hình dữ liệu tiến độ

```json
{
  "version": 1,
  "cards": {
    "eng-ielts-01:w-0001:en-vi": { "state": "review", "ease": 2.6, "interval": 6, "due": 1793000000000, "reps": 3, "lapses": 0 },
    "eng-ielts-01:w-0001:vi-en": { "state": "learning", "step": 1, "ease": 2.5, "interval": 0, "due": 1792500000000, "reps": 0, "lapses": 0 }
  },
  "meta": { "eng-ielts-01:w-0001": { "starred": true, "note": "" } },
  "log": [ { "t": 1792400000000, "card": "eng-ielts-01:w-0001:vi-en", "rating": 3, "ms": 3800 } ]
}
```
- Khoá thẻ = `deckId:itemId:direction`, với `deckId` = `meta.id` trong `deck.json` (không phải tên file hay đường dẫn): đổi tên / di chuyển file `.sdeck` không mất tiến độ.
- Item bị xoá khỏi deck: giữ nguyên tiến độ, chỉ bỏ qua khi học.

---

## 9. Giao diện

1. **Home**: Thư viện deck (tự quét thư mục), số thẻ đến hạn/mới, nút *Ôn hôm nay*, *Learn*, *Thi thử*; nút **Bộ thẻ mới**, **Mở file…**, **Nhập…**; menu mỗi deck: *Sửa*, *Sao chép*, *Hiện trong thư mục*, *Gỡ khỏi danh sách*.
2. **Deck view**: danh sách item, tìm kiếm, sao, chọn chế độ học và hướng, danh sách cảnh báo / mục bị bỏ qua; nút **Sửa bộ thẻ**.
3. **Editor** (chi tiết tại **`study-app-editor-ux.md`**): khung `100vh` không thanh cuộn lồng, 3 cột (`Danh sách 260px` | `Vùng soạn co giãn` | `Xem trước 400px` có thể thu gọn `Ctrl+\`) ngăn bằng 2 vách kéo `6px` lưu độ rộng vào `settings.json`; thanh trên cố định `56px` có nút `←`, tên bộ thẻ sửa tại chỗ kèm trạng thái `Đã lưu HH:MM` / `● Chưa lưu` ngay sát bên, `▶ Học thử`, `↶ ↷`, nút gộp `[Lưu ▾]`; thông báo *toast* góc dưới có nút **Hoàn tác** / **Xem**.
```
┌─ ← Về Home │ Giải tích 1 ✎ │ ● chưa lưu │ ↶ ↷ │ [Lưu Ctrl+S ▾] ───────────────┐
├─ Danh sách (240px) ───┬─ Form soạn ───────────────────┬─ Xem trước ────────────┤
│ 🔍 tìm  [lọc ▾]       │ Dạng: [Trắc nghiệm 1 đáp án ▾]│ (đúng như khi học)     │
│ ⠿ Tính ∫₀¹ x² dx      │ Câu hỏi                       │ Tính ∫₀¹ x² dx …       │
│ ⠿ ⚠ Nghiệm của x²−2  │ [B I </> $ $$ 🖼][ô soạn…]    │ ○ 1/2  ● 1/3  ○ 1      │
│ ⠿ Công thức bậc hai   │ Lựa chọn  ◉ [1/2   ][🖼][✕]   │ [Thử trả lời]          │
│ [+ Thêm ▾] [nhân đôi] │           ○ [1/3   ][🖼][✕]   │                        │
│ ─ Ảnh trong bộ (3) ▸  │ [+ Thêm lựa chọn]  Giải thích │                        │
└───────────────────────┴───────────────────────────────┴────────────────────────┘
```
4. **Session**: tiến trình, câu hỏi (Markdown), vùng trả lời, phản hồi + giải thích, phím tắt.
5. **Result**: điểm, thời gian, câu sai → *Học lại câu sai*.
6. **Stats**: % đúng theo deck/topic, heatmap, leech.
7. **Settings**: thư mục Thư viện, số thẻ mới/ngày, learning steps, giọng TTS, theme, backup.

- **Nguyên tắc bố cục rộng rãi (Full-width Responsive):**
  - Giao diện trải rộng theo chiều ngang màn hình máy tính (tối đa ~1400px), không ép hẹp vào một cột giữa nhỏ khiến giao diện bị dồn cục hoặc tạo cảm giác zoom in chật chội.
  - **Phiên học (Session)**: thẻ câu hỏi mở rộng (~1100px); với Flashcard, thẻ lật có kích thước rộng rãi, phông chữ lớn dễ đọc, không lặp lại đề bài bên ngoài thẻ; danh sách lựa chọn trắc nghiệm tự động chia 2 cột khi màn hình đủ rộng.
  - **Danh sách & Bảng**: bảng xem trước và danh sách bộ thẻ co giãn đầy đủ chiều rộng, giúp đọc trọn vẹn văn bản câu hỏi và công thức LaTeX.

---

## 10. Kế hoạch làm

**GĐ1 — MVP**: khung Electron + IPC, đọc/ghi gói `.sdeck`, parser + validate, nhập `.json`, Home/Deck view, grader, flashcard + trắc nghiệm + gõ đáp án; render Markdown + công thức KaTeX + ảnh qua `asset://` (`richtext.js`).
**GĐ1b — Deck Editor**: tạo/sửa/xoá/nhân đôi/sắp xếp câu hỏi bằng giao diện, quản lý ảnh (nút, kéo thả, dán), xem trước, undo/redo, lưu `.sdeck`.
**GĐ2 — SRS & vocab**: `srs.js`, builder (MC/write/cloze), nhập CSV/Quizlet/Markdown, hai chiều EN↔VI, TTS + Listen mode, Editor cho vocab + nhập hàng loạt.
**GĐ3 — Learn & Match**: planner mastery, chế độ Match, bộ lọc topic/tag, exam mode.
**GĐ4 — Hoàn thiện**: thống kê, leech, Thư viện + liên kết file `.sdeck`, watch file, tự lưu nháp Editor, backup, dark mode, `electron-builder` (AppImage/rpm).
**Sau đó**: FSRS, SQLite, tra từ điển, âm thanh cho thẻ (mở rộng gói với `audio/`), đồng bộ qua git/Syncthing (chỉ cần đồng bộ các file `.sdeck`).

(Đánh số GĐ ở đây là bản tóm tắt; kế hoạch giao việc chi tiết từng giai đoạn nằm trong `study-app-phases.md`.)

---

## 11. Kiểm thử

- Unit test `grader`, `srs`, `builder`, `planner` bằng `node --test` (logic thuần, không cần Electron).
- Test parser: id trùng, thiếu trường, `answer` ngoài phạm vi `choices`, CSV có dấu phẩy/ngoặc kép.
- Mô phỏng 30–60 ngày review để chắc interval tăng hợp lý, không nổ lịch.
- Tắt app giữa lúc ghi `.sdeck` và `progress.json` để kiểm tra file không hỏng (file cũ và `.bak` vẫn mở được).
- Test `richtext`: `$\frac{a}{b}$` và `$$...$$` ra HTML có công thức; LaTeX sai không ném lỗi; `<script>`, `onerror=`, `javascript:` bị loại; ảnh `http:`/`file:`/`data:` bị từ chối; ảnh tương đối thành URL `asset://`.
- Test `asset://`: `asset://<key>/img/../deck.json`, `asset://<key>/img/%2e%2e/deck.json`, `asset://<key>/deck.json`, `deckKey` lạ, đường dẫn không tồn tại, entry không phải ảnh → 404; ảnh hợp lệ (svg/png/jpg) trong gói trả về bình thường với đúng `Content-Type`.
- Test chấm: `number` (`1/3` với `0.3333` và `tolerance`, `0,5`), `latex` (`\dfrac{1}{2}` với `\frac12` cùng chuẩn hoá).
- Test parser: ảnh thiếu/quá lớn → cảnh báo nhưng deck vẫn nạp; `choices` dạng chuỗi lẫn `{text, image}`; JSON có `\\frac` giữ đúng `\frac`.
- Test `sdeck`: ghi rồi đọc lại giống hệt (kể cả tiếng Việt và `\frac` trong LaTeX); không phải ZIP; thiếu `deck.json`; entry `../x.png`, `/etc/x`, `img\a.png`, `img//a.png` bị bỏ kèm cảnh báo; file đuôi `.png` nhưng nội dung là văn bản bị bỏ; quá nhiều entry / quá lớn → từ chối; `addImage` từ chối ảnh giả và ảnh > 5 MB, cùng ảnh thêm hai lần chỉ ra một tên; `writePackage` bỏ ảnh không còn tham chiếu.
- Test `validate` và `deckmodel`: add / remove / move / duplicate / changeType / undo-redo (gộp lần gõ), `unusedAssets`, id mới khi nhân đôi, mỗi quy tắc cảnh báo của `validateItem`.

---

## 12. Khởi động nhanh

```bash
mkdir study-app && cd study-app
npm init -y
npm i -D electron electron-builder
npm i fflate marked marked-katex-extension katex highlight.js dompurify chart.js
echo '{ "type": "module" }' > src/core/package.json   # (tạo thư mục src/core trước)
# KaTeX: copy node_modules/katex/dist/katex.min.css và thư mục fonts/ vào src/vendor/katex/ (font phải nằm cạnh css)
# package.json: "main": "main.js",
#   "scripts": { "start": "electron .", "test": "node --test",
#                "build:samples": "node tools/sdeck.mjs pack-all data/samples-src data/samples" }
npm run build:samples      # tạo các file .sdeck mẫu trong data/samples/
npm start                  # rồi bấm "Mở file…" và chọn một file .sdeck mẫu
```
