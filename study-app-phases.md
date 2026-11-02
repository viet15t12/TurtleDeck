# Study App — Các giai đoạn thiết kế (để giao cho AI code)

Tài liệu này dùng **cùng với `study-app.md`** (spec đầy đủ: chức năng, định dạng dữ liệu, thuật toán, mã mẫu). Cách dùng:

1. Đưa AI cả hai file: `study-app.md` (spec) + file này (kế hoạch).
2. Giao **từng giai đoạn một**, dán prompt của giai đoạn đó. Chạy xong, tự kiểm tra theo mục *Nghiệm thu* rồi mới sang giai đoạn tiếp.
3. Sau mỗi giai đoạn: commit git (`git commit -m "phase N: ..."`) để dễ quay lại.

---

## 0. Quy tắc chung cho AI (dán vào đầu mọi phiên)

```
Bạn đang giúp tôi xây app Electron học tập (flashcard, trắc nghiệm, gõ đáp án, SRS)
theo file study-app.md. Tuân thủ:

- Electron + JavaScript thuần (CommonJS cho main/preload, ES module cho renderer nếu cần).
  Không dùng framework nặng trừ khi tôi yêu cầu.
- Bảo mật: contextIsolation: true, nodeIntegration: false. Renderer chỉ gọi qua window.api (preload).
- Logic học (parser, builder, grader, srs, planner, stats) viết trong src/core/ dạng hàm thuần,
  KHÔNG phụ thuộc Electron/DOM, để test bằng `node --test`.
- Mọi ghi file (tiến độ, cài đặt, gói `.sdeck`) phải atomic (ghi .tmp rồi rename).
- Mọi HTML sinh từ Markdown phải qua DOMPurify.
- Mọi trường nội dung (question, choices, answerDisplay, explanation, front/back, term/definition, example) là **Markdown + LaTeX (KaTeX) + ảnh svg/png/jpg**; luôn hiển thị qua `core/richtext.js`, không tự `innerHTML` ở chỗ khác. Ảnh chỉ tải qua giao thức `asset://`, phục vụ từ **gói `.sdeck` đang mở trong bộ nhớ**, không tải từ internet.
- Định dạng lưu bộ thẻ duy nhất là **gói `.sdeck`** (ZIP đơn giản, không mã hoá, không mật khẩu, đuôi riêng; study-app.md mục 3.0). **Người dùng không bao giờ phải giải nén gói hay sửa JSON**: mọi thao tác tạo/thêm/xoá/sửa câu hỏi và ảnh đều qua Deck Editor trong app. `deck.json` chỉ là file nội bộ trong gói.
- Mọi file trong `src/core/` viết dạng ES module (`export`; `src/core/package.json` có `{"type":"module"}`), main (CommonJS) nạp bằng `await import()`, renderer nạp bằng `<script type="module">`; `node --test` chạy trực tiếp được.
- Main không tin dữ liệu từ renderer: ảnh thêm vào gói và `deck.json` được kiểm tra lại ở main trước khi ghi.
- Trong `deck.json`, ký tự `\` của LaTeX phải escape thành `\\` (vd `\\frac`) — Editor tự lo; quy tắc này chỉ áp dụng khi viết deck mẫu / `deck.json` thủ công ngoài app.
- Mỗi giai đoạn: chỉ làm đúng phạm vi giai đoạn đó, không làm trước tính năng của giai đoạn sau.
- Viết test cho phần logic trong src/core/. Chạy test và `npm start` để chắc không lỗi trước khi báo xong.
- Cuối mỗi giai đoạn: liệt kê file đã tạo/sửa, cách chạy, và những gì chưa làm.
- Giao diện, thông báo, comment cho người dùng: tiếng Việt. Tên biến/hàm: tiếng Anh.
- Bố cục giao diện rộng rãi (full-width responsive, tối đa ~1400px), không dồn cục hẹp ở giữa màn hình; thẻ học Flashcard mở rộng trực quan, không hiển thị lặp đề bài ngoài thẻ.
- Môi trường: Fedora Linux, Node LTS.
```

---

## Tổng quan các giai đoạn

| GĐ | Tên | Kết quả chính |
|---|---|---|
| 1 | Khung dự án | App Electron mở được, đọc/ghi gói `.sdeck`, hiển thị danh sách thẻ |
| 2 | Học cơ bản | Flashcard + trắc nghiệm + gõ đáp án + chấm điểm |
| 2B | Nội dung phong phú | Công thức LaTeX (KaTeX) + ảnh svg/png/jpg trong câu hỏi, đáp án, giải thích |
| 2C | Deck Editor | Tạo / thêm / xoá / sửa câu hỏi và ảnh bằng giao diện, lưu ra file `.sdeck` |
| 3 | Lưu tiến độ & SRS | Lịch ôn SM-2, màn hình "ôn hôm nay" |
| 4 | Vocab & tiếng Anh | Nhập CSV/Quizlet/Markdown (→ `.sdeck`), Editor cho vocab + nhập hàng loạt, sinh câu hỏi tự động, 2 chiều, TTS, cloze |
| 5 | Learn & Match | Chế độ Learn thích ứng, Match, Exam |
| 6 | Thống kê & tiện ích | Stats, leech, sao/ghi chú, phím tắt, dark mode, backup |
| 7 | Đóng gói | AppImage/rpm, README, kiểm thử cuối |

