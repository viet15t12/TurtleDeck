# Giai đoạn 3B — Phân loại bộ thẻ (`meta.kind`) và làm lại giao diện học / quản lý

Chèn **giữa GĐ3 và GĐ4** trong `study-app-phases.md`. Dùng cùng `study-app.md` và `study-app-editor-ux.md` (lấy tokens/controls của Editor làm gốc cho toàn app).

---

## 1. Nên thêm vào giai đoạn nào?

| Việc | Giai đoạn | Lý do |
|---|---|---|
| Trường `meta.kind`, ma trận chế độ theo loại, Editor / Home / Deck view biết loại | **3B (ngay bây giờ)** | Rẻ khi chưa có nhiều deck; GĐ4, GĐ5 đều dựa vào loại để quyết định chế độ nào hiện ra |
| Làm lại giao diện Home, Deck view, Session, Result | **3B** | Các màn này vừa chạm vào ở GĐ3 (SRS, đếm thẻ), và phải kịp "biết loại" trước khi GĐ4 thêm chế độ từ vựng |
| Loại **Từ vựng** hoạt động thật: item `vocab`, form vocab, trắc nghiệm tự sinh, gõ từ, hai chiều, TTS, cloze | **GĐ4** (đã có sẵn trong kế hoạch) | Cần builder + khoá thẻ có `direction` |
| Learn, Match, Exam (thi thử có đồng hồ) | **GĐ5** | Như kế hoạch |
| Streak, heatmap, leech, Thư viện thư mục | **GĐ6** | Như kế hoạch |

Không cần trường JSON mới: `study-app.md` đã có `meta.kind` (`vocab` / `qa` / `quiz`) từ đầu, nhưng app chưa dùng nó để làm gì. GĐ3B biến nó thành **cơ chế phân loại thật sự**.

**Không làm trong 3B:** form vocab, trắc nghiệm tự sinh, gõ từ, TTS (GĐ4); Learn, Match, Exam (GĐ5); stats, streak, dark mode, Thư viện (GĐ6). Chế độ chưa có thì **không hiện nút** (không để nút "sắp có", trừ ô tạo bộ thẻ Từ vựng ở mục 2.4).

---

## 2. Mô hình dữ liệu

### 2.1 Ba loại bộ thẻ

| Bạn gọi | Giá trị lưu (`meta.kind`) | Nhãn trên giao diện | Dạng mục cho phép | Chế độ |
|---|---|---|---|---|
| Flashcard (chỉ card) | `qa` | **Thẻ ghi nhớ** | `card` | Ôn hôm nay (lật thẻ + SRS), Học tất cả |
| Exam (không card) | `quiz` | **Đề luyện thi** | `single`, `multi`, `fill`, `command` | Ôn hôm nay, Luyện tập; *Thi thử* (GĐ5) |
| Vocabulary (kiểu Quizlet) | `vocab` | **Từ vựng** | `vocab` (GĐ4) | Flashcards, Trắc nghiệm tự sinh, Gõ từ, Nghe–gõ, Cloze, hai chiều EN↔VI (GĐ4); Learn, Match (GĐ5) |

Giữ nguyên giá trị lưu `qa` / `quiz` / `vocab` (không phải di chuyển dữ liệu), chỉ đổi **nhãn hiển thị** sang tiếng Việt. Người dùng không bao giờ thấy chữ `qa`, `quiz`.

```json
{ "meta": { "id": "lpic-101", "title": "LPIC-1 101", "kind": "quiz",
            "lang": "vi", "description": "Câu hỏi luyện thi chủ đề 101" } }
```
- `meta.description`: tuỳ chọn, ≤ 200 ký tự, hiện trên thẻ bộ thẻ ở Home.
- `formatVersion` **giữ 1**: chỉ thêm trường tuỳ chọn; bộ thẻ cũ vẫn mở bình thường.

### 2.2 Quy tắc

