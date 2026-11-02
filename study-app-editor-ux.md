# Deck Editor — thiết kế lại giao diện (UX v2)

File này **thay thế** mục 2.7 và mục 9.3 của `study-app.md`, đồng thời là phạm vi của giai đoạn **2C-fix** (làm lại giao diện Editor, thay cho bản đầu của GĐ2C). Mọi thứ khác **không đổi**: định dạng `.sdeck`, `deck.json`, `validate.js`, IPC ở main, `richtext.js`, `asset://`. `deckmodel.js` chỉ thêm vài hàm thuần (mục 13.3).

**Mục tiêu:** soạn nhanh hơn, ít sai hơn, ít phải suy nghĩ. Người dùng soạn 50 câu trắc nghiệm có công thức phải làm được gần như chỉ bằng bàn phím, không thấy chuỗi LaTeX thô, không thấy đường dẫn ảnh, không thấy lỗi đỏ khi chưa làm gì sai.

Ràng buộc kỹ thuật giữ nguyên: JavaScript thuần, không React, không TypeScript, không bundler.

---

## 1. Vấn đề của bản hiện tại (từ ảnh chụp màn hình)

| # | Hiện tượng | Nguyên nhân | Sửa ở |
|---|---|---|---|
| 1 | Xem trước hiện `\inftyx^{2}\sum_{i=1}^{n}\neq\pm\sqrt{x}fwfwfw` dính liền, không ra công thức | Bảng ký hiệu chèn LaTeX trần, không bọc `$…$`, không ngăn cách | §7.2 |
| 2 | Bảng ký hiệu mở ngay trong form, đẩy/che ô câu hỏi; nút ghi chữ ("Phân số", "Căn") chứ không phải ký hiệu | Panel nội tuyến chiếm chỗ | §7.2 |
| 3 | Mục mới tinh đã hiện 2 khung lỗi đỏ lớn | Validate chạy cả khi người dùng chưa chạm vào | §9 |
| 4 | Ô nhập đường dẫn `img/ten-anh.png` | Lộ chi tiết nội bộ, trái nguyên tắc "người dùng không đụng đường dẫn/JSON" | §8 |
| 5 | Nhãn lẫn tiếng Anh `(question)`, `(explanation tuỳ chọn)`, `(image)`, `(answerImage)`; hiện `ID: q-001` | Lộ tên trường | §6.1 |
| 6 | Ô lựa chọn rộng ~200px trong khung ~520px, chỉ 1 dòng; nút ảnh chỉ có icon | Bố cục cứng | §6.2 |
| 7 | Form dài: ảnh đề, ảnh đáp án, giải thích luôn mở dù ít dùng | Không ẩn trường tuỳ chọn | §6.1 |
| 8 | Hai thanh cuộn (cửa sổ + vùng form), lề trái/phải rất rộng, vùng xem trước bị thanh cuộn ngang vì công thức dài | Trang cuộn thay vì khung ứng dụng cố định | §3, §10 |
| 9 | Control không đồng nhất: select to, ô tìm kiếm nhỏ viền khác, ô lựa chọn focus viền xanh lá | Dùng style mặc định trình duyệt | §12 |
| 10 | Mỗi dòng danh sách có checkbox thường trực; tiêu đề bị cắt; mục trống hiện chữ "X" | Danh sách dày đặc, không phân cấp | §5 |
| 11 | Phải chọn trước "1 đáp án" hay "nhiều đáp án" | Lộ khái niệm kỹ thuật | §6.2 |
| 12 | Banner "Chưa hoàn chỉnh" nhồi vào tiêu đề xem trước làm tiêu đề xuống dòng | Cảnh báo đặt sai chỗ | §10 |

---

## 2. Nguyên tắc thiết kế

1. **Không lộ kỹ thuật**: không id, không đường dẫn ảnh, không tên trường tiếng Anh, không JSON. Chỉ tiếng Việt.
2. **Hiện dần**: chỉ hiện trường cần ngay; trường tuỳ chọn thu gọn thành nút "+ Thêm …".
3. **Lỗi đúng lúc**: không báo lỗi trước khi người dùng có cơ hội làm; lỗi ngắn, chỉ cách sửa.
4. **Hành vi dự đoán được**: bấm chèn công thức thì luôn ra một công thức đúng.
5. **Bàn phím trước**: mọi thao tác hay dùng có phím tắt; luồng chính: gõ → Enter/Tab → `Ctrl+Enter` (mục mới).
6. **Thấy ngay**: xem trước cập nhật khi gõ, giống hệt lúc học.
7. **Không mất việc**: Undo toàn cục; xoá thì có "Hoàn tác" thay vì hộp thoại hỏi; cảnh báo khi thoát lúc chưa lưu.
8. **Nhất quán**: một bộ token, một bộ control (mục 12).

---

## 3. Bố cục tổng thể