---

## Giai đoạn 1 — Khung dự án

**Mục tiêu:** app chạy được, có cấu trúc thư mục đúng, đọc/ghi được gói `.sdeck` và hiển thị bộ thẻ.

**Việc cần làm**
- `npm init`, cài `electron`, `electron-builder` (dev), `fflate`, `marked`, `highlight.js`, `dompurify`.
- Tạo cấu trúc theo study-app.md mục 7.1: `main.js`, `preload.js`, `tools/sdeck.mjs`, `src/index.html`, `src/app.js`, `src/core/` (kèm `package.json` `{"type":"module"}`), `src/views/`, `data/samples-src/`, `test/`.
- `core/sdeck.js` (mã mẫu mục 7.3b): `readPackage(bytes)`, `writePackage(deckText, assets, {prune})`, `addImage`, `isSafeEntry`, `detectImageType`, `LIMITS`; thêm `collectAssetsFromDir(dir, deckText)` cho nhập từ thư mục (`realpath` phải nằm trong thư mục nguồn, đúng đuôi/nội dung ảnh, ≤ 5 MB). Gói được đọc **vào bộ nhớ**, không giải nén ra đĩa.
- `core/validate.js`: `validateItem(item)` / `validateDeck(deck)` (id trùng, thiếu trường, `answer` ngoài `choices`…) — dùng chung cho parser và Editor (GĐ2C).
- `core/parser.js`: nhận `deckText` (JSON trong gói) → `{ok, deck, issues[]}`. Lỗi cấp **bộ thẻ** (JSON hỏng, thiếu `meta.id`/`items`, id item trùng, `formatVersion` cao hơn app biết) → `ok:false` với thông báo tiếng Việt nêu rõ nguyên nhân. Lỗi cấp **item** (thiếu trường, `answer` ngoài `choices`…) → **bỏ qua item đó**, ghi vào `issues` kèm id và lý do; các item còn lại vẫn học được.
- `main.js` (mục 7.2): cửa sổ; `packages` Map giữ gói đang mở; IPC `deck:open` (hộp thoại `.sdeck`, nhiều file, hoặc nhận đường dẫn), `deck:import` (`.json` hoặc thư mục `deck.json` + `img/` → gói trong bộ nhớ chưa có file), `deck:save` (Lưu thành `.sdeck`: nén → đọc lại kiểm tra → ghi `.tmp` → `rename`, giữ `.bak`), `deck:close`, `progress:load/save`, `settings:load/save` (atomic). `deckKey` ngẫu nhiên cho mỗi gói mở.
- `tools/sdeck.mjs` (dev): `pack <thư-mục> [file]`, `unpack <file> [thư-mục]`, `check <file>`, `pack-all <nguồn> <ra>`.
- Home: nút *Mở file…* và *Nhập…* (json/thư mục → hỏi *Lưu thành .sdeck*); danh sách deck đã nạp (tên, số item, số cảnh báo); nhớ đường dẫn vào `settings.json` và tự nạp lại khi mở app; file không còn tồn tại → báo, cho gỡ khỏi danh sách.
- Deck view: bảng item (term/question rút gọn, tags) và danh sách `issues`.
- Deck mẫu dạng thư mục nguồn: `data/samples-src/lpic-sample/deck.json` (5 câu: single, multi, fill, command, card) và `data/samples-src/vocab-sample/deck.json` (10 từ); `npm run build:samples` đóng gói thành `data/samples/*.sdeck`.

**Nghiệm thu**
- [ ] `npm start` mở cửa sổ không lỗi console.
- [ ] `npm run build:samples` ra 2 file `.sdeck`; mở trong app thấy danh sách item. Đổi đuôi một file sang `.zip` → giải nén thấy `deck.json`.
- [ ] Test `sdeck`: ghi rồi đọc lại giống hệt (tiếng Việt, `\frac`); không phải ZIP; thiếu `deck.json`; entry `../x.png`, `/etc/x`, `img\a.png` bị bỏ kèm cảnh báo; file `.png` giả (nội dung văn bản) bị bỏ; quá nhiều entry/quá lớn → từ chối.
- [ ] Mở gói có `deck.json` hỏng hoặc trùng id → thông báo lỗi dễ hiểu, app không crash. Gói có item thiếu trường → item đó bị bỏ qua và được liệt kê, các item khác vẫn hiện.
- [ ] Nhập một deck `.json` + thư mục `img/` → Lưu thành `.sdeck` → mở lại được, ảnh có trong gói.
- [ ] Kill app đúng lúc đang lưu → file `.sdeck` cũ vẫn mở được.
- [ ] `node --test` chạy qua test `sdeck`, `validate`, `parser`.