1. **`kind` quyết định mặc định và chế độ, không xoá dữ liệu.** Mục lệch loại (vd mục `card` trong bộ `quiz`) **không bị xoá hay coi là lỗi**: Deck view hiện cảnh báo nhẹ "3 mục dạng Thẻ nằm trong bộ Đề luyện thi". *Ôn hôm nay* vẫn học mọi mục hợp lệ theo đúng dạng của từng mục; chỉ các chế độ riêng của loại (Thi thử, Flashcards thuần…) mới lọc theo dạng.
2. **Thiếu hoặc không hợp lệ `kind`** → suy ra bằng `inferKind(items)`: toàn `card` → `qa`; có mục `vocab` → `vocab`; còn lại → `quiz`. Không báo lỗi; giá trị suy ra được ghi vào file ở lần Lưu kế tiếp.
3. **Đổi loại** ở *Thông tin bộ thẻ* (Editor) hoặc menu ⋯ ở Home. Nếu có mục lệch loại với loại mới thì báo trước số mục lệch, không tự chuyển đổi mục.
4. **Editor theo loại**: nút *Thêm mục* mặc định đúng dạng của loại; thanh chọn dạng chỉ hiện các dạng được phép (cộng thêm dạng của mục đang chọn nếu nó lệch loại, để vẫn sửa được). Bộ `qa` chỉ có dạng `Thẻ`; bộ `quiz` bỏ dạng `Thẻ`.
5. **Hộp thoại "Bộ thẻ mới"**: chọn loại bằng 3 ô lớn (biểu tượng + tên + mô tả một dòng), rồi mới nhập tên. Ô **Từ vựng** tạm mờ kèm chú thích "Có ở bản sau" cho đến GĐ4 (parser vẫn đọc được `kind: "vocab"`).
6. Hàm thuần `core/deckkinds.js` (test được): `KINDS` (nhãn, mô tả, `allowedTypes`, `defaultType`, danh sách chế độ), `kindOf(deck)`, `inferKind(items)`, `allowedTypes(kind)`, `modesFor(kind)`, `mismatchedItems(deck)`.

---

## 3. Nguyên tắc giao diện (áp cho Home, Deck view, Session, Result, Settings)

- Dùng **chung** `tokens.css` + `controls.css` của Editor (cùng chiều cao control, focus ring, nút chính/phụ). Không tạo CSS riêng cho từng màn.
- **Không lộ kỹ thuật**: không đường dẫn file, không chữ `card` / `fill` / `quiz`, không "SRS", "Again". Dạng mục hiện bằng nhãn tiếng Việt: `Thẻ`, `Trắc nghiệm`, `Điền`, `Lệnh`.
- **Màu theo loại**: `--kind-qa` (xanh ngọc), `--kind-quiz` (chàm), `--kind-vocab` (hổ phách); luôn đi kèm biểu tượng và chữ, không chỉ dựa vào màu.
- Bố cục rộng rãi theo mục 0 của `study-app-phases.md` (full-width responsive, tối đa ~1400px).
- Mỗi màn có **trạng thái trống** có ích (hướng dẫn việc tiếp theo), không để khoảng trắng trơ trọi.

---

## 4. Home (quản lý bộ thẻ)

Hiện tại: một thẻ duy nhất, hiện đường dẫn file thô, chữ `quiz`, hai chip nhỏ "Đến hạn hôm nay: 0 / Thẻ mới: 5", hai nút "Ôn hôm nay" và "Học" khó phân biệt, phần còn lại trống.

