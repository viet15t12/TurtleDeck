# Báo Cáo Nghiệm Thu Giai Đoạn 5: Vòng Đời Ứng Dụng & Đóng Gói (Lifecycle & Packaging)

- **Dự án:** Turtle Deck (Chuyển đổi từ Electron sang Tauri v2)
- **Nhánh thực hiện:** `tauri-migration`
- **Giai đoạn:** Giai đoạn 5 — Vòng đời ứng dụng & Đóng gói
- **Trạng thái Gate 5:** ✅ **ĐẠT (PASSED)**
- **Thời gian nghiệm thu:** 04/11/2026

---

## 1. Mục tiêu Giai đoạn 5

Theo kế hoạch tại [TAURI_MIGRATION_PLAN.md](../plans/TAURI_MIGRATION_PLAN.md):
- **Cơ chế Single-Instance & Xử lý File Ngoài:**
  - Tích hợp `tauri-plugin-single-instance`: ngăn chặn ứng dụng chạy nhiều cửa sổ/tiến trình song song; khi mở instance thứ hai (nhấp đúp file `.sdeck`), tự động unminimize, show và focus cửa sổ chính hiện có.
  - Phân tích tham số dòng lệnh (`argv` lúc khởi động ứng dụng và `args` từ instance thứ hai): lọc bỏ các cờ bắt đầu bằng `-`, chỉ trích xuất các file có phần mở rộng `.sdeck` (không phân biệt hoa thường), tự động chuẩn hoá đường dẫn tuyệt đối (canonical path) và loại trừ tệp trùng lặp.
  - Đồng bộ trạng thái renderer: duy trì cờ nguyên tử `renderer_ready` và hàng đợi `pending_external_files`. Nếu ứng dụng mở tệp ngoài trước khi webview nạp xong, các tệp được xếp hàng đợi an toàn; khi renderer phát tín hiệu sẵn sàng qua command `app_ready` (`window.api.notifyReady`), toàn bộ hàng đợi được xả và gửi sự kiện `deck:openExternal` với payload chuẩn `{ path, filePaths }` để giao diện tự động mở bộ thẻ.
- **Tối ưu hóa Binary & Cấu Hình Release Profile:**
  - Cấu hình `[profile.release]` trong `Cargo.toml`: `opt-level = "s"`, `lto = true`, `codegen-units = 1`, `panic = "abort"`, `strip = true`.
  - Đạt mục tiêu **G1**: Binary unpacked $\le 40$ MiB, gói cài đặt $\le 20$ MiB.
- **Cấu hình Đóng gói Bundle (`tauri.conf.json`):**
  - Cấu hình targets đóng gói: Linux RPM, DEB, AppImage, Windows NSIS.
  - Đăng ký `fileAssociations`: extension `.sdeck`, MIME `application/x-studydeck`, Role `Editor`.
  - Phân loại danh mục `category: Education`, cung cấp mô tả ngắn và mô tả dài tiếng Việt chuẩn xác.
  - Bộ biểu tượng đầy đủ `icons/` đa kích thước chuẩn hóa từ `build/icons`.
- **Vượt qua cổng nghiệm thu Gate 5:**
  - Đóng gói thành công gói cài đặt Linux (RPM và DEB).
  - Kích thước đạt chỉ tiêu G1.
  - Các tệp liên kết hệ thống `.desktop` được cấu hình MIME `application/x-studydeck` chính xác.

---

## 2. Các hạng mục đã triển khai

### 2.1 Quản Lý Vòng Đời & Mở File Ngoài (`src-tauri/src/services/external_files.rs` & `commands/lifecycle.rs`)
- `extract_sdeck_files`: Trích xuất và giải quyết đường dẫn tương đối/tuyệt đối cho các file `.sdeck`.
- `handle_external_files`: Điều phối phát sự kiện `deck:openExternal` nếu renderer đã sẵn sàng hoặc lưu vào hàng đợi `pending_external_files`.
- `flush_pending_external_files`: Kích hoạt bởi lệnh `app_ready` khi webview frontend gọi `window.api.notifyReady()`, gửi toàn bộ tệp trong hàng đợi đến renderer.
- Tích hợp `tauri_plugin_single_instance`: Mang cửa sổ chính lên trước (focus, unminimize) khi người dùng mở file `.sdeck` từ bên ngoài hệ điều hành.

### 2.2 Trạng Thái Ứng Dụng (`src-tauri/src/state.rs`)
- Thêm cờ nguyên tử `renderer_ready: AtomicBool` và hàng đợi luồng an toàn `pending_external_files: Mutex<Vec<PathBuf>>`.