**Prompt giao việc**
```
Làm GIAI ĐOẠN 1 trong study-app-phases.md, theo study-app.md
(mục 3.0–3.2 gói .sdeck và deck.json, mục 5 cơ chế, mục 7.1–7.3b cấu trúc, main/preload, sdeck.js).
Chỉ làm khung dự án, đọc/ghi gói .sdeck (trong bộ nhớ), validate + parser, nhập .json/thư mục,
Home, Deck view và tools/sdeck.mjs. Chưa làm chế độ học và chưa làm Editor.
Cuối cùng báo file đã tạo và cách chạy test.
```

---

## Giai đoạn 2 — Học cơ bản

**Mục tiêu:** học được 4 dạng câu hỏi trong một phiên, có phản hồi.

**Việc cần làm**
- `core/grader.js`: `gradeText` (normalized/exact/regex + dung sai Levenshtein) và `gradeChoices` (so khớp tập chỉ số).
- `core/builder.js` (bản đầu): đưa item `single/multi/fill/command/card` về một cấu trúc `Question` thống nhất `{kind, prompt, choices?, answers, explanation}`.
- `views/session.js`: hiển thị theo `kind`: radio (single), checkbox (multi), ô nhập (fill/command), thẻ lật (card).
- Sau khi nộp: báo đúng/sai/gần đúng, hiện đáp án + `explanation` (Markdown, sanitize).
- Phiên học: chọn deck + số câu + thứ tự (ngẫu nhiên/theo file) → tiến trình → màn hình kết quả (điểm, danh sách câu sai, "học lại câu sai").
- Phím tắt: `1-5`, `Enter` (nộp/tiếp), `Space` (lật thẻ).

**Nghiệm thu**
- [ ] Test grader đủ ca: hoa/thường, khoảng trắng thừa, nhiều đáp án chấp nhận, regex, multi thiếu/thừa, lỗi 1 ký tự với từ dài → "gần đúng".
- [ ] Học trọn một phiên 5 câu mẫu, thấy kết quả, học lại câu sai được.
- [ ] Markdown + code block trong đề/giải thích hiển thị đúng, không chạy được script chèn vào.

**Prompt giao việc**
```
Làm GIAI ĐOẠN 2. Dùng mã mẫu grader ở study-app.md mục 7.4 làm cơ sở và hoàn thiện.
Thêm builder bản đầu, màn hình session cho 5 kind, màn hình kết quả, phím tắt.
Viết test cho grader và builder. Chưa làm SRS hay lưu tiến độ lâu dài.
```

---

## Giai đoạn 2B — Nội dung phong phú: công thức LaTeX và ảnh

**Mục tiêu:** câu hỏi, lựa chọn, đáp án, giải thích đều chứa được công thức toán và hình ảnh svg/png/jpg, hiển thị đẹp, an toàn, offline.

**Việc cần làm**
- Cài `katex`, `marked-katex-extension`; copy `katex.min.css` + thư mục `fonts/` vào `src/vendor/katex/` và nạp trong `index.html`.
- `core/richtext.js` (mã mẫu study-app.md mục 7.9): `makeRich(deckKey)` trả `{html, inline}`; `toPlain(md)` bỏ LaTeX/ảnh/markup cho TTS, tìm kiếm, xem trước. Thay mọi chỗ render Markdown ở GĐ 2 bằng module này.
- Main process (mục 7.10): đăng ký scheme `asset` (`registerSchemesAsPrivileged` trước `ready`), `protocol.handle` phục vụ ảnh **từ `assets` trong bộ nhớ của gói đang mở** (tra `Map` theo khoá chính xác `img/...`, whitelist đuôi ảnh, trả 404 cho mọi thứ khác kể cả `deck.json` và `deckKey` lạ, kèm header `nosniff` + CSP `sandbox`); `deckKey` ngẫu nhiên đã cấp khi mở gói (GĐ1); chặn `will-navigate` và `window.open`.
- CSP trong `index.html` (`img-src 'self' asset:`, không cho ảnh http/https).
- Parser: duyệt mọi trường text tìm `![..](path)` cùng các trường `image`, `answerImage`, `choices[].image`; kiểm tra ảnh có trong gói, đuôi hợp lệ, cỡ ≤ 5 MB. Vấn đề ảnh chỉ là **cảnh báo** (deck vẫn nạp), hiển thị trong danh sách cảnh báo của deck.
- `choices` chấp nhận chuỗi hoặc `{text, image}`; builder/session hiển thị cả hai; phát hiện lựa chọn trùng bằng `text + image`.
- Grader (mục 4.3b): thêm `match: "number"` (có `tolerance`, phân số, dấu `,`) và `match: "latex"` (chuẩn hoá).
- `answerDisplay` (Markdown/LaTeX) dùng để hiển thị đáp án đúng; không có thì hiển thị `answer`.
- UI: ảnh bấm để phóng to (lightbox, `Esc` đóng), `max-width: 100%`, công thức dài cuộn ngang (`overflow-x: auto`), dark mode cho ảnh nền sáng, ảnh lỗi hiện khung "không tìm thấy ảnh".
- Deck mẫu `data/samples-src/math-sample/` (`deck.json` + `img/`: 1 svg, 1 png, 1 jpg; `npm run build:samples` đóng gói ra `data/samples/math-sample.sdeck`): câu `single` có công thức ở đề và lựa chọn, câu có hình trong đề, lựa chọn bằng ảnh, câu `fill` kiểu `number`, thẻ `card` có công thức ở mặt sau.

