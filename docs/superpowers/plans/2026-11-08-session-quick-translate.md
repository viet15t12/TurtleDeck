# Session Quick Translate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Thêm tính năng dịch nhanh câu hỏi tiếng Anh sang tiếng Việt trong phiên học bằng Google Translate API với nút bấm và phím tắt `Alt+T`.

**Architecture:** Tạo module dịch `quick-translate.ts` với Google Translate API endpoint miễn phí và bộ nhớ đệm cache; mở CSP kết nối tới Google Translate trong `src/index.html` và `tauri.conf.json`; tích hợp nút toggle dịch và phím tắt `Alt+T` vào màn hình phiên học `src/views/session/`.

**Tech Stack:** TypeScript, Vanilla JS DOM helper (`h`), Node test runner (`node --test`), CSS tokens, Tauri 2 CSP.

**Spec:** `docs/superpowers/specs/2026-11-08-session-quick-translate-design.md`

## Global Constraints
- Phải dùng Vanilla JS / TypeScript, không thêm thư viện bên ngoài (không npm install thêm package).
- Không được làm ảnh hưởng đến luồng trả lời câu hỏi và các phím tắt hiện có (1, 2, 3, 4, Enter, Space, Escape, Alt+L).
- Tự động reset trạng thái dịch khi chuyển câu hỏi mới để bảo đảm người học luôn chủ động tự đọc tiếng Anh trước.
- Không sửa đổi hay ghi đè nội dung gốc của câu hỏi trong file `.sdeck`.

## Review Focus
- Bấm toggle dịch khi mất mạng hoặc API lỗi: hiển thị thông báo lỗi nhẹ nhàng và cho phép bấm thử lại, không ném unhandled rejection.
- Câu hỏi có chứa ký tự đặc biệt, định dạng Markdown / KaTeX / khoảng trắng: mã hóa URL (`encodeURIComponent`) chuẩn xác trước khi gọi endpoint.
- Bấm phím tắt `Alt+T` khi đang gõ vào ô nhập liệu (`input`, `textarea`): không can thiệp vào phím gõ thông thường của người dùng.
- Chuyển câu hỏi khi đang tải dịch câu trước: hủy hoặc bỏ qua kết quả trả về của câu cũ, không render đè lên câu mới.
- Bật/tắt lại dịch của cùng một câu nhiều lần: lấy ngay từ bộ nhớ đệm (cache), không tạo request mạng dư thừa.

---

### Task 1: Core Quick Translate Service & Unit Tests

**Files:**
- Create: `src/core/translate/quick-translate.ts`
- Create: `test/quick-translate.test.js`

**Interfaces:**
- Produces:
  ```typescript
  export interface TranslateOptions {
    from?: string; // mặc định 'auto'
    to?: string;   // mặc định 'vi'
    fetcher?: typeof fetch;
  }
  export function translateText(text: string, options?: TranslateOptions): Promise<string>;
  export function clearTranslateCache(): void;
  ```

- [ ] **Step 1: Write the failing unit tests for quick-translate**
  Tạo `test/quick-translate.test.js` kiểm tra:
  - Bóc tách kết quả từ cấu trúc JSON lồng nhau của endpoint Google Translate (`[[["Bản dịch tiếng Việt", "English text", null, null]]]`).
  - Cache kết quả: gọi 2 lần cùng nội dung chỉ fetch mạng 1 lần.
  - Chuỗi rỗng hoặc chỉ có khoảng trắng trả về rỗng ngay không gọi fetch.
  - Xử lý lỗi mạng khi fetch trả về status không ok hoặc quăng ngoại lệ.

- [ ] **Step 2: Run test to verify it fails**
  Run: `node --import ./tools/register-test-hooks.mjs --test test/quick-translate.test.js`
  Expected: FAIL with module not found or undefined functions.

- [ ] **Step 3: Implement `src/core/translate/quick-translate.ts`**
  - Cài đặt hàm `translateText(text, options)`:
    - Trim text, nếu rỗng trả về `''`.
    - Kiểm tra `cache.get(cacheKey)`.
    - URL: `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${from}&tl=${to}&dt=t&q=${encodeURIComponent(text)}`
    - Parse mảng lồng nhau: nối các đoạn `chunk[0]` thành câu hoàn chỉnh.
    - Lưu vào cache `cache.set(cacheKey, result)` và trả về.
  - Cài đặt `clearTranslateCache()`.

- [ ] **Step 4: Run test to verify it passes**
  Run: `node --import ./tools/register-test-hooks.mjs --test test/quick-translate.test.js`
  Expected: PASS

- [ ] **Step 5: Commit**
  Run: `git add src/core/translate/quick-translate.ts test/quick-translate.test.js && git commit -m "feat(translate): add core quick-translate service with in-memory caching"`

---

### Task 2: Content Security Policy (CSP) Updates

**Files:**
- Modify: `src/index.html:6-9`
- Modify: `src-tauri/tauri.conf.json:25`

**Interfaces:**
- Cho phép kết nối đến `https://translate.googleapis.com` trong CSP.

- [ ] **Step 1: Update CSP in `src/index.html`**
  Thêm `https://translate.googleapis.com` vào chỉ thị `connect-src`:
  `connect-src 'self' https://translate.googleapis.com;`

- [ ] **Step 2: Update CSP in `src-tauri/tauri.conf.json`**
  Thêm `https://translate.googleapis.com` vào chỉ thị `connect-src` trong `app.security.csp`:
  `connect-src 'self' https://translate.googleapis.com ipc: http://ipc.localhost;`

- [ ] **Step 3: Verify build and config syntax**
  Run: `npm run build`
  Expected: PASS