```
STUDY APP                                [+ Bộ thẻ mới] [Mở file…] [Nhập… ▾] [Cài đặt]
Hôm nay
┌ Đến hạn ───┐ ┌ Thẻ mới còn lại ┐ ┌ Đã ôn hôm nay ┐
│     12     │ │       15        │ │       8       │
└────────────┘ └─────────────────┘ └───────────────┘
[Tất cả] [Thẻ ghi nhớ] [Đề luyện thi] [Từ vựng]     🔍 Tìm…   Sắp xếp: Cần ôn nhất ▾
┌ ▍Đề luyện thi ─────────────────────┐ ┌ ▍Thẻ ghi nhớ ─────────────────────┐
│ LPIC-1 101 — mẫu                ⋯ │ │ …                                  │
│ Câu hỏi luyện thi chủ đề 101      │ │                                    │
│ ▓▓▓▓▓░░░░░░  Mới 5 · Đang học 0   │ │                                    │
│               Đến hạn 0 · Đã thuộc 0                                     │
│ [ Ôn hôm nay · 5 ]  [Học ▾] [Sửa] │ │                                    │
└────────────────────────────────────┘ └────────────────────────────────────┘
```
- **Dải "Hôm nay"** (3 ô số): tổng thẻ đến hạn; thẻ mới còn lại trong hạn mức ngày; số câu đã ôn hôm nay (đếm từ `log`, theo ngày địa phương).
- **Lưới thẻ bộ thẻ** tự co giãn (`repeat(auto-fill, minmax(340px, 1fr))`). Mỗi thẻ: vạch/huy hiệu loại, tên, mô tả (nếu có), **thanh tiến độ xếp chồng** (Mới · Đang học · Đến hạn · Đã thuộc) kèm số, **một nút chính**.
- **Nút chính** theo trạng thái: `Ôn hôm nay · N` (N = đến hạn + mới trong hạn mức); khi N = 0 chuyển thành chữ phụ "Hôm nay đã xong ✓" (nút mờ) và `Học ▾` vẫn dùng được.
- `Học ▾` mở danh sách **chế độ của đúng loại** (`modesFor(kind)`), mỗi dòng có mô tả ngắn. Chỉ liệt kê chế độ đã làm.
- `⋯`: Hiện trong thư mục, Sao chép, Thông tin bộ thẻ (đổi loại, mô tả), Gỡ khỏi danh sách. **Đường dẫn file chỉ hiện ở tooltip / `Hiện trong thư mục`.**
- Lọc theo loại bằng chip, tìm theo tên, sắp xếp: *Cần ôn nhất* (nhiều thẻ đến hạn trước), *Vừa học gần đây*, *Tên A→Z*. "Vừa học gần đây" lấy từ thời điểm log mới nhất của bộ thẻ.
- **Trạng thái trống**: ba ô lớn "Tạo bộ thẻ mới" theo loại + nút *Mở file…* / *Nhập…*.
- Hàm thuần `core/deckstats.js`: `deckStats(deck, progress, settings, now)` → `{ new, learning, due, mastered, newLeftToday, lastStudied }`; test với `now` giả lập (nửa đêm Asia/Saigon).

---

## 5. Deck view

- Đầu trang: huy hiệu loại, tên, mô tả, 4 ô số (Mới, Đang học, Đến hạn, Đã thuộc), nút `Sửa bộ thẻ`.
- **Thẻ "Chế độ học"** theo loại (biểu tượng + mô tả + số mục áp dụng). Ví dụ `qa`: *Ôn hôm nay*, *Học tất cả*; `quiz`: *Ôn hôm nay*, *Luyện tập ngẫu nhiên*.
- Bảng mục: cột *Dạng* (nhãn), *Nội dung* (`toPlain`, tối đa 2 dòng), *Chủ đề*, *Nhãn*, *Trạng thái* (`Mới` / `Đang học` / `Ôn · đến hạn mai` / `Đến hạn`). Có tìm kiếm và lọc theo dạng / chủ đề / trạng thái. **Bấm một dòng** mở Editor tại đúng mục đó.
- Cảnh báo (mục lỗi bị bỏ qua, mục lệch loại, ảnh thiếu) gom trong một khối thu gọn, không chiếm chỗ mặc định.

---

## 6. Session (màn học)