**Nghiệm thu**
- [ ] `$\frac{a}{b}$` (trong dòng) và `$$...$$` (khối) hiển thị đúng; LaTeX sai cú pháp hiện mã đỏ, không làm hỏng câu/app.
- [ ] Ảnh svg, png, jpg trong gói (`img/...`) hiển thị được; ảnh thiếu → khung "không tìm thấy", vẫn học được.
- [ ] Test: `asset://<key>/img/../deck.json`, `asset://<key>/img/%2e%2e/deck.json`, `asset://<key>/deck.json`, `deckKey` lạ, đường dẫn không tồn tại, entry không phải ảnh → 404; ảnh hợp lệ trong gói trả về đúng `Content-Type`.
- [ ] Test: `<script>`, `onerror=`, `javascript:` trong Markdown bị loại; SVG chứa `<script>` không chạy; `\href{javascript:...}` của KaTeX không hoạt động.
- [ ] Ảnh `http(s)://` bị chặn; khi học không có request mạng nào ra ngoài.
- [ ] Test grader: `1/3` khớp `0.3333` với `tolerance: 0.001`; `0,5` khớp `0.5`; `\dfrac{1}{2}` khớp `\frac{1}{2}`.
- [ ] Công thức vẫn hiển thị sau khi qua DOMPurify.

**Prompt giao việc**
```
Làm GIAI ĐOẠN 2B trong study-app-phases.md, theo study-app.md mục 2.6, 3.5, 4.3b, 7.9, 7.10.
Thêm core/richtext.js (marked + KaTeX + DOMPurify), giao thức asset:// an toàn trong main.js (phục vụ ảnh từ gói .sdeck trong bộ nhớ),
CSP, xử lý ảnh/công thức ở parser, hỗ trợ choices dạng {text, image}, match number/latex,
lightbox cho ảnh, và deck mẫu có công thức + ảnh svg/png/jpg.
Viết test cho richtext, asset:// (path traversal), grader number/latex và parser.
Nhớ: trong JSON dấu \ của LaTeX phải là \\.
```

---

## Giai đoạn 2C — Deck Editor: tạo và sửa bộ thẻ bằng giao diện

**Mục tiêu:** người dùng tạo bộ thẻ mới, thêm / xoá / sửa câu hỏi và ảnh, rồi lưu ra file `.sdeck` — **không phải giải nén hay sửa JSON ở bất kỳ bước nào** (study-app.md mục 2.7, 3.0, 7.3b, 9).