```
┌────────────────────────────────────────────────────────────────────────────────┐
│ ←  Giải tích 1 ✎     Đã lưu 16:42          ▶ Học thử   ↶  ↷   [ Lưu ▾ ]       │  56px
├──────────────┬─┬───────────────────────────────────────────────┬─┬─────────────┤
│ 🔍 Tìm…      │ │ ◀ Mục 3/12 ▶    ⚠ 1 vấn đề            ⋮       │ │ Xem trước   │
│ [Dạng▾][Chủ đề▾]│ │ [ Trắc nghiệm | Điền | Lệnh | Thẻ ]            │ │ [Đề | Đáp án]│
│ [Nhãn▾] [⚠ 2]│ │                                               │ │             │
│──────────────│ │ Câu hỏi                                       │ │ (giống hệt  │
│▍TN Tính ∫₀¹… │ │ ┌ B I </> ƒx 🖼 ──────────────────────────┐   │ │  lúc học,   │
│▍TN Chọn HAI…⚠│ │ │ ô soạn tự giãn chiều cao                │   │ │  bấm chọn   │
│▍ĐI Trên hệ…  │ │ └──────────────────────────────────────────┘   │ │  được)      │
│▍LỆ Liệt kê…  │ │ Các lựa chọn · bấm ✓ ở đáp án đúng            │ │             │
│▍TH inode là… │ │  ⠿ [✓A] [ ........................ ] 🖼 ✕    │ │ [Chấm thử]  │
│              │ │  ⠿ [ B] [ ........................ ] 🖼 ✕    │ │             │
│              │ │  + Thêm lựa chọn                              │ │             │
│              │ │ [+ Giải thích][+ Ảnh đề][+ Ảnh đáp án][+ Chủ đề/Nhãn]│ │             │
│[+ Thêm mục ▾]│ │                                               │ │             │
│12 mục · 2 ⚠ │ │                                               │ │             │
└──────────────┴─┴───────────────────────────────────────────────┴─┴─────────────┘
```

