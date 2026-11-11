# Phone Remote Controller (với Mật khẩu/PIN & Nginx Support) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

Tính năng **Phone Remote Controller** cho Turtle Deck: Biến smartphone thành bàn điều khiển từ xa qua mạng LAN / Nginx để chọn đáp án (A/B/C/D), lật thẻ Flashcard (SRS 1-4), và đọc giải thích chi tiết ngay trên điện thoại khi laptop hiển thị đề thi.

---

## File Structure

```
src-tauri/src/services/remote_server/
  ├── mod.rs                # Module chính: quản lý vòng đời server (start/stop), state, LAN IP discovery
  ├── http_server.rs        # HTTP + SSE server nhẹ chạy trên Tokio TcpListener (không cần crate ngoài)
  ├── mobile.html           # Giao diện web mobile SPA nhúng thẳng (PIN keypad, A/B/C/D, SRS rating, giải thích)
  └── protocol.rs           # Struct tin nhắn giữa Phone <-> Laptop (Auth, State, Action)

src-tauri/src/commands/
  └── remote.rs             # Tauri commands: remote_start, remote_stop, remote_status, remote_broadcast_state

src/platform/
  └── channels.js           # Thêm ánh xạ kênh IPC cho remote control

src/views/session/
  ├── remote-controller.js  # Tích hợp phát sóng trạng thái session và lắng nghe hành động từ mobile
  └── remote-modal.js       # Modal QR Code, IP URL, đổi/hiển thị PIN

docs/
  └── nginx-remote-controller.conf  # Cấu hình mẫu Nginx Reverse Proxy (HTTP + SSE streaming)
```

---

## Tasks

### Task 1: Rust Remote Server Core (HTTP + SSE + Auth)
- **Files to create/modify**:
  - `src-tauri/src/services/remote_server/protocol.rs`
  - `src-tauri/src/services/remote_server/http_server.rs`
  - `src-tauri/src/services/remote_server/mod.rs`
  - `src-tauri/src/services/mod.rs`
- **Responsibilities**:
  - Lắng nghe TCP trên cổng chỉ định (mặc định 8765, `0.0.0.0`).
  - Phục vụ route `GET /` (trả về trang web mobile HTML).
  - Phục vụ route `POST /api/auth` (xác thực mã PIN 4-6 số, trả về token ngẫu nhiên).
  - Phục vụ route `GET /api/events?token=...` (Server-Sent Events stream, phát sóng realtime cho các điện thoại đã xác thực).
  - Phục vụ route `POST /api/action` (nhận lệnh từ điện thoại, chuyển tiếp tới mpsc channel).
  - Lấy danh sách IP nội bộ (LAN IP) của máy để sinh URL kết nối.

- [ ] **Step 1.1**: Định nghĩa các struct protocol (`protocol.rs`): `RemoteStatePayload`, `RemoteActionPayload`, `AuthRequest`, `AuthResponse`.
- [ ] **Step 1.2**: Viết module `http_server.rs` dùng `tokio::net::TcpListener` thuần xử lý HTTP 1.1 request cơ bản (GET, POST), xác thực header `Authorization: Bearer <token>` hoặc query `?token=...`, và duy trì kết nối SSE `text/event-stream`.
- [ ] **Step 1.3**: Viết hàm quét địa chỉ IP LAN (Network interface IPv4) để tạo đường dẫn `http://<LAN_IP>:<PORT>`.
- [ ] **Step 1.4**: Viết unit test trong Rust cho HTTP parser và xác thực PIN/token.
- [ ] **Step 1.5**: Chạy `cargo test` để đảm bảo code biên dịch sạch và test pass.

---

### Task 2: Giao diện Web Mobile Controller (Embedded Single-File SPA)
- **Files to create/modify**:
  - `src-tauri/src/services/remote_server/mobile.html`
- **Responsibilities**:
  - Giao diện siêu nhẹ (< 50KB), hoàn toàn responsive, tối ưu cho ngón tay cái trên màn hình điện thoại.
  - Màn hình khóa PIN: Bàn phím số cảm ứng, rung xúc giác (`navigator.vibrate`), hiển thị thông báo lỗi nếu sai PIN, lưu token vào `sessionStorage`.
  - Màn hình điều khiển Quiz / Trắc nghiệm:
    - 4 nút lớn A, B, C, D (và Đúng / Sai) hiển thị trạng thái nổi bật.
    - Nút "Câu tiếp theo" và "Câu trước".
    - Khung "Lời giải thích chi tiết" (Explanation) tự động mở rộng khi câu hỏi đã được trả lời.
  - Màn hình điều khiển Flashcard / SRS:
    - Nút to "Lật thẻ" (Flip).
    - 4 nút đánh giá SRS: Lại (Again), Khó (Hard), Tốt (Good), Dễ (Easy) kèm màu sắc chuẩn.
    - Hiển thị mặt sau và ghi chú khi lật thẻ.
  - Tự động kết nối lại khi mất mạng (auto-reconnect SSE).

- [ ] **Step 2.1**: Thiết kế HTML/CSS với CSS Grid/Flexbox, hỗ trợ cả Dark theme và Light theme theo `prefers-color-scheme`.
- [ ] **Step 2.2**: Viết logic Javascript kết nối SSE `/api/events?token=...` và gọi `POST /api/action`.
- [ ] **Step 2.3**: Kiểm tra hiển thị responsive trên kích thước màn hình mobile (iPhone/Android).