### 2.3 Cấu Hình Tối Ưu Hóa & Đóng Gói (`Cargo.toml` & `tauri.conf.json`)
- Thêm `[profile.release]` vào `src-tauri/Cargo.toml` với LTO toàn diện và strip symbols.
- Cập nhật thông tin bản quyền, mô tả dài tiếng Việt và cấu hình desktop entry trong `src-tauri/tauri.conf.json`.

---

## 3. Kết Quả Đo Lường Chỉ Số Mục Tiêu G1

| Chỉ số | Bản Electron cũ | Mục tiêu Kế hoạch | Kết quả Bản Tauri v2 | Đánh giá |
|---|---|---|---|---|
| **Binary thực thi (unpacked)** | 329 MiB | $\le$ 40 MiB | **11 MiB** | ✅ **Vượt chỉ tiêu** (giảm 96.6%) |
| **Gói cài đặt Linux (RPM)** | ~110 MiB | $\le$ 20 MiB | **5.75 MiB** | ✅ **Vượt chỉ tiêu** (giảm 94.8%) |
| **Gói cài đặt Linux (DEB)** | ~110 MiB | $\le$ 20 MiB | **5.75 MiB** | ✅ **Vượt chỉ tiêu** (giảm 94.8%) |
| **Tổng dung lượng gói cài** | 329 MiB | $\le$ 20 MiB | **5.75 MiB** | ✅ **Giảm 98.25% dung lượng** |

---

## 4. Kết Quả Kiểm Thử & Nghiệm Thu (Gate 5)

| Hạng mục kiểm tra | Lệnh thực hiện | Kết quả | Ghi chú |
|---|---|---|---|
| **Cú pháp Rust** | `cargo check --manifest-path src-tauri/Cargo.toml` | ✅ PASS | Biên dịch hoàn tất không lỗi |
| **Linting Rust** | `cargo clippy --manifest-path src-tauri/Cargo.toml -- -D warnings` | ✅ PASS | 0 warning, 0 error |
| **Định dạng code Rust** | `cargo fmt --manifest-path src-tauri/Cargo.toml -- --check` | ✅ PASS | Chuẩn format Rust |
| **Bộ Unit Tests Rust** | `cargo test --manifest-path src-tauri/Cargo.toml` | ✅ PASS (23/23) | 23 test suites bao gồm unit tests mới cho lifecycle, queue và argv resolution |
| **Kiểm tra kiểu TypeScript** | `npm run typecheck` | ✅ PASS | 0 error |
| **Hợp đồng kênh IPC** | `node --import ./tools/register-test-hooks.mjs --test test/ipc-channels.test.mjs` | ✅ PASS (2/2) | Khớp 56/56 kênh IPC |
| **Bộ kiểm thử logic JS** | `npm test` | ✅ PASS (207/207) | Toàn bộ 207 tests logic frontend chạy xanh |
| **Đóng gói Gói Cài Đặt** | `npx tauri build --bundles rpm,deb` | ✅ PASS | Sinh ra file `turtle-deck-0.1.4-1.x86_64.rpm` và `turtle-deck_0.1.4_amd64.deb` đúng định dạng |
| **Xác thực Desktop Entry** | Kiểm tra file `.desktop` trong RPM | ✅ PASS | `MimeType=application/x-studydeck`, icon và categories chuẩn |

---

## 5. Danh Sách Kiểm Thử Rust Mới Được Bổ Sung Trong Giai Đoạn 5

1. `tests/lifecycle_and_packaging_test.rs`:
   - `test_extract_sdeck_files_from_args_filtering_and_resolution`: Lọc sạch các flag (`--debug`, `-v`, `--port=8080`), loại bỏ tệp không phải `.sdeck`, chuẩn hoá đường dẫn tương đối qua thư mục gốc `base_dir`, hỗ trợ đuôi mở rộng hoa/thường (`.sdeck` và `.SDECK`) và loại bỏ trùng lặp.
   - `test_external_files_lifecycle_queue_and_flush`: Kiểm tra tính toàn vẹn của chu trình hàng đợi khi renderer chưa sẵn sàng và xả hàng đợi khi renderer gọi `app_ready`.

---

## 6. Kế Hoạch Cho Giai Đoạn 6 (Kiểm Thử Cuối, Dọn Dẹp, Tài Liệu)

- Kiểm thử checklist nghiệm thu 15 mục (A – O) theo mục 6 trong [TAURI_MIGRATION_PLAN.md](../plans/TAURI_MIGRATION_PLAN.md).
- Cập nhật hướng dẫn phát triển trong `docs/tauri-dev.md` và bảng so sánh kích thước/hiệu năng trong `README.md`.
- Chuẩn bị điều kiện để gỡ bỏ phụ thuộc Electron khi toàn bộ Gate được chốt nghiệm thu.