Quy tắc:
- **Khung ứng dụng cố định** (`height: 100vh`, không cuộn cả trang). Mỗi vùng tự cuộn (`min-height: 0; overflow: auto`). Thanh trên và thanh công cụ của ô soạn dính (sticky). Không bao giờ có hai thanh cuộn lồng nhau.
- **Không giới hạn max-width toàn cục** (hết lề rộng hai bên). Riêng nội dung cột Soạn tối đa 760px, căn giữa trong cột.
- **Độ rộng**: Danh sách 260px (kéo 200–400), Soạn co giãn (tối thiểu 480), Xem trước 400px (kéo 320–640, thu gọn bằng nút hoặc `Ctrl+\`). Splitter 6px, nhớ độ rộng trong `settings.json`.
- **Cửa sổ hẹp**: dưới 1200px, Xem trước thành tab `[Soạn | Xem trước]` ở đầu cột Soạn; dưới 900px, Danh sách thành ngăn kéo (nút ☰).

---

## 4. Thanh trên

- `←` quay về (nếu chưa lưu: hỏi *Lưu / Không lưu / Ở lại*).
- Tên bộ thẻ: chữ thường, hiện biểu tượng ✎ khi rê chuột; bấm để sửa tại chỗ.
- Trạng thái ngay cạnh tên: `Đã lưu 16:42` (xám) hoặc `● Chưa lưu` (cam). Không đặt ở giữa thanh.
- `▶ Học thử`: mở phiên học nhanh bằng bộ thẻ **đang soạn trong bộ nhớ** (chưa cần lưu); mục không hợp lệ bị bỏ qua như khi học thật.
- `↶ ↷`: nút icon (tooltip có phím tắt), mờ khi không dùng được.
- `[Lưu ▾]`: nút chính; menu: *Lưu thành bản sao…*, *Xuất bản sao…*, *Thông tin bộ thẻ* (tên, loại, ngôn ngữ), *Quản lý ảnh*.
- Toast góc dưới: "Đã lưu." hoặc "Đã lưu. 2 mục chưa hoàn chỉnh sẽ bị bỏ qua khi học · **Xem**". Xoá mục: "Đã xoá 1 mục · **Hoàn tác**" (5 giây), không hỏi xác nhận. Chỉ hỏi xác nhận khi xoá từ 5 mục trở lên.

---

## 5. Danh sách mục (cột trái)

**Hàng mục** (cao ~56px, tối đa 2 dòng tiêu đề):
```
▍[TN]  Tính ∫₀¹ x² dx (xem đồ thị)…        ●
       Giải tích · tích phân
```
- Vạch màu trái + huy hiệu chữ theo dạng (`TN`, `ĐIỀN`, `LỆNH`, `THẺ`); không chỉ dựa vào màu.
- Tiêu đề = `toPlain()` của câu hỏi/mặt trước/term (công thức hiện dạng rút gọn); trống thì "*(Chưa có nội dung)*" chữ nghiêng, xám — **không** dùng "X".
- Chấm trạng thái bên phải: đỏ = có lỗi, cam = cảnh báo, **không có chấm = ổn**. Mục mới chưa nhập gì: chấm xám nhạt "mới" (xem §9).
- Tay kéo `⠿` và checkbox chỉ hiện khi rê chuột / khi đang ở chế độ chọn.
- Chọn nhiều: `Ctrl/Shift + bấm`, hoặc nút "Chọn" bật chế độ chọn. Khi có chọn, thanh dưới đổi thành: `Đã chọn 3 · Gán chủ đề · Gán nhãn · Xoá · Bỏ chọn`.
- Chuột phải: Nhân đôi, Xoá, Chuyển dạng, Chuyển lên đầu/cuối.

**Tìm và lọc**: một ô tìm kiếm + hàng chip `[Dạng ▾] [Chủ đề ▾] [Nhãn ▾] [⚠ Chưa hoàn chỉnh (2)]`; mỗi chip mở popover nhỏ có checkbox. Chip đang lọc được tô màu và có `✕`. Bỏ dấu tiếng Việt khi tìm.

**Thêm mục**: nút chính `+ Thêm mục` thêm ngay một mục **cùng dạng, cùng chủ đề, cùng nhãn** với mục đang chọn (soạn hàng loạt không phải chọn lại); mũi tên `▾` bên cạnh chọn dạng khác. Mục mới được chọn sẵn và con trỏ vào ô câu hỏi.

**Sắp xếp**: kéo thả (có vạch chỉ vị trí thả) hoặc `Alt+Shift+↑/↓`.

**Chân danh sách**: `12 mục · 2 ⚠` và nút `Ảnh (3)` mở trình quản lý ảnh.

**Hiệu năng**: danh sách "ảo hoá" (chỉ dựng các hàng nhìn thấy) để bộ 1000 mục vẫn mượt; cập nhật một hàng khi mục đó đổi, không dựng lại cả danh sách.

---

## 6. Form soạn (cột giữa)

### 6.1 Phần chung

Đầu cột: `◀ Mục 3/12 ▶` (chuyển mục; phím `Alt+↑/↓`), chip `⚠ 1 vấn đề` (mục 9), menu `⋮` (Nhân đôi, Xoá, *Thông tin kỹ thuật* — nơi duy nhất hiện `id`, thu gọn mặc định).

**Chọn dạng** bằng thanh phân đoạn 4 nút: `Trắc nghiệm | Điền | Lệnh | Thẻ`.
- `Trắc nghiệm` gộp `single` và `multi`: app tự đặt `type` theo số đáp án đúng đã tích (đúng 1 → `single`, từ 2 → `multi`). Người dùng không phải biết khác biệt.
- Đổi dạng gọi `deckmodel.changeType`, giữ phần dữ liệu giữ được; nếu mất dữ liệu thì toast "Đã đổi dạng · Hoàn tác".

**Thứ tự trường**: Câu hỏi → phần riêng theo dạng → hàng chip **"Thêm"**.

**Trường tuỳ chọn thu gọn**: `+ Giải thích`, `+ Ảnh kèm đề`, `+ Ảnh kèm đáp án`, `+ Chủ đề`, `+ Nhãn`. Bấm chip thì mở trường và đưa con trỏ vào; trường đã có nội dung thì luôn hiện (chip biến mất). Chủ đề/Nhãn là ô gợi ý (combobox) từ các giá trị đã dùng trong bộ thẻ; nhãn nhập kiểu chip (Enter/dấu phẩy để thêm).

**Nhãn tiếng Việt**: "Câu hỏi", "Các lựa chọn", "Đáp án chấp nhận", "Cách chấm", "Giải thích", "Ảnh kèm đề", "Ảnh kèm đáp án", "Chủ đề", "Nhãn", "Mặt trước", "Mặt sau". Tuyệt đối không hiện `question`, `answerImage`, `match`…

### 6.2 Trắc nghiệm

Mỗi lựa chọn là một hàng:
```
⠿  [ A ]  [ ô soạn tự giãn, hỗ trợ Markdown/LaTeX ............ ]  [🖼]  ✕
```
- Nút tròn chữ cái `A B C D…` là **nút đáp án đúng**: bấm để bật/tắt, đúng thì tô xanh kèm dấu ✓ (không dùng radio/checkbox nhỏ). Có thể bật nhiều. Dòng trạng thái dưới nhãn: "Một đáp án đúng" / "Nhiều đáp án đúng — người học chọn 2".
- Ô soạn chiếm hết chiều rộng còn lại, tự giãn nhiều dòng; khi focus hiện thanh công cụ gọn `B I ƒx 🖼`.
- Nút ảnh: chưa có ảnh thì icon; có ảnh thì hiện thumbnail 28px (bấm để thay/xoá). `✕` xoá lựa chọn, chỉ hiện khi rê chuột/focus.
- Mục mới có sẵn **4 lựa chọn trống**.
- **Phím**: `Enter` trong lựa chọn → thêm lựa chọn mới bên dưới và focus (`Shift+Enter` xuống dòng); `Backspace` ở lựa chọn rỗng → xoá nó và focus lựa chọn trước; `Ctrl+Enter` vẫn là "mục mới".
- **Dán thông minh**: dán nhiều dòng vào một lựa chọn → tách thành nhiều lựa chọn. Tự bỏ tiền tố `A.`, `A)`, `1.`, `-`, `*`; dòng bắt đầu `[x]` hoặc có dấu `*` đầu dòng được tích đúng (hàm thuần `splitPastedChoices`, mục 13.3).
- **Chuẩn hoá khi rời mục**: các lựa chọn trống nằm cuối danh sách bị bỏ lặng lẽ (4 ô mặc định không để lại lỗi "trống").

### 6.3 Điền / Lệnh

- **Đáp án chấp nhận**: danh sách chip nhập nhanh (`Enter` thêm, `Backspace` xoá chip cuối); dán nhiều dòng thành nhiều chip.
- **Cách chấm**: thanh phân đoạn có mô tả, không hiện tên kỹ thuật:
  `Thường (bỏ qua hoa/thường, khoảng trắng)` · `Chính xác` · `Số` · `Công thức LaTeX` · `Regex (nâng cao)`.
  `Số` hiện thêm ô "Sai số cho phép" (mặc định 0). `Regex` hiện ô ghi chú ngắn và báo lỗi cú pháp ngay khi gõ. Dạng `Lệnh` mặc định `Thường`.
- **Thử đáp án**: một ô nhập ngay dưới; gõ đến đâu hiện kết quả đến đó `✓ Đúng` / `≈ Gần đúng` / `✗ Sai`, chạy đúng `grader` của app.
- `Cách hiển thị đáp án` (`answerDisplay`) nằm trong chip "+ Hiển thị đáp án đẹp" (chỉ hiện khi cần công thức đẹp).

### 6.4 Thẻ

Hai khối trực quan như hai mặt thẻ: **Mặt trước** và **Mặt sau**, mỗi khối có ô Markdown và một ô ảnh kèm (§8).

---

## 7. Ô soạn Markdown và công thức

### 7.1 Ô soạn
- `textarea` tự giãn chiều cao (tối thiểu 3 dòng, tối đa ~60% chiều cao cột rồi cuộn trong ô).
- Thanh công cụ dính trên ô: `B` · `I` · `</>` · `ƒx` (công thức) · `🖼`. Mỗi nút có tooltip kèm phím tắt. Bỏ các nút `$` và `$$` rời rạc; hai chế độ đó nằm trong menu của `ƒx` (*Trong dòng* / *Khối riêng*).
- Gõ `$` tự thêm `$` đóng và đặt con trỏ giữa; gõ `$` khi con trỏ đang ngay trước `$` đóng thì nhảy qua. Gõ `$$` rồi `Enter` → khối công thức nhiều dòng.
- `Ctrl+B` đậm, `Ctrl+I` nghiêng, `Ctrl+M` công thức trong dòng, `Ctrl+Shift+M` công thức khối.

### 7.2 Chèn công thức thông minh (sửa lỗi #1, #2)

**Popover, không phải panel nội tuyến.** Mở bằng nút `ƒx` hoặc `Ctrl+M`. Neo dưới nút, cỡ ~360×340, đóng bằng `Esc`/bấm ra ngoài, **không đẩy** nội dung bên dưới.

Nội dung popover:
- Ô tìm kiếm ("phân số", "alpha", "tích phân"; bỏ dấu tiếng Việt khi khớp).
- Tab: `Thường dùng` · `Hy Lạp` · `So sánh` · `Mũi tên` · `Hàm & giới hạn` · `Ma trận`.
- Mỗi nút hiển thị **công thức đã render bằng KaTeX** (không ghi chữ); tooltip: tên + mã LaTeX.
- Hàng "Dùng gần đây" (8 mục, lưu trong settings).
- Bấm một nút = chèn và **giữ popover mở** để chèn tiếp; `Esc`/`Enter` đóng và trả con trỏ về ô soạn.
- Cuối popover: **"Soạn công thức riêng"** — ô LaTeX nhiều dòng + vùng render trực tiếp + nút `Chèn` (`Ctrl+Enter`). Nếu con trỏ đang nằm trong một công thức có sẵn, popover mở với chính công thức đó để **sửa tại chỗ**.

**Quy tắc chèn** (hàm thuần `insertFormula`, test được):
1. Con trỏ đang **trong** `$…$` hoặc `$$…$$` → chèn mã trần tại con trỏ.
2. Con trỏ **ngoài** công thức → tự bọc `$…$` (hoặc `$$` + xuống dòng + `$$` nếu chọn *Khối riêng*).
3. Đang bôi đen chữ → chữ đó được đưa vào ô trống đầu tiên của mẫu (bôi `x+1` rồi bấm phân số → `\frac{x+1}{▢}`).
4. Tự thêm khoảng trắng trước `$` mở nếu ký tự liền trước là chữ/số. (Theo tài liệu của `marked-katex-extension`, mặc định `$` chỉ được coi là mở công thức khi đứng sau khoảng trắng/dấu câu — kiểm bằng test, xem tuỳ chọn `nonStandard`.)
5. Mẫu có **ô trống `▢`**: sau khi chèn, chọn sẵn `▢` đầu tiên để gõ ngay; `Tab` nhảy sang `▢` kế tiếp trong cùng công thức; hết `▢` thì con trỏ ra sau công thức.
6. Mọi chèn đi qua state → history (§13.2), **không** dùng undo gốc của textarea.
7. Còn sót `▢` khi rời mục → `warn` "Công thức còn ô trống".

```js
// src/core/mathinput.js — hàm thuần, kiểm bằng node --test
// Trả về null (ngoài công thức) | 'inline' | 'block' tại vị trí pos.
export function mathContext(text, pos) {
  let mode = null;
  for (let i = 0; i < pos; i++) {
    const c = text[i];
    if (c === '\\') { i++; continue; }              // \$ không phải dấu công thức
    if (c !== '$') continue;
    if (text[i + 1] === '$' && i + 1 < pos) {       // $$
      mode = mode === 'block' ? null : mode === null ? 'block' : mode;
      i++;
    } else {                                        // $
      mode = mode === 'inline' ? null : mode === null ? 'inline' : mode;
    }
  }
  return mode;
}
// Giới hạn đã biết: chưa bỏ qua `$` trong code span/code block (cải tiến sau).
```

Danh mục ký hiệu là dữ liệu thuần để thêm bớt dễ (đây là mã nguồn JS, nên `\\` là bình thường):
```js
// src/core/snippets.js
export const SNIPPETS = [
  { id: 'frac',  tab: 'Thường dùng', latex: '\\frac{▢}{▢}',           name: 'Phân số',  kw: ['phan so', 'fraction'] },
  { id: 'sqrt',  tab: 'Thường dùng', latex: '\\sqrt{▢}',              name: 'Căn',      kw: ['can', 'sqrt'] },
  { id: 'pow',   tab: 'Thường dùng', latex: '^{▢}',                   name: 'Mũ',       kw: ['mu', 'luy thua'] },
  { id: 'sub',   tab: 'Thường dùng', latex: '_{▢}',                   name: 'Chỉ số',   kw: ['chi so'] },
  { id: 'int',   tab: 'Hàm & giới hạn', latex: '\\int_{▢}^{▢} ▢\\,dx', name: 'Tích phân', kw: ['tich phan'] },
  { id: 'sum',   tab: 'Hàm & giới hạn', latex: '\\sum_{i=1}^{▢}',      name: 'Tổng',     kw: ['tong', 'sigma'] },
  { id: 'lim',   tab: 'Hàm & giới hạn', latex: '\\lim_{x \\to ▢}',     name: 'Giới hạn', kw: ['gioi han'] },
  { id: 'inf',   tab: 'Thường dùng', latex: '\\infty',                name: 'Vô cực',   kw: ['vo cuc', 'infinity'] },
  // … Hy Lạp, so sánh (≤ ≥ ≠ ≈ ∈ ⊂), mũi tên, ma trận
];
```

**Giai đoạn sau (không làm trong 2C-fix):** thay ô soạn bằng CodeMirror 6 (live preview công thức tại chỗ, gập đường dẫn ảnh dài) và/hoặc MathLive (soạn công thức trực quan không cần biết LaTeX). Thiết kế hiện tại không cản việc đó.

---

## 8. Ảnh (sửa lỗi #4)

Không còn ô nhập đường dẫn. Mỗi trường ảnh là một **ô ảnh**:
- Trống: khung nét đứt "Kéo ảnh vào, dán (`Ctrl+V`) hoặc bấm để chọn".
- Có ảnh: thumbnail ~96px + dung lượng + `Thay` · `Xoá` + ô **Mô tả ảnh** (alt; thiếu thì `warn`).
- Trong ô Markdown: nút `🖼` (hoặc dán/kéo thả) chèn `![mô tả](img/…)` và **bôi đen sẵn phần "mô tả"** để gõ đè.
- `Ctrl+V` có ảnh trong clipboard: đang focus ô Markdown → chèn vào vị trí con trỏ; đang focus ô ảnh → đặt làm ảnh của ô đó; ở nơi khác → bỏ qua.
- **Trình quản lý ảnh** (nút `Ảnh (N)` ở chân danh sách hoặc menu Lưu): hộp thoại lưới thumbnail, tên rút gọn, dung lượng, "dùng ở N mục" (bấm để nhảy tới mục), nút `Xoá ảnh không dùng (n)`.
- Giữ nguyên ở main: kiểm ảnh thật, ≤ 5 MB, đặt tên theo hash, cùng ảnh thêm nhiều lần chỉ lưu một bản.

---

## 9. Kiểm tra lỗi (sửa lỗi #3)

Ba trạng thái của một mục: **mới** (chưa chạm) → **đang soạn** → **đã kiểm**.

- Mục mới tinh, chưa nhập gì: **không** hiện lỗi; ở danh sách chỉ có chấm xám nhạt.
- Lỗi của một trường hiện khi người dùng **rời ô đó** (blur) hoặc khi bấm *Lưu* / *Học thử* (lúc đó coi mọi trường đã chạm).
- Hiển thị lỗi: một dòng chữ nhỏ (12px) dưới ô, có icon, màu `--c-danger`/`--c-warn`; ô viền đỏ/cam. **Không** dùng khối đỏ lớn cạnh ô.
- Câu chữ ngắn, bảo cách sửa, tiếng Việt thường:
  `Chưa chọn đáp án đúng.` · `Lựa chọn B đang trống.` · `Hai lựa chọn trùng nhau (A và C).` · `Regex không hợp lệ: …` · `Không đọc được số "1,2,3".` · `Ảnh chưa có mô tả.` · `Công thức còn ô trống.`
- Chip đầu form `⚠ 2 vấn đề` mở popover liệt kê, bấm một dòng thì nhảy và focus đúng ô.
- Danh sách: chấm đỏ (có lỗi) / cam (cảnh báo); mục ổn thì không có dấu gì (không nhiễu bằng dấu ✓ xanh).
- Cho phép lưu mục chưa hoàn chỉnh; toast sau khi lưu báo số mục bị bỏ qua khi học (§4). `validate.js` giữ nguyên quy tắc, chỉ thêm quy tắc `▢` còn sót.

---

## 10. Xem trước (cột phải) (sửa lỗi #8, #12)

- Dùng **đúng** component của session + `richtext.js` (không có bộ render riêng).
- Tiêu đề gọn, một dòng: `Xem trước` + thanh phân đoạn `[Đề | Đáp án]`.
  `Đề` = như lúc học trước khi trả lời; người dùng bấm chọn thử được, nhấn `Chấm thử` để xem đúng/sai + giải thích (có nút `Làm lại`). `Đáp án` = trạng thái sau khi trả lời (đáp án đúng + giải thích).
- Mục chưa hợp lệ vẫn dựng bản xem trước tốt nhất có thể: lựa chọn trống là khung nét đứt "(lựa chọn trống)". Cảnh báo là **một dòng ghi chú xám ở cuối vùng**: "Mục này sẽ bị bỏ qua khi học vì: …" — không đặt trong tiêu đề.
- Cột không bao giờ có thanh cuộn ngang. Chỉ **khối công thức** (`.katex-display`) tự cuộn ngang trong chính nó; chữ thường `overflow-wrap: anywhere`.
- Cập nhật debounce ~120 ms, giữ nguyên vị trí cuộn; công thức sai cú pháp hiện mã đỏ (đã có từ 2B).
- Có thể thu gọn cột này (`Ctrl+\`); nhớ trạng thái.

---

## 11. Phím tắt

| Phím | Tác vụ |
|---|---|
| `Ctrl+S` | Lưu |
| `Ctrl+Z` / `Ctrl+Y` (hoặc `Ctrl+Shift+Z`) | Hoàn tác / làm lại (toàn cục, §13.2) |
| `Ctrl+Enter` | Thêm mục mới (cùng dạng/chủ đề/nhãn), focus ô câu hỏi |
| `Ctrl+D` | Nhân đôi mục |
| `Alt+↑` / `Alt+↓` | Mục trước / mục sau |
| `Alt+Shift+↑/↓` | Dời mục lên/xuống (khi focus danh sách) |
| `Delete` (focus danh sách) | Xoá mục đã chọn (có Hoàn tác) |
| `Ctrl+F` | Tìm trong danh sách |
| `Ctrl+B` / `Ctrl+I` | Đậm / nghiêng |
| `Ctrl+M` / `Ctrl+Shift+M` | Công thức trong dòng / khối |
| `Tab` (trong công thức vừa chèn) | Nhảy sang ô trống `▢` kế tiếp |
| `Enter` / `Backspace` rỗng (ô lựa chọn) | Thêm lựa chọn / xoá lựa chọn |
| `Ctrl+\` | Ẩn/hiện Xem trước |
| `Ctrl+/` | Bảng phím tắt |

---

## 12. Design tokens và control (sửa lỗi #9)

Tạo `src/styles/tokens.css` (biến CSS, có bản dark qua `[data-theme="dark"]`) và `src/styles/controls.css` (control dùng chung); mọi view chỉ dùng biến, không viết màu/cỡ rời.

```css
:root {
  --space-1: 4px; --space-2: 8px; --space-3: 12px; --space-4: 16px; --space-6: 24px;
  --radius: 8px;
  --control-h: 36px; --control-h-sm: 28px;
  --fs-sm: 13px; --fs: 14px; --fs-lg: 16px;
  --c-bg; --c-surface; --c-surface-2; --c-border; --c-text; --c-text-muted;
  --c-primary; --c-primary-soft; --c-danger; --c-warn; --c-ok;   /* một màu nhấn duy nhất */
  --focus-ring: 0 0 0 3px color-mix(in srgb, var(--c-primary) 35%, transparent);
}
input, select, textarea, button { font: inherit; color: inherit; }
```
(Giá trị màu cụ thể do AI chọn, miễn đạt tương phản đọc rõ ở cả sáng/tối.)

Quy tắc control:
- `input`, `select`, `textarea`, nút: cùng chiều cao (`--control-h`, nhỏ `--control-h-sm`), cùng viền và bo góc; **một** kiểu focus (`--focus-ring`, màu primary) cho mọi ô — hết viền xanh lá.
- `select` dùng `appearance: none` + mũi tên tự vẽ; ô tìm kiếm có icon SVG, không dùng emoji mặc định.
- Nút icon: vùng bấm ≥ 32px, có tooltip kèm phím tắt, trạng thái hover/active/disabled rõ.
- Nút chính (Lưu, Thêm mục): một kiểu duy nhất, tô màu primary; nút phụ: viền; nút nguy hiểm: chỉ đỏ khi hover.
- Chữ mô tả/nhãn trường 13px, màu `--c-text-muted`; tiêu đề cột 12px in hoa nhẹ, không xuống dòng (`white-space: nowrap`).

---

## 13. Kỹ thuật (JS thuần)

### 13.1 Cấu trúc file & Phân tách trách nhiệm (Modular Architecture)
Được tổ chức theo **Nguyên lý Trách nhiệm Duy nhất (Single Responsibility Principle - SRP)**, loại bỏ hoàn toàn mô hình "God Object" nguyên khối:
```
src/views/editor/
├── index.js            # Orchestrator (Composition Root: khởi tạo state, services, UI managers, actions, pane hooks)
├── editor.js           # Re-export renderEditor từ index.js (bảo toàn 100% tương thích ngược với router/app.js)
├── state.js            # Quản lý toàn bộ trạng thái (State Store: history, activeId, dirty, layout widths, touched items/fields)
├── actions.js          # Các hành động nghiệp vụ (Business Logic: thêm/xoá/nhân đôi mục, chuyển dạng, lưu, undo/redo, v.v.)
├── services.js         # Giao tiếp API (window.api wrapper: nạp/lưu layout, nạp/tải ảnh, lưu deck)
├── shortcuts.js        # Xử lý phím tắt và sự kiện toàn cục (Ctrl+S, Ctrl+Z, Ctrl+Enter, v.v.)
├── list.js             # Cột danh sách mục (ảo hoá, lọc, kéo thả, chọn nhiều)
├── form.js             # Cột soạn thảo (form chung, header điều hướng, chip lỗi)
├── preview.js          # Cột xem trước thời gian thực (bọc component session)
├── bulkimport.js       # Hộp thoại Nhập hàng loạt (CSV/TSV/Quizlet/Markdown)
├── imagemanager.js     # Hộp thoại Quản lý ảnh
├── mathpopover.js      # Popover chèn & sửa công thức toán KaTeX
├── fields/             # Các trường soạn thảo chuyên biệt:
│   ├── mdfield.js      # Ô Markdown tự giãn, auto-pair $, toolbar, con trỏ
│   ├── choices.js      # Lựa chọn trắc nghiệm (tự suy single/multi, kéo thả, dán thông minh)
│   ├── chips.js        # Nhập danh sách chip (nhãn, từ đồng nghĩa)
│   ├── imageslot.js    # Khung chọn & thumbnail ảnh
│   └── graderbox.js    # Hộp chấm điểm điền/lệnh (dung sai, regex, thử đáp án)
└── ui/                 # Các thành phần giao diện con:
    ├── toast.js        # Hệ thống thông báo Toast (thông báo đã lưu, hoàn tác xoá)
    ├── modals.js       # Quản lý & hiển thị các hộp thoại (chưa lưu, xác nhận xoá, bulk input, meta, phím tắt)
    ├── topbar.js       # Render thanh công cụ trên cùng Topbar
    └── layout.js       # Bố cục 3 cột, Splitter kéo thả, responsive