- [ ] **Step 4: Commit**
  Run: `git add src/index.html src-tauri/tauri.conf.json && git commit -m "chore(security): allow translate.googleapis.com in CSP connect-src"`

---

### Task 3: Session State & Keyboard Shortcut Handler

**Files:**
- Modify: `src/views/session/session-state.ts:1-70`
- Modify: `src/views/session/keyboard.js:100-140`

**Interfaces:**
- Consumes: `translateText` from `src/core/translate/quick-translate.ts`
- Produces: `toggleTranslate()` in session context, phím tắt `Alt+T` gọi toggle.

- [ ] **Step 1: Add translation state in `session-state.ts`**
  - Khai báo kiểu trạng thái `translation`:
    ```typescript
    export interface TranslationState {
      visible: boolean;
      loading: boolean;
      text: string;
      error: string | null;
      forIndex: number;
    }
    ```
  - Trong `createSessionState`, khởi tạo `translation: { visible: false, loading: false, text: '', error: null, forIndex: -1 }`.
  - Trong `resetForQuestion`, reset `session.translation = { visible: false, loading: false, text: '', error: null, forIndex: -1 }`.

- [ ] **Step 2: Add keyboard shortcut `Alt+T` in `keyboard.js`**
  - Trong hàm `onKeyDown(ev)`:
    - Kiểm tra `(ev.altKey && (ev.key === 't' || ev.key === 'T'))`:
      - Ngăn hành vi mặc định `ev.preventDefault()`.
      - Gọi `ctx.toggleTranslate()`.

- [ ] **Step 3: Run existing session tests**
  Run: `npm test`
  Expected: PASS

- [ ] **Step 4: Commit**
  Run: `git add src/views/session/session-state.ts src/views/session/keyboard.js && git commit -m "feat(session): add translation state and Alt+T keyboard shortcut"`

---

### Task 4: UI Rendering & Styling for Question Translation

**Files:**
- Modify: `src/views/session/index.js:120-270`
- Modify: `src/styles/session.css`

**Interfaces:**
- Consumes: `translateText` from `src/core/translate/quick-translate.ts`
- Produces: UI component `.question-translation-box` và nút bấm `ux-btn sm translate-btn` trên header câu hỏi.

- [ ] **Step 1: Implement `toggleTranslate()` in `src/views/session/index.js`**
  - Bổ sung hàm `toggleTranslate()` vào `ctx`:
    - Nếu `session.translation.visible` đang true -> chuyển `visible = false` và gọi `render()`.
    - Nếu `visible` đang false:
      - Đặt `session.translation.visible = true`.
      - Nếu đã có `text` của câu hiện tại (`forIndex === session.index`) -> gọi `render()`.
      - Nếu chưa có: đặt `loading = true`, `error = null`, `forIndex = session.index`, gọi `render()`.
      - Lấy nội dung cần dịch: `q.prompt || (q.kind === 'card' ? q.front : '')`.
      - Gọi `translateText(text)`:
        - Thành công: nếu người dùng vẫn ở câu đó (`session.index === currentIndex`), cập nhật `text`, `loading = false`, gọi `render()`.
        - Thất bại: nếu vẫn ở câu đó, cập nhật `error = 'Không thể kết nối máy chủ dịch. Vui lòng kiểm tra mạng.'`, `loading = false`, gọi `render()`.

- [ ] **Step 2: Render translation button & translation box in `src/views/session/index.js`**
  - Thêm nút vào hàng `question-meta`:
    ```javascript
    h(
      'button',
      {
        type: 'button',
        class: `ux-btn xs ghost translate-toggle-btn ${session.translation?.visible ? 'active' : ''}`,
        title: 'Dịch câu hỏi sang tiếng Việt (Alt+T)',
        onclick: toggleTranslate,
      },
      session.translation?.visible ? '🌐 Ẩn dịch (Alt+T)' : '🌐 Dịch (Alt+T)'
    )
    ```
  - Render khối `.question-translation-box` ngay dưới `question-prompt` khi `session.translation?.visible`:
    - Khi `loading`: hiển thị `Đang dịch...` kèm spinner hoặc hiệu ứng mờ.
    - Khi `error`: hiển thị thông báo lỗi và nút `Thử lại`.
    - Khi có `text`: hiển thị nhãn `Bản dịch:` và nội dung dịch tiếng Việt rõ ràng.

- [ ] **Step 3: Add CSS styling in `src/styles/session.css`**
  - Style cho `.translate-toggle-btn` (icon, hover, active).
  - Style cho `.question-translation-box` (viền mỏng, bo góc, nền `var(--bg-subtle)`, màu chữ dễ đọc, icon phân biệt rõ ràng so với câu hỏi gốc).

- [ ] **Step 4: Verify build and tests**
  Run: `npm test && npm run typecheck && npm run build`
  Expected: PASS

- [ ] **Step 5: Commit**
  Run: `git add src/views/session/index.js src/styles/session.css && git commit -m "feat(session): render quick translate button and translation box"`

---

### Task 5: End-to-end Verification & Polish

**Files:**
- Verify: toàn bộ test suite và build

- [ ] **Step 1: Run all unit and integration tests**
  Run: `npm test`
  Expected: PASS

- [ ] **Step 2: Run typecheck**
  Run: `npm run typecheck`
  Expected: PASS without any errors

- [ ] **Step 3: Run full bundle build**
  Run: `npm run build`
  Expected: PASS without any errors

- [ ] **Step 4: Commit**
  Run: `git commit --allow-empty -m "chore: complete session quick translate feature implementation"`