Từ ảnh hiện tại, cần sửa:
- **Chip kỹ thuật** (`card`, `fill`) → nhãn tiếng Việt (`Thẻ`, `Điền`), chủ đề giữ nguyên.
- **Thanh tiến độ**: chia đoạn theo câu, câu đã trả lời tô xanh (đúng) / đỏ (sai), câu hiện tại viền nổi; hiện `Câu 5 / 9`. Thoát (`Esc`): chỉ hỏi khi đã trả lời ≥ 1 câu, nội dung hỏi "Tiến độ đã được lưu theo từng câu".
- **Thẻ lật**: trước khi lật chỉ có mặt trước và nút lớn `Hiện đáp án (Space)`; lật có hiệu ứng ngắn (~150 ms, tắt khi `prefers-reduced-motion`); sau khi lật, bốn nút chấm kèm thời gian dự kiến (tính bằng hàm xem trước của `srs.js`) và phím `1–4`. Chân trang có dòng gợi ý phím nhỏ.
- **Phản hồi câu Điền / Lệnh** (ảnh hiện tại ghi "SRS: Học lại / Again" và liệt kê đáp án bằng dấu `|`):
  - Hai cột: **Bạn trả lời** và **Đáp án đúng**; mỗi đáp án chấp nhận là một chip.
  - Câu sai: "Sẽ hỏi lại sau ~1 phút". Câu đúng: "Hỏi lại sau 4 ngày". Câu gần đúng: "Gần đúng — chú ý chính tả: …".
  - Khối *Giải thích* giữ như hiện tại.
- **Trắc nghiệm**: sau khi nộp, đáp án đúng tô xanh + ✓, lựa chọn sai đã chọn tô đỏ + ✗; không đổi thứ tự lựa chọn.
- **Màn Kết quả**: vòng tròn tỉ lệ đúng, thời gian, danh sách câu sai (bấm xem lại), thông báo "Thẻ kế tiếp đến hạn: ngày mai (5 thẻ)", nút `Học lại câu sai` và `Về trang chủ`.
- Học thử từ Editor (`persist:false`): hiện dải nhỏ "Học thử — không lưu tiến độ" ở đầu màn.

---

## 7. Nghiệm thu

- [ ] Mở bộ thẻ cũ không có `meta.kind` → nhận đúng loại suy ra, không báo lỗi; Lưu lại thì file có `meta.kind`.
- [ ] Tạo mới bằng ba ô loại: `Thẻ ghi nhớ` chỉ cho thêm mục dạng Thẻ; `Đề luyện thi` không có dạng Thẻ; `Từ vựng` mờ với chú thích.
- [ ] Bộ `quiz` chứa một mục `card`: Deck view có cảnh báo nhẹ, mục vẫn học được trong *Ôn hôm nay*, không bị xoá.
- [ ] Home: không còn đường dẫn file hay chữ `quiz`; dải "Hôm nay" và thanh tiến độ khớp `progress.json` (so với test `deckStats`); nút chính đổi thành "Hôm nay đã xong ✓" khi N = 0.
- [ ] `Học ▾` chỉ liệt kê chế độ đã có của loại đó; không có nút dẫn tới màn chưa làm.
- [ ] Session: không còn chữ `card` / `fill` / "SRS" / "Again"; thanh tiến độ chia đoạn có màu; thẻ lật có nút `Hiện đáp án`; phản hồi câu Điền hiện hai cột với chip đáp án.
- [ ] Học thử từ Editor vẫn không ghi `progress.json` và hiện dải "không lưu tiến độ".
- [ ] Ở 1920×1080 và 1280×720 không có thanh cuộn ngang; mọi nút/ô dùng chung style với Editor.
- [ ] Test xanh: `deckkinds` (`inferKind`, `allowedTypes`, `modesFor`, `mismatchedItems`), `deckstats` (đúng số mới/học/đến hạn/thuộc, hạn mức thẻ mới theo ngày địa phương), parser (thiếu `kind`, `kind` lạ).

---

## 8. Prompt giao việc (chia hai lượt)

Đính kèm **ba ảnh chụp hiện tại** (Home, câu Điền, thẻ lật) làm mốc "trước".