**Việc cần làm**
- `core/validate.js` (mở rộng từ GĐ1): `validateItem(item, {assets})` trả `[{level:'error'|'warn', field, msg}]` — `single` ≥ 2 lựa chọn và đúng 1 đáp án; `multi` ≥ 1 đáp án; lựa chọn không rỗng/không trùng (`text + image`); `fill`/`command` ≥ 1 đáp án không rỗng, regex hợp lệ (thử `new RegExp`), `number` đọc được; `card` có đủ front/back; ảnh tham chiếu có trong gói; thiếu mô tả ảnh → `warn`. Item có `error` bị bỏ qua khi học.
- `core/deckmodel.js` (hàm thuần, không sửa state cũ): `newDeck({title, kind, lang})` (sinh `meta.id`), `newItem(type)`, `newItemId(deck)`, `addItem`, `removeItems`, `duplicateItem` (id mới), `moveItem`, `updateItem`, `changeType` (single↔multi, fill↔command… giữ phần dữ liệu giữ được), `imageRefs` / `collectImageRefs`, `unusedAssets(deck, assets)`, `createHistory(deck, limit = 100)` với `push / undo / redo / canUndo / canRedo` (gộp các lần gõ liên tiếp trong 500 ms thành một bước).
- Main (mục 7.2): hoàn thiện `deck:new`, `deck:save` (Lưu / Lưu thành…, bản sao nhận `meta.id` mới từ renderer, `.bak`, atomic, dọn ảnh không dùng sau khi hỏi), `asset:add` (hộp thoại nhiều ảnh), `asset:addBytes` (kéo thả / dán clipboard), `asset:list`. Main **tự kiểm** mọi thứ nhận từ renderer (nội dung phải là ảnh thật, ≤ 5 MB, tên đã làm sạch).
- `views/editor.js` (bố cục ba khu vực, mục 9):
  - **Danh sách mục**: tìm kiếm; lọc topic / tag / dạng / ⚠ chưa hoàn chỉnh; kéo thả sắp xếp; *Thêm* (menu chọn dạng), nhân đôi, xoá (xác nhận khi xoá nhiều, có Undo); chọn nhiều → xoá / gán topic / gán tag.
  - **Form theo dạng**: `single`/`multi` (câu hỏi; danh sách lựa chọn có chữ + ảnh, thêm/xoá/kéo sắp xếp; radio/checkbox đánh dấu đúng; giải thích); `fill`/`command` (danh sách đáp án chấp nhận; `match`; `tolerance` khi `number`; `answerDisplay`; ô *thử đáp án* chạy đúng `grader`); `card` (front/back + ảnh). Chung: topic, tags (chip), explanation, `image`, `answerImage`.
  - **Ô soạn Markdown** có thanh công cụ (đậm, nghiêng, code, `$…$`, `$$…$$`, chèn ảnh) và bảng ký hiệu LaTeX hay dùng bấm để chèn.
  - **Ảnh**: nút *Chèn ảnh*, **kéo thả file vào ô soạn**, **dán clipboard (`Ctrl+V`)**; sau khi thêm tự chèn `![mô tả](img/...)` và đặt con trỏ vào phần mô tả; trình quản lý ảnh (thumbnail, dung lượng, "dùng ở N mục", xoá ảnh không dùng).
  - **Xem trước** thời gian thực dùng đúng `richtext.js` và component của session (không viết bộ render riêng); nút *Thử trả lời*.
  - **Thanh trên**: tên bộ thẻ sửa tại chỗ, chỉ báo `● chưa lưu`, Undo/Redo (`Ctrl+Z`/`Ctrl+Y`), Lưu (`Ctrl+S`), *Lưu thành bản sao…*; hỏi xác nhận khi đóng cửa sổ / chuyển màn hình / thoát app lúc chưa lưu.
- Home: nút **Bộ thẻ mới** (hộp thoại: tên, loại, ngôn ngữ); menu mỗi deck thêm **Sửa**, **Sao chép**. Deck view có nút **Sửa bộ thẻ**.
- Lưu xong, Home/Deck view tự cập nhật; nếu đang có phiên học với deck đó thì không đổi nội dung giữa phiên.
- Chưa làm: form riêng cho vocab và nhập hàng loạt (GĐ4), tự lưu nháp (GĐ6).

**Nghiệm thu**
- [ ] Tạo bộ thẻ mới → thêm mỗi dạng một câu (`single`, `multi`, `fill`, `command`, `card`) bằng giao diện → Lưu → thoát app → mở lại file `.sdeck`: đủ 5 câu, học được ngay, **không đụng JSON**.
- [ ] Thêm ảnh bằng 3 cách (nút, kéo thả, dán clipboard) → ảnh hiện trong xem trước; lưu rồi mở lại vẫn còn; cùng một ảnh thêm hai lần chỉ lưu một bản trong gói.
- [ ] Xoá một câu rồi Undo → câu trở lại đúng vị trí; xoá lựa chọn/ảnh rồi Undo cũng vậy; Redo hoạt động.
- [ ] Câu thiếu đáp án đúng / trùng lựa chọn / regex sai hiện cảnh báo tại ô đó và ⚠ ở danh sách; câu chưa hoàn chỉnh bị bỏ qua khi học và được liệt kê ở Deck view.
- [ ] Sửa nội dung câu (giữ `id`) rồi lưu → `id` không đổi; nhân đôi → id mới; *Lưu thành bản sao* → `meta.id` mới.
- [ ] Chưa lưu mà đóng cửa sổ → có hỏi. Kill app lúc đang lưu → file cũ không hỏng (còn `.bak`).
- [ ] Ảnh không còn được dùng: lúc Lưu có hỏi dọn; chọn dọn → file `.sdeck` nhỏ lại.
- [ ] Test `deckmodel`, `validate` và `sdeck.addImage` (ảnh giả, quá lớn, trùng) xanh.
- [ ] Chép file `.sdeck` sang máy khác (hoặc đổi đuôi `.zip` để kiểm tra) → mở được, ảnh còn đủ.