src/core/
├── mathinput.js       # mathContext, insertFormula, jumpToNextPlaceholder (thuần)
├── snippets.js        # danh mục ký hiệu
└── deckmodel.js       # thêm hàm ở 13.3
src/styles/tokens.css, controls.css, editor.css
```

**Nguyên tắc thiết kế & mở rộng (áp dụng cho Giai đoạn 5 và tương lai):**
- **State (`state.js`)**: Quản lý tập trung mọi trạng thái runtime của phiên soạn thảo; không chứa logic thao tác DOM. Cung cấp API cập nhật an toàn (`updateItemWithoutHistory`, `pushHistory`, `markClean`, v.v.).
- **Actions (`actions.js`)**: Chứa toàn bộ business logic. Được inject `state`, `services`, `ui`, `modals`, `panes`, `appActions`. Không gọi trực tiếp `window.api` hay tạo DOM phức tạp; nhờ đó kiểm thử đơn vị độc lập không cần môi trường Electron/DOM.
- **Services (`services.js`)**: Wrapper duy nhất giao tiếp `window.api` (I/O, IPC), cho phép dễ dàng mock khi test.
- **Modals (`ui/modals.js`)**: Quản lý tập trung các hộp thoại popup của Editor (Meta, Xác nhận xoá, Phím tắt, Unsaved changes, v.v.). Khi GĐ 5 cần thêm modal mới, mở rộng tại đây thay vì nhồi vào view chính.
- **Shortcuts (`shortcuts.js`)**: Bắt phím tắt tập trung và trả về hàm `cleanup()` dọn dẹp khi unmount.
- **Orchestrator (`index.js`)**: File điều phối trung tâm cực kỳ gọn gàng (~120 dòng), chỉ có nhiệm vụ kết nối các dependency và trả về phần tử DOM của Editor.
- **Tương thích ngược (`editor.js`)**: Re-export `renderEditor` từ `index.js`, đảm bảo các router cũ trong app không cần thay đổi đường dẫn import.

### 13.2 Render, focus và undo
- Mỗi vùng có hàm dựng riêng (`renderTopbar`, `renderList`, `renderForm`, `renderPreview`). **Khi người dùng gõ**: chỉ cập nhật state → cập nhật xem trước (debounce) → vá đúng một hàng danh sách → cập nhật dòng lỗi. **Không dựng lại ô đang gõ** (tránh mất focus/con trỏ).
- Chỉ dựng lại form khi: đổi mục, đổi dạng, thêm/xoá/sắp xếp lựa chọn. Mọi ô có `data-path` (vd `choices.2.text`); sau khi dựng lại, khôi phục focus + vị trí con trỏ theo `data-path` và `selStart/selEnd`.
- **Một lịch sử undo duy nhất** cho cả bộ thẻ (`createHistory` của `deckmodel`). Chặn `Ctrl+Z` gốc của textarea; mỗi mục lịch sử lưu thêm `{itemId, path, selStart, selEnd}` để Undo/Redo trả đúng chỗ đang gõ. Gộp các lần gõ liên tiếp trong 500 ms như cũ. Mọi thao tác chèn (công thức, ảnh, dán) cũng đi qua state, nên Undo hoạt động đồng nhất.
- Đang gõ trong ô thì không để sự kiện nền (autosave, watch file) làm đổi giá trị ô.

### 13.3 Hàm thuần thêm vào `deckmodel.js` / `mathinput.js` (đều có test)
- `mathContext(text, pos)`, `insertFormula(state, latex, {block})`, `nextPlaceholder(text, pos)` (mục 7.2).
- `setCorrect(item, index, on)` — bật/tắt đáp án đúng và **tự đặt `type`** `single`/`multi` theo số đáp án đúng.
- `splitPastedChoices(text)` → `[{text, correct}]` (mục 6.2).
- `normalizeOnLeave(item)` — bỏ lựa chọn trống ở cuối, cắt khoảng trắng thừa.
- `newItemLike(deck, item)` — mục mới cùng dạng/chủ đề/nhãn với `item` (mục 5).

---

## 14. Nghiệm thu

- [ ] Mở Editor ở 1920×1080 và 1280×720: **không** có hai thanh cuộn lồng nhau, không có lề trống lớn, thanh trên và thanh công cụ ô soạn đứng yên khi cuộn.
- [ ] Bấm `ƒx` → popover hiện **bên trên** nội dung, không che/đẩy ô câu hỏi; các nút hiển thị công thức đã render.
- [ ] Chèn lần lượt phân số, căn, tổng, `∞` ở ngoài công thức → xem trước hiện công thức đúng (không còn chuỗi `\infty\sum…` thô); chèn khi con trỏ đang trong `$…$` → không sinh thêm `$`; bôi đen `x+1` rồi bấm phân số → `\frac{x+1}{▢}`; `Tab` nhảy sang `▢` kế tiếp.
- [ ] Gõ `$` tự thêm `$` đóng; `Ctrl+Z` sau khi chèn công thức trả đúng trạng thái và đúng vị trí con trỏ.
- [ ] Mục mới tinh **không** hiện khung lỗi đỏ; lỗi chỉ hiện sau khi rời ô hoặc khi Lưu; chip `⚠ n vấn đề` bấm nhảy đúng ô.
- [ ] Không còn chuỗi `question`, `answerImage`, `image`, `ID: …` hay ô đường dẫn ảnh trên giao diện thường.
- [ ] Ảnh: kéo thả, dán, bấm chọn đều ra thumbnail ở ô ảnh; trong Markdown chèn `![mô tả](…)` và bôi đen "mô tả".
- [ ] Trắc nghiệm: chỉ dùng bàn phím soạn được 1 câu 4 lựa chọn (Enter thêm lựa chọn, Backspace xoá ô rỗng); dán 4 dòng `A. … B. …` tách thành 4 lựa chọn; tích 2 đáp án thì `type` tự thành `multi`.
- [ ] `Ctrl+Enter` thêm mục mới cùng dạng/chủ đề; soạn liền 10 câu không cần chạm chuột.
- [ ] Danh sách: tiêu đề tối đa 2 dòng, mục trống ghi "(Chưa có nội dung)", checkbox/tay kéo chỉ hiện khi rê chuột; xoá mục có "Hoàn tác" thay vì hộp thoại.
- [ ] Bộ thẻ 1000 mục: cuộn danh sách và gõ trong form vẫn mượt.
- [ ] Xem trước: không thanh cuộn ngang với công thức dài (khối công thức tự cuộn); `Chấm thử` hoạt động; mục lỗi có ghi chú cuối vùng, không có banner trong tiêu đề.
- [ ] Mọi control cùng chiều cao/viền/focus; tooltip có phím tắt; dark mode không vỡ giao diện.
- [ ] Test xanh: `mathinput` (`mathContext` các ca `$a$`, `$$`, `\$`, con trỏ giữa công thức), `insertFormula` (4 quy tắc đầu), `setCorrect`, `splitPastedChoices`, `normalizeOnLeave`, `validate` (quy tắc `▢`).
- [ ] Không thay đổi định dạng `.sdeck`: mở lại bộ thẻ cũ vẫn học được, bộ thẻ lưu bởi Editor mới vẫn mở được bằng bản cũ.

---

## 15. Prompt giao việc (chia hai lượt)

Đính kèm thêm **ảnh chụp màn hình Editor hiện tại** làm mốc "trước", và dán lần lượt:

**Lượt 1 — nền tảng giao diện**
```
@study-app.md @study-app-phases.md @study-app-editor-ux.md
(đính kèm ảnh chụp Editor hiện tại)