---

### Task 3: Tauri Commands & App State Integration
- **Files to create/modify**:
  - `src-tauri/src/commands/remote.rs`
  - `src-tauri/src/commands/mod.rs`
  - `src-tauri/src/state.rs`
  - `src-tauri/src/lib.rs`
- **Responsibilities**:
  - Đăng ký các command Tauri:
    - `remote_start(port: Option<u16>, pin: Option<String>) -> Result<RemoteServerInfo>`
    - `remote_stop() -> Result<()>`
    - `remote_status() -> Result<RemoteServerStatus>`
    - `remote_broadcast_state(state: serde_json::Value) -> Result<()>`
  - Đăng ký Tauri Event `remote-action` phát về Webview frontend khi có lệnh bấm từ điện thoại.
  - Lưu trữ `RemoteServerHandle` trong `AppState`.

- [ ] **Step 3.1**: Cập nhật `AppState` để chứa trạng thái của Remote Server.
- [ ] **Step 3.2**: Viết các command trong `src-tauri/src/commands/remote.rs`.
- [ ] **Step 3.3**: Đăng ký các command mới trong `src-tauri/src/commands/mod.rs` và `src-tauri/src/lib.rs`.
- [ ] **Step 3.4**: Biên dịch thử bằng `cd src-tauri && cargo check` để xác nhận tương thích hoàn toàn.

---

### Task 4: Frontend Platform IPC & Session Integration
- **Files to create/modify**:
  - `src/platform/channels.js`
  - `src/views/session/remote-controller.js`
  - `src/views/session/remote-modal.js`
  - `src/views/session/index.js`
- **Responsibilities**:
  - Thêm kênh IPC `remote:start`, `remote:stop`, `remote:status`, `remote:broadcast` trong `channels.js`.
  - Viết module `remote-controller.js` kết nối logic session với Remote Server:
    - Lắng nghe event `remote-action` từ Tauri:
      - Khi nhận action `SELECT_CHOICE` $\rightarrow$ gọi chọn đáp án và submit.
      - Khi nhận action `NEXT` $\rightarrow$ gọi `nextQuestion()`.
      - Khi nhận action `FLIP` $\rightarrow$ lật flashcard.
      - Khi nhận action `RATE_SRS` $\rightarrow$ gọi `submitCurrent(rating)`.
    - Khi phiên học render lại $\rightarrow$ đóng gói `currentQ`, `submitted`, `isCorrect`, `explanation`, `options` và broadcast qua server.
  - Tạo hộp thoại `remote-modal.js`:
    - Vẽ mã QR Code (bằng SVG thuần nhẹ, không cần thư viện npm nặng nề).
    - Hiển thị địa chỉ IP LAN (ví dụ: `http://192.168.1.15:8765`).
    - Hiển thị mã PIN 4 số to rõ, kèm nút đổi mã PIN hoặc dừng server.
  - Thêm nút Remote trên thanh toolbar của màn hình học `session/index.js`.

- [ ] **Step 4.1**: Cập nhật `src/platform/channels.js`.
- [ ] **Step 4.2**: Viết generator SVG QR Code nhẹ gọn trong `src/views/session/qr-svg.js`.
- [ ] **Step 4.3**: Viết `remote-modal.js` hiển thị thông tin kết nối và quản lý bật/tắt.
- [ ] **Step 4.4**: Viết `remote-controller.js` tích hợp đồng bộ trạng thái 2 chiều với session.
- [ ] **Step 4.5**: Thêm nút Remote trên giao diện `src/views/session/index.js`.

---

### Task 5: Cấu hình Nginx & Hướng dẫn sử dụng
- **Files to create/modify**:
  - `docs/nginx-remote-controller.conf`
  - `docs/remote-controller-guide.md`
- **Responsibilities**:
  - Tạo file cấu hình mẫu Nginx hoàn chỉnh:
    - Reverse proxy cổng 8765.
    - Cấu hình hỗ trợ SSE streaming (`proxy_buffering off; proxy_cache off; chunked_transfer_encoding off;`).
    - Hướng dẫn các bước áp dụng trên Linux (systemd / nginx conf.d) hoặc chạy trực tiếp không qua Nginx.

- [ ] **Step 5.1**: Tạo file `docs/nginx-remote-controller.conf`.
- [ ] **Step 5.2**: Viết hướng dẫn kết nối trên điện thoại và thiết lập Nginx trong `docs/remote-controller-guide.md`.

---

### Task 6: Kiểm thử & Nghiệm thu toàn diện
- **Responsibilities**:
  - Chạy `npm test` để đảm bảo 187 test hiện tại không bị ảnh hưởng.
  - Viết unit test cho các module JS mới (`remote-controller.test.mjs`, `qr-svg.test.mjs`).
  - Kiểm tra build renderer `npm run build`.
  - Kiểm tra `cargo check` trong `src-tauri`.

- [ ] **Step 6.1**: Viết unit test cho logic điều khiển và SVG QR code.
- [ ] **Step 6.2**: Chạy toàn bộ test suite (`npm test`).
- [ ] **Step 6.3**: Chạy `npm run build` và xác nhận không có lỗi bundler / typescript.