**Prompt giao việc**
```
Làm GIAI ĐOẠN 2C trong study-app-phases.md, theo study-app.md mục 2.7, 3.0, 7.3b, 9.
Thêm Deck Editor: tạo bộ thẻ mới, thêm/xoá/sửa/nhân đôi/sắp xếp câu hỏi
(single, multi, fill, command, card), quản lý ảnh (nút, kéo thả, dán clipboard),
xem trước thời gian thực bằng richtext.js, validate dùng chung với parser,
undo/redo, lưu ra .sdeck (atomic + .bak), cảnh báo khi chưa lưu.
Người dùng không được phải mở hay sửa JSON ở bất kỳ bước nào.
Viết test cho validate, deckmodel và sdeck.addImage.
Chưa làm form vocab, nhập hàng loạt, tự lưu nháp.
```

---

## Giai đoạn 3 — Lưu tiến độ & SRS

**Mục tiêu:** app nhớ thẻ nào cần ôn khi nào.

**Việc cần làm**
- `core/srs.js`: SM-2 + learning steps (mã mẫu mục 7.5); `newCard`, `schedule`, `isDue`.
- Khoá thẻ: `deckId:itemId:direction` (direction mặc định `fwd` với quiz).
- Sau mỗi câu: tính rating (đúng→Good, sai→Again; flashcard cho tự chọn Again/Hard/Good/Easy) → `schedule` → ghi `progress.json` + thêm 1 dòng vào `log`.
- `core/planner.js` (bản SRS): chọn câu theo thứ tự due → learning → new (giới hạn N mới/ngày, cấu hình được).
- Home: hiện "đến hạn hôm nay / thẻ mới" cho từng deck, nút **Ôn hôm nay**.
- Câu sai được chèn lại sau 3–7 câu trong cùng phiên.
- Settings: số thẻ mới/ngày, learning steps.

**Nghiệm thu**
- [ ] Test `srs.js`: new→learning→review, Again giảm ease và về relearning, Easy tăng interval, ease không dưới 1.3.
- [ ] Script mô phỏng 60 ngày với tỉ lệ đúng 85%: interval tăng hợp lý, không "nổ" số thẻ due.
- [ ] Tắt/mở app giữa chừng: tiến độ còn; file không hỏng khi kill đột ngột lúc đang ghi.
- [ ] Sửa nội dung item bằng Editor (giữ `id`) → tiến độ vẫn còn; *Lưu thành bản sao* (`meta.id` mới) → tiến độ của bản sao bắt đầu lại; đổi tên file `.sdeck` → tiến độ vẫn còn.

**Prompt giao việc**
```
Làm GIAI ĐOẠN 3. Dùng srs.js mục 7.5 và mô hình progress mục 8 trong study-app.md.
Thêm planner chọn câu due/learning/new, ghi log mỗi lượt trả lời, màn hình Ôn hôm nay.
Viết test srs và một script mô phỏng 60 ngày (test/simulate.js) in ra số thẻ due mỗi ngày.
```

---

## Giai đoạn 4 — Vocab & tiếng Anh

**Mục tiêu:** học từ vựng kiểu Quizlet.

**Việc cần làm**
- `parser.js`: thêm CSV/TSV (có xử lý dấu ngoặc kép), định dạng Quizlet export, Markdown `## term | definition` + `- key: value`. `id` sinh bằng hash ổn định của `term` (SHA-1 rút gọn) để import lại không mất tiến độ. Các định dạng này là **định dạng nhập**: kết quả được chuyển thành gói `.sdeck` rồi lưu bằng `deck:save` (nhập vào bộ thẻ mới hoặc vào bộ thẻ đang mở trong Editor).
- **Editor cho vocab**: form `term / definition / phonetic / pos (danh sách chọn) / example / forms (chip) / synonyms / tags / image`, nút loa nghe thử; cảnh báo khi `example` không chứa `term` hoặc `forms` (cloze sẽ bị bỏ qua).
- **Nhập hàng loạt** trong Editor: dán văn bản (TSV/CSV/Quizlet/Markdown quiz) hoặc chọn file → xem trước dạng bảng, bỏ chọn dòng không muốn → thêm vào bộ thẻ đang soạn; id ổn định theo hash `term`, bỏ qua mục trùng với mục đã có.
- `builder.js`: `buildMC` (distractor cùng `pos`/tag), `buildWrite` (hai chiều), `buildCloze` (từ `example`, nhận `forms`).
- Hai chiều EN→VI và VI→EN, mỗi chiều một card state riêng.
- `tts.js`: `speak(text, lang)`, nút loa ở mọi màn có từ; kiểm tra `getVoices()` rỗng thì báo hướng dẫn cài giọng (Fedora: speech-dispatcher + espeak-ng) và dùng `audio` của item nếu có.
- Chế độ **Nghe–Gõ**: phát âm, người học gõ từ; chấm bằng `gradeText`.
- Hiển thị `phonetic`, `pos`, `example`, `image` (nếu có) trên thẻ.
- CSV/TSV có thêm cột tuỳ chọn `image` (đường dẫn tương đối; khi nhập, app đọc ảnh từ thư mục chứa file rồi đưa vào `img/` của gói) và `audio` (chỉ khi đã mở rộng gói với `audio/`, xem study-app.md mục 7.10); ảnh hiển thị qua `asset://`; TTS dùng `toPlain()` để bỏ LaTeX/ảnh khi đọc.
- Parser Markdown mở rộng cho **quiz** có công thức (định dạng `## Q <id> | <type> | ...` ở study-app.md mục 3.5), kèm test.

