# Session Quick Translate (Google Translate) Specification

## Intent & The Why
Khi người dùng học các bộ thẻ có câu hỏi hoặc nội dung bằng tiếng Anh, có những câu phức tạp hoặc từ vựng mới khiến người học không hiểu ngay đề bài. Việc phải mở trình duyệt hoặc chuyển sang tab khác làm gián đoạn trải nghiệm học tập và luồng tư duy. Tính năng Quick Translate cho phép người dùng xem ngay bản dịch tiếng Việt ngay trong phiên học bằng một phím tắt hoặc nút bấm, và ẩn đi tức thì khi không cần.

## Goals
- Cung cấp dịch vụ dịch nhanh trực tiếp qua Google Translate API (endpoint công khai không cần cấu hình key phức tạp).
- Thêm nút 🌐 Dịch (Alt+T) trên giao diện câu hỏi trong phiên học (`src/views/session/index.js`).
- Hỗ trợ phím tắt `Alt+T` (hoặc phím `T` khi không focus vào trường nhập văn bản).
- Khung bản dịch tiếng Việt hiển thị gọn gàng bên dưới câu hỏi (`prompt`), có thể bật/tắt (toggle).
- Hỗ trợ cache bản dịch theo nội dung câu trong bộ nhớ để tiết kiệm tài nguyên mạng và phản hồi tức thì khi bật/tắt lại.
- Tự động reset trạng thái dịch khi chuyển sang câu tiếp theo.
- Xử lý mượt mà khi đang tải (loading) và hiển thị thông báo thân thiện khi gặp lỗi mạng/timeout.

## Non-Goals & Anti-Goals
- Không thay đổi nội dung gốc của bộ thẻ hay lưu bản dịch vào file `.sdeck`.
- Không bắt buộc người dùng cấu hình tài khoản Google Cloud hay nhập thẻ tín dụng.
- Không tự động dịch trước mọi câu hỏi (gây lộ đề, mất trải nghiệm tự đọc hiểu tiếng Anh của người học).

## Architecture & Security
- **CSP Updates:** Cho phép kết nối đến `https://translate.googleapis.com` trong `connect-src` tại `src/index.html` và `src-tauri/tauri.conf.json`.
- **Core Translation Module (`src/core/translate/quick-translate.ts` / `.js`):**
  - Hàm `translateText(text: string, options?: { from?: string, to?: string, fetcher?: typeof fetch }): Promise<string>`
  - Lưu cache nội dung dịch bằng `Map<string, string>`.
- **Session UI Integration (`src/views/session/index.js`, `actions-row.js`, `keyboard.js`):**
  - Quản lý trạng thái dịch `session.translation = { visible: boolean, loading: boolean, text: string, error: string | null }`.
  - Phím tắt `Alt+T` bắt tại `src/views/session/keyboard.js`.
  - Render khối `.question-translation-box` khi `visible: true`.
  - Nút bấm `🌐 Dịch (Alt+T)` trên thanh metadata câu hỏi hoặc cạnh prompt.
- **Styling (`src/styles/session.css`):**
  - CSS cho `.question-translation-box`, nút dịch `.translate-toggle-btn`.