Bạn đang giúp tôi xây app Electron học tập theo study-app.md. Tuân thủ "Quy tắc chung cho AI"
ở mục 0 của study-app-phases.md. Dự án dùng JavaScript thuần, KHÔNG React, KHÔNG TypeScript,
KHÔNG thêm bundler.

Việc cần làm: GIAI ĐOẠN 2C-fix, LƯỢT 1 theo study-app-editor-ux.md. File này thay thế
mục 2.7 và 9.3 của study-app.md. Hãy đọc code Editor hiện có trước, giữ logic (deckmodel,
validate, IPC, richtext), làm lại phần giao diện.

Phạm vi lượt 1: mục 3 (khung 100vh, 3 cột, splitter), 4 (thanh trên + toast Hoàn tác),
5 (danh sách), 6.1 (phần chung, chip "Thêm", ẩn id, nhãn tiếng Việt), 9 (kiểm tra lỗi đúng lúc),
10 (xem trước), 11 (phím tắt trừ phần công thức), 12 (tokens + controls),
13.1–13.2 (cấu trúc file, render không mất focus, undo toàn cục có khôi phục con trỏ).
Chưa làm: popover công thức, ô ảnh mới, form lựa chọn/điền mới (lượt 2).

Viết test cho phần logic thuần. Chạy test và npm start trước khi báo xong.
Cuối cùng liệt kê file đã tạo/sửa, cách chạy, và những gì chưa làm.
```

**Lượt 2 — soạn nội dung** (mở phiên mới sau khi commit lượt 1)
```
@study-app.md @study-app-phases.md @study-app-editor-ux.md