**Nghiệm thu**
- [ ] Nhập file TSV 100 từ (*Nhập hàng loạt* trong Editor, hoặc *Nhập…* ở Home → `.sdeck`), nhập lại lần 2 không tạo trùng, tiến độ giữ nguyên.
- [ ] Thêm một từ bằng form vocab trong Editor → học được cả hai chiều EN→VI và VI→EN; từ có `example` không chứa `term` hiện cảnh báo.
- [ ] Trắc nghiệm vocab luôn có đúng 1 đáp án đúng, không trùng lựa chọn, đủ 4 đáp án khi deck ≥ 4 từ (deck nhỏ hơn: tự giảm số lựa chọn).
- [ ] Cloze: `mitigate` khớp được `mitigated/mitigating`; item không có `example` thì bỏ qua dạng cloze.
- [ ] Test parser với CSV có dấu phẩy trong ô, dấu nháy kép, dòng trống, BOM.

**Prompt giao việc**
```
Làm GIAI ĐOẠN 4 theo study-app.md mục 2.3, 3.3, 3.4, 4.2, 7.6, 7.7.
Mở rộng parser (CSV/TSV/Quizlet/Markdown), builder (MC có distractor, write 2 chiều, cloze),
thêm TTS và chế độ Nghe–Gõ. Thêm form vocab và Nhập hàng loạt vào Editor (mục 2.7). Viết test cho parser và builder.
```

---

## Giai đoạn 5 — Learn, Match, Exam

**Mục tiêu:** các chế độ học phối hợp.

**Việc cần làm**
- **Learn** (mục 6.1): `planner.js` thêm mastery 0→4 qua các stage `preview → mc-en-vi → mc-vi-en → write-vi-en → cloze`; sai thì tụt 1 bậc; không để 2 câu cùng item đứng liền nhau; đạt mastery cuối thì đẩy vào SRS. Deck quiz (LPIC) bỏ bước preview, ưu tiên `single/multi` rồi `command/fill`.
- **Match**: lưới 6–8 cặp term–definition, bấm chọn 2 ô để ghép, tính giờ, ghi kỷ lục theo deck. Ô có thể chứa công thức hoặc ảnh (ghép ảnh–từ, công thức–tên).
- **Exam**: chọn deck/topic, N câu, đồng hồ đếm ngược, không hiện đáp án đến cuối, chấm điểm, xem lại câu sai, đưa câu sai vào SRS.
- Bộ lọc: topic, tag, trạng thái (mới/đang học/sai nhiều/đã sao).

**Nghiệm thu**
- [ ] Test planner: sai tụt bậc, đúng lên bậc, không lặp item liền kề, kết thúc khi mọi thẻ đạt mastery cuối.
- [ ] Match chạy mượt với deck 8 thẻ và với deck 3 thẻ (tự giảm số cặp).
- [ ] Exam: hết giờ tự nộp; kết quả đúng với đáp án đã chọn.

**Prompt giao việc**
```
Làm GIAI ĐOẠN 5 theo study-app.md mục 6 và 7.8. Thêm chế độ Learn thích ứng, Match, Exam,
và bộ lọc topic/tag/trạng thái. Viết test cho planner.
```

---

## Giai đoạn 6 — Thống kê & tiện ích

**Việc cần làm**
- `core/stats.js`: % đúng theo deck/topic, số thẻ học mỗi ngày, streak, danh sách leech (`lapses ≥ 8`) tính từ `log` + `cards`.
- Màn hình Stats: biểu đồ cột (Chart.js), heatmap 90 ngày đơn giản, bảng leech.
- Sao + ghi chú cá nhân cho từng item; nút "tôi chấm lại là đúng" (override ghi vào log).
- Dark/Light mode (CSS variables, nhớ lựa chọn).
- Phím tắt đầy đủ: `S` đánh dấu sao, `Esc` thoát phiên, `Ctrl+O` mở deck.
- Watch file `.sdeck`: đổi file thì reload (debounce), báo nếu lỗi parse nhưng giữ bản cũ; nếu bộ thẻ đang mở trong Editor có thay đổi chưa lưu thì hỏi giữ bản đang sửa hay nạp lại.
- **Tự lưu nháp** Editor mỗi 30 giây vào `userData/drafts/` (atomic); mở lại sau sự cố → hỏi khôi phục; lưu thành công thì xoá nháp.
- Import/Export tiến độ (JSON) + backup tự động mỗi ngày (giữ 7 bản).
- Gói `.sdeck` đã là định dạng chuyển máy (một file, gồm cả ảnh) nên không cần export/import riêng. Thêm **Thư viện** (thư mục mặc định `~/StudyDecks`, tự quét, đổi trong Settings), **liên kết file `.sdeck`** (double-click mở app: xử lý `open-file`/`process.argv` và `second-instance`), nút *Hiện trong thư mục*, *Xuất bản sao*.
- Settings: thư mục Thư viện, giọng TTS, theme.