**Lượt 1 — phân loại bộ thẻ (dữ liệu + Editor + Home logic)**
```
@study-app.md @study-app-phases.md @study-app-editor-ux.md @study-app-phase3b.md

Bạn đang giúp tôi xây app Electron học tập theo study-app.md. Tuân thủ "Quy tắc chung cho AI"
ở mục 0 của study-app-phases.md. JavaScript thuần, KHÔNG React, KHÔNG TypeScript, KHÔNG bundler.

Việc cần làm: GIAI ĐOẠN 3B, LƯỢT 1 theo study-app-phase3b.md, mục 1, 2, và phần logic của mục 4
(core/deckstats.js).
Hiện trạng: GĐ1, 2, 2B, 2C, 3 đã xong. Đọc code hiện có trước, giữ nguyên và mở rộng.

Phạm vi lượt 1:
- core/deckkinds.js: KINDS, kindOf, inferKind, allowedTypes, modesFor, mismatchedItems.
- parser/validate: meta.kind tuỳ chọn (thiếu/lạ → inferKind, không báo lỗi); meta.description tuỳ chọn;
  cảnh báo nhẹ mục lệch loại (không bỏ qua mục). formatVersion giữ 1.
- Editor: hộp thoại Bộ thẻ mới chọn loại bằng 3 ô lớn (Từ vựng mờ "Có ở bản sau");
  nút Thêm mục và thanh chọn dạng theo allowedTypes; hộp thoại Thông tin bộ thẻ (tên, loại, mô tả)
  có cảnh báo khi đổi sang loại làm lệch mục; Lưu ghi meta.kind.
- core/deckstats.js: deckStats(deck, progress, settings, now) → {new, learning, due, mastered,
  newLeftToday, lastStudied}, nhận `now` làm tham số.
- Deck view và Home chỉ cần dùng dữ liệu mới ở mức tối thiểu để kiểm tra (làm lại giao diện ở lượt 2).
Chưa làm: giao diện mới của Home/Deck view/Session/Result (lượt 2), vocab thật (GĐ4), Exam/Match/Learn (GĐ5).
Viết test: deckkinds, deckstats (nửa đêm Asia/Saigon), parser (thiếu/lạ kind), deckmodel (newItem theo loại).
Chạy test và npm start trước khi báo xong. Liệt kê file đã tạo/sửa, cách chạy, việc chưa làm.
```

**Lượt 2 — làm lại giao diện** (phiên mới, sau khi commit lượt 1)
```
@study-app.md @study-app-phases.md @study-app-editor-ux.md @study-app-phase3b.md
(đính kèm ảnh chụp Home, câu Điền, thẻ lật hiện tại)

Bối cảnh như lượt 1. Việc cần làm: GIAI ĐOẠN 3B, LƯỢT 2 theo study-app-phase3b.md mục 3–6:
làm lại Home (dải Hôm nay, lưới thẻ bộ thẻ, thanh tiến độ xếp chồng, Học ▾ theo loại, lọc/tìm/sắp xếp,
trạng thái trống), Deck view (thẻ Chế độ học, bảng mục, bấm dòng mở Editor), Session (nhãn dạng tiếng Việt,
thanh tiến độ chia đoạn, thẻ lật có nút Hiện đáp án, phản hồi hai cột với chip đáp án, câu trắc nghiệm đánh dấu
đúng/sai, hạn chế thuật ngữ SRS), màn Kết quả, dải "Học thử — không lưu tiến độ".
Dùng chung tokens.css/controls.css của Editor; không tạo CSS riêng cho từng màn.
Không thêm chế độ học mới; chế độ chưa có thì không hiện nút.
Đọc code lượt 1 và các màn hiện có trước, giữ nguyên logic SRS/progress.
Chạy test và npm start; kiểm ở 1920×1080 và 1280×720.
Liệt kê file đã tạo/sửa, cách chạy, việc chưa làm.
```

**Sau khi xong:** thêm dòng `3B — Phân loại bộ thẻ & giao diện học/quản lý` vào bảng "Tổng quan các giai đoạn" của `study-app-phases.md` (chèn giữa 3 và 4), và trong GĐ4/GĐ5 ghi thêm "dựa vào `meta.kind`, xem `study-app-phase3b.md`".

**Gợi ý model:** lượt 1 (logic thuần + Editor) dùng Sonnet 5.5 mức Medium; lượt 2 (giao diện) cũng Sonnet 5.5, nên đính kèm ảnh để có mốc so sánh.