Bối cảnh như lượt 1. Việc cần làm: GIAI ĐOẠN 2C-fix, LƯỢT 2 theo study-app-editor-ux.md:
mục 6.2–6.4 (trắc nghiệm tự suy ra single/multi, hàng lựa chọn, dán thông minh; điền/lệnh;
thẻ), 7 (ô Markdown tự giãn, auto-pair $, popover công thức, insertFormula, snippets),
8 (ô ảnh + trình quản lý ảnh), 13.3 (hàm thuần mới).
Đọc code hiện có và lượt 1 trước, giữ nguyên và mở rộng.
Viết test theo mục 14 (mathinput, insertFormula, setCorrect, splitPastedChoices,
normalizeOnLeave, validate). Chạy test và npm start trước khi báo xong.
Cuối cùng liệt kê file đã tạo/sửa, cách chạy, và những gì chưa làm.
```

**Sau khi xong:** sửa mục 2.7 của `study-app.md` thành một dòng "Xem `study-app-editor-ux.md`" và thêm file này vào mục 2C của `study-app-phases.md`, để spec vẫn là nguồn sự thật.

**Gợi ý model:** lượt 1 và lượt 2 đều là UI + logic thuần, dùng Sonnet 5.5 mức Medium là đủ; riêng `mathinput.js` (ngữ cảnh `$`, con trỏ, undo) nên để Opus 5.5 làm hoặc rà lại.