**Nghiệm thu**
- [ ] Test stats với log giả lập (streak qua nửa đêm, múi giờ Asia/Saigon).
- [ ] Thay file `.sdeck` khi app đang mở (vd Syncthing đồng bộ) → danh sách cập nhật; file lỗi → báo lỗi, giữ dữ liệu cũ.
- [ ] Kill app khi đang soạn dở trong Editor → mở lại có hỏi khôi phục bản nháp.
- [ ] Đặt file `.sdeck` vào Thư viện → xuất hiện ở Home; double-click file `.sdeck` mở đúng bộ thẻ.
- [ ] Export rồi import tiến độ trên bản cài sạch → khôi phục đầy đủ.

**Prompt giao việc**
```
Làm GIAI ĐOẠN 6. Thêm stats + Stats view, sao/ghi chú/override, dark mode, phím tắt,
watch file `.sdeck`, Thư viện + liên kết file `.sdeck`, tự lưu nháp Editor, import/export + backup tiến độ, trang Settings. Viết test cho stats.
```

---

## Giai đoạn 7 — Đóng gói & hoàn thiện

**Việc cần làm**
- Cấu hình `electron-builder`: AppImage và rpm cho Linux, icon, tên app; khai báo `fileAssociations` cho `.sdeck` (mimeType `application/x-studydeck`, kèm icon) để bản cài đăng ký liên kết file.
- `README.md`: cài đặt, cách tạo/sửa bộ thẻ bằng Editor (kèm ảnh, công thức), định dạng `.sdeck` (cứu dữ liệu: đổi đuôi `.zip`), nhập từ CSV/Quizlet/Markdown/JSON, phím tắt, cách backup.
- Rà soát bảo mật: CSP trong `index.html`, không có `remote`, không load URL ngoài, sanitize mọi HTML; kiểm tra lại `asset://` (chỉ phục vụ `img/*` từ bộ nhớ, 404 với mọi thứ khác) và trình đọc `.sdeck` (zip bomb, tên entry `../`, entry lạ, file ảnh giả) và chắc chắn SVG/KaTeX không chạy được script.
- Chạy toàn bộ test, thử gói 1000 thẻ + 200 ảnh để kiểm tra hiệu năng (mở gói, bắt đầu phiên < 1 giây; Editor vẫn mượt).
- Dọn lỗi, chuẩn hoá thông báo tiếng Việt.

**Nghiệm thu**
- [ ] `npm run dist` ra được AppImage/rpm, cài và chạy được trên Fedora sạch.
- [ ] Toàn bộ `node --test` xanh.
- [ ] README đủ để người mới tạo bộ thẻ bằng Editor và học được ngay.
- [ ] Trên Fedora sạch: double-click file `.sdeck` mở đúng bộ thẻ trong app đã cài.

**Prompt giao việc**
```
Làm GIAI ĐOẠN 7: cấu hình electron-builder (AppImage, rpm, liên kết file .sdeck), viết README.md,
thêm CSP và rà soát bảo mật, kiểm tra hiệu năng với deck 1000 thẻ, chạy toàn bộ test.
```

---

## Mẹo làm việc với AI

- **Một giai đoạn một lượt.** Nếu AI làm lan sang giai đoạn sau, yêu cầu bỏ phần đó.
- **Luôn yêu cầu test cho `src/core/`.** Đây là nơi sai nhiều nhất và dễ kiểm nhất.
- **Khi lỗi:** dán nguyên văn thông báo lỗi + file liên quan + bước tái hiện, không tóm tắt.
- **Giữ spec là nguồn sự thật:** nếu muốn đổi thiết kế, sửa `study-app.md` trước rồi mới bảo AI sửa code.
- **Người dùng không được đụng JSON.** Nếu AI làm chức năng nào bắt người dùng giải nén `.sdeck` hoặc sửa `deck.json` tay, yêu cầu làm lại qua Editor. Muốn xem nội dung gói để gỡ lỗi: đổi đuôi `.sdeck` → `.zip` hoặc `node tools/sdeck.mjs unpack`.
- **Commit sau mỗi giai đoạn** để quay lại được nếu AI làm hỏng.
- **Khi phiên chat dài/AI quên ngữ cảnh:** mở phiên mới, đưa lại `study-app.md`, mục 0 của file này và "đang ở giai đoạn N, đã có các file ...".
