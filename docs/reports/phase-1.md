# Báo Cáo Nghiệm Thu Giai Đoạn 1: Thiết Lập Khung & Lớp Tương Thích window.api

- **Dự án:** Turtle Deck (Chuyển đổi từ Electron sang Tauri v2)
- **Nhánh thực hiện:** `tauri-migration`
- **Giai đoạn:** Giai đoạn 1 — Khung + Lớp `window.api` + CI build
- **Trạng thái Gate 1:** ✅ **ĐẠT (PASSED)**
- **Thời gian nghiệm thu:** 03/11/2026

---

## 1. Mục tiêu Giai đoạn 1

Theo kế hoạch tại [TAURI_MIGRATION_PLAN.md](../plans/TAURI_MIGRATION_PLAN.md):
- Thiết lập dự án Tauri v2 song song không ảnh hưởng bản Electron hiện tại.
- Xây dựng lớp tương thích `window.api` để tái sử dụng 100% giao diện renderer mà không cần sửa mã nguồn UI.
- Chuẩn hóa xử lý lỗi tiếng Việt và cơ chế fallback chống crash renderer.
- Tự động hóa kiểm thử và kiểm tra hợp đồng IPC giữa Frontend và Backend.
- Vượt qua cổng nghiệm thu **Gate 1**: `npm run tauri:dev` mở được app, các lệnh chưa port trả lỗi rõ ràng hoặc dữ liệu rỗng an toàn, không làm crash ứng dụng.

---

## 2. Các hạng mục đã triển khai

### 2.1 Backend Rust (`src-tauri/`)
- **Quản lý Crate & Dependencies (`Cargo.toml`):**
  - Sử dụng Tauri 2.12 với các plugin chính: `tauri-plugin-dialog`, `tauri-plugin-shell`, `tauri-plugin-single-instance`, `tauri-plugin-log`.
  - Cơ sở dữ liệu: `rusqlite` với cờ `bundled` (tự đóng gói SQLite kèm FTS5, không phụ thuộc thư viện hệ thống).
  - Tiện ích hệ thống: `notify 6` (file watcher), `zip 2` (.sdeck pack/unpack), `sha2` (tính hash), `dirs` (tìm thư mục config), `thiserror`, `tokio`.
- **Cấu hình ứng dụng (`tauri.conf.json` & `capabilities/`):**
  - Cửa sổ tiêu chuẩn: 1100×760, minWidth 800×550.
  - CSP an toàn: `default-src 'self' asset: ipc: http://ipc.localhost; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' asset: data:; font-src 'self' data:; connect-src 'self' asset: ipc: http://ipc.localhost; object-src 'none'; base-uri 'none'; frame-src 'none'`.
  - Phân quyền tối thiểu: `core:default`, `dialog:default`, `shell:allow-open`.
  - Định dạng liên kết tệp: `.sdeck` (`application/x-studydeck`).
- **Bảo toàn dữ liệu cũ (`src-tauri/src/paths.rs`):**
  - Dùng đúng thư mục `~/.config/Turtle Deck` của Electron để bảo lưu toàn bộ database, settings, backups và drafts của người dùng.
- **Chuẩn hóa lỗi (`src-tauri/src/error.rs`):**
  - Enum `AppError` trả thông điệp tiếng Việt thân thiện, serialize thành `{ ok: false, error: "..." }`.
- **Đăng ký đầy đủ 56 commands IPC (`src-tauri/src/commands/`):**
  - Toàn bộ các kênh của Electron được stub đầy đủ trong Rust, kênh mảng (`deck_open`, `folder_get_tree`, `library_scan`...) trả `[]` để frontend hiển thị an toàn.

### 2.2 Tầng Tương Thích Frontend (`src/platform/`)
- **`channels.js`:** Ánh xạ 1-1 từ 56 kênh IPC của Electron sang command Tauri (`deck:open` $\rightarrow$ `deck_open`), khai báo danh sách `ARRAY_CHANNELS`.
- **`tauri-api.js`:** Cung cấp đối tượng `window.api` tương thích hoàn toàn với `preload.ts`, bắt lỗi và chuyển đổi dữ liệu an toàn.
- **`electron-shim.js`:** Shim rỗng đảm bảo bản Electron không bị xung đột.

### 2.3 Công Cụ Build & Scripts
- Nâng cấp `tools/build.mjs`: Hỗ trợ `--shell=tauri|electron` (mặc định `electron` để không phá vỡ quy trình cũ). Khi build cho Tauri, tự động chèn `tauri-api.js` và CSP vào `dist/index.html`.
- Thêm scripts vào `package.json`:
  - `"tauri:dev"`: `node tools/build.mjs --shell=tauri && tauri dev`
  - `"tauri:build"`: `node tools/build.mjs --shell=tauri && tauri build`

### 2.4 CI/CD & Tài Liệu
- `.github/workflows/tauri.yml`: Tự động build và test trên cả Linux (Ubuntu) và Windows với cache cargo.
- `docs/tauri-dev.md`: Hướng dẫn cài đặt thư viện hệ thống và môi trường phát triển.
- `docs/tauri-visual-qa.md`: Bảng theo dõi kiểm thử thị giác trên WebKit.

---

## 3. Kết Quả Kiểm Thử & Nghiệm Thu (Gate 1)

| Hạng mục kiểm tra | Lệnh thực hiện | Kết quả | Ghi chú |
|---|---|---|---|
| **Cú pháp Rust** | `cargo check` | ✅ PASS | Không lỗi compilation |
| **Unit tests Backend** | `cargo test` | ✅ PASS | 0 failed |
| **Linting Rust** | `cargo clippy -- -D warnings` | ✅ PASS | 0 warning |
| **Định dạng code** | `cargo fmt --check` | ✅ PASS | Chuẩn format Rust |
| **Kiểm tra kiểu TS** | `npm run typecheck` | ✅ PASS | 0 error |
| **Hợp đồng kênh IPC** | `node --test test/ipc-channels.test.mjs` | ✅ PASS | 56/56 kênh có ánh xạ & Rust command tương ứng |
| **Bộ test tổng thể** | `npm test` | ✅ PASS | 206/206 logic tests pass |
| **Khởi chạy ứng dụng** | `./src-tauri/target/debug/turtle-deck` | ✅ PASS | Mở cửa sổ GUI WebKitGTK 1100×760, nạp `window.api`, giao diện không crash |

---

## 4. Các Commit Thuộc Giai Đoạn 1

1. `12d503b`: `tauri(gđ1): thiết lập khung chuyển đổi sang tauri v2 và lớp tương thích window.api`
2. `fc3ea5d`: `tauri(gđ1): hoàn thiện nghiệm thu gate 1, format cargo fmt và sửa clippy warnings`

---

## 5. Kế Hoạch Cho Giai Đoạn 2 (Database, Settings, Progress, Folder)

- Port `src/main/db/schema.ts`, `migration.ts`, `migration-folders.ts` sang `src-tauri/src/db/`.
- Cài đặt `srs.repo`, `stats.repo` (tính streak theo múi giờ `Asia/Saigon`), `folder.repo`, `deck-location.repo`.
- Port `settings-service.ts` và `progress-service.ts`.
- Mục tiêu Gate 2: Mở DB thật từ bản Electron mà không phát sinh lỗi, hiển thị đúng cây thư mục, cài đặt và thống kê.
