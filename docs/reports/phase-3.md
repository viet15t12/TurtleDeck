# Báo Cáo Nghiệm Thu Giai Đoạn 3: Bộ Thẻ, .sdeck, Asset Protocol, Library & Watcher

- **Dự án:** Turtle Deck (Chuyển đổi từ Electron sang Tauri v2)
- **Nhánh thực hiện:** `tauri-migration`
- **Giai đoạn:** Giai đoạn 3 — Bộ thẻ, `.sdeck`, Asset Protocol, Library & Watcher
- **Trạng thái Gate 3:** ✅ **ĐẠT (PASSED)**
- **Thời gian nghiệm thu:** 03/11/2026

---

## 1. Mục tiêu Giai đoạn 3

Theo kế hoạch tại [TAURI_MIGRATION_PLAN.md](../../TAURI_MIGRATION_PLAN.md):
- **Package Store & Định dạng .sdeck:**
  - Cài đặt đọc, nén và giải nén file `.sdeck` (định dạng ZIP chuẩn, crate `zip 2`) hoàn toàn trong bộ nhớ (không giải nén rác ra đĩa).
  - Giới hạn bảo mật: tối đa 2000 entries, `deck.json` $\le$ 20 MB, ảnh $\le$ 5 MB, tổng dung lượng giải nén $\le$ 500 MB.
  - Tự động lọc ảnh không dùng (`prune = true`), kiểm tra an toàn tên entry (chống path traversal, ký tự điều khiển, thư mục cha `..`).
  - Nhận diện magic bytes các định dạng ảnh: PNG, JPG, GIF, WEBP, SVG (không tin đuôi mở rộng).
  - Ghi nguyên tử (`atomic_write` qua file tạm và rename) kèm cơ chế tự động tạo bản sao lưu `.bak` trước khi lưu.
  - Thuật toán `slugify` tiếng Việt chuẩn chuyển đổi dấu sang ký tự không dấu an toàn cho hệ thống tệp.
- **Custom URI Scheme Protocol `asset://`:**
  - Đăng ký `asset://<deckKey>/<path>` với WebKitGTK / WebView2.
  - Phục vụ ảnh trực tiếp từ bộ nhớ RAM của gói thẻ đang mở với đúng header `Content-Type` và `X-Content-Type-Options: nosniff`.
  - Thiết lập nghiêm ngặt `Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline'; sandbox`.
  - Chặn triệt để path traversal (`..`, `%2e%2e`), chặn truy xuất file cấu trúc `deck.json` hoặc các định dạng không phải ảnh.
- **Thư viện bộ thẻ (Library Service):**
  - Quét đệ quy thư mục thư viện (tối đa 10 cấp, depth 0..9), nhận diện liên kết symbolic link.
  - Tự động bỏ qua file ẩn (`.`), file sao lưu `.bak`, file tạm `.tmp`.
  - Cơ chế cache hiệu năng cao theo `(mtime_ms, size)` giúp khởi động tức thì và không đọc lại các gói thẻ chưa bị sửa đổi.
  - Tự động trích xuất metadata và phân nhóm `group` theo cây thư mục.
- **Theo dõi thời gian thực (Watcher Service):**
  - Tích hợp crate `notify 6` theo dõi đệ quy toàn bộ thư mục thư viện.
  - Cơ chế debounce 500ms chống spam sự kiện hệ điều hành.
  - Nhận diện và bỏ qua sự kiện tự lưu (`is_self_save` dựa trên mtime và thời điểm save gần nhất).
  - Phát sự kiện Tauri chuẩn: `deck:fileAdded`, `deck:fileRemoved`, `deck:changed`, `deck:watchError`, `folder:changed`.
- **Hoàn thiện đầy đủ các IPC Commands:**
  - `deck_open`, `deck_new`, `deck_save`, `deck_close`, `deck_duplicate`, `deck_export_copy`, `deck_show_in_folder`, `deck_import`, `deck_import_sdeck`, `deck_query_items`.
  - `asset_add`, `asset_add_bytes`, `asset_list`, `asset_remove`.
  - `library_get_dir`, `library_pick_dir`, `library_set_dir`, `library_scan`.

---

## 2. Các hạng mục đã triển khai

### 2.1 Quản lý Gói & Tệp `.sdeck` (`src-tauri/src/services/package_store.rs`)
- **`PackageStore`:** Quản lý thread-safe danh sách các gói đang mở (`OpenPackage`), token import tạm thời (`TempImport`), và bảng lưu thời điểm ghi đĩa (`known_saves`).
- **`read_package` & `read_package_meta`:** Đọc ZIP từ bộ nhớ, trích xuất `deck.json` và assets `img/`, kiểm tra magic bytes cho từng định dạng ảnh.
- **`write_package`:** Đóng gói ZIP nén Deflate, tự động gán `format: "studydeck"`, `formatVersion: 1`, thu thập các ảnh được tham chiếu từ nội dung câu hỏi/đáp án/markdown và loại bỏ ảnh rác.
- **`atomic_write` & `backup_file`:** Ghi file tạm `.tmp.<uuid>` rồi hoán đổi nguyên tử, tự động tạo `.sdeck.bak`.
- **`slugify`:** Chuyển đổi toàn diện các ký tự tiếng Việt có dấu (`á, ắ, ấ, đ, ê, ô, ơ, ư...`) sang chuỗi ký tự ASCII không dấu.

### 2.2 Giao thức Tùy chỉnh `asset://` (`src-tauri/src/services/asset_protocol.rs`)
- Đăng ký URI scheme protocol qua `tauri::Builder::register_uri_scheme_protocol("asset", ...)`.
- Phân tách `uri.host()` thành `deckKey`, giải mã URI component.
- Kiểm tra an toàn:
  - Bắt buộc bắt đầu bằng `img/` và kết thúc bằng đuôi ảnh hợp lệ.
  - Chặn các chuỗi chứa `..` hoặc mã hóa `%2e`.
  - Trả về mã lỗi HTTP 404 khi cố tình đọc `deck.json` hoặc asset không tồn tại.
- Phục vụ ảnh kèm header CSP sandbox bảo vệ tối đa webview.

### 2.3 Quản Lý Thư Viện (`src-tauri/src/services/library_service.rs`)
- Quét đệ quy cây thư mục có kiểm tra ranh giới thư viện (`is_path_inside_root`), phát hiện symlink.
- Phân nhóm `infer_group` dựa theo đường dẫn tương đối.
- Cache `LibraryCacheEntry` theo dấu vết thời gian sửa đổi và kích thước file.

### 2.4 Dịch Vụ Theo Dõi Đĩa (`src-tauri/src/services/watcher.rs`)
- Sử dụng `notify::RecommendedWatcher` chạy ngầm.
- Xử lý bất đồng bộ trong Tokio task: đọc file khi có thay đổi, phân biệt file mới thêm (`deck:fileAdded`) và file đang mở được cập nhật (`deck:changed`), đồng thời phát `deck:fileRemoved` khi file bị xóa.

### 2.5 Lớp IPC Commands (`src-tauri/src/commands/`)
- `commands/deck.rs`: Tích hợp dialog chọn file/thư mục, lưu file `.sdeck`, nhân bản bộ thẻ, xuất bản sao, mở thư mục chứa file, nhập file đơn lẻ và nhập hàng loạt `.sdeck` vào thư viện kèm đồng bộ SQLite.
- `commands/asset.rs`: Tích hợp dialog chọn ảnh, thêm ảnh thô (bytes từ clipboard/drag-drop), liệt kê và xóa ảnh trong gói.
- `commands/library.rs`: Lấy, chọn, thay đổi thư mục thư viện và quét danh sách bộ thẻ.

---

## 3. Kết Quả Kiểm Thử & Nghiệm Thu (Gate 3)

| Hạng mục kiểm tra | Lệnh thực hiện | Kết quả | Ghi chú |
|---|---|---|---|
| **Cú pháp Rust** | `cargo check` | ✅ PASS | Biên dịch hoàn tất không lỗi |
| **Linting Rust** | `cargo clippy -- -D warnings` | ✅ PASS | 0 warning, 0 error |
| **Định dạng code Rust** | `cargo fmt -- --check` | ✅ PASS | Chuẩn format Rust |
| **Bộ Unit Tests Rust** | `cargo test` | ✅ PASS (15/15) | 15 test suites: ZIP pack/unpack, Asset protocol, Library scan/cache, SQLite DDL/FTS5, SRS SM-2, Stats streak, Folder hierarchy |
| **Kiểm tra kiểu TypeScript** | `npm run typecheck` | ✅ PASS | 0 error |
| **Hợp đồng kênh IPC** | `node --import ./tools/register-test-hooks.mjs --test test/ipc-channels.test.mjs` | ✅ PASS (2/2) | Khớp 56/56 kênh IPC |
| **Bộ kiểm thử logic JS** | `npm test` | ✅ PASS (207/207) | Toàn bộ 207 tests logic frontend chạy xanh |
| **Đóng gói Frontend** | `node tools/build.mjs --shell=tauri` | ✅ PASS | Tạo `dist/app.js` và `dist/platform/tauri-api.js` |
| **Biên dịch Binary Tauri** | `cargo build` | ✅ PASS | Binary chạy được tạo tại `src-tauri/target/debug/turtle-deck` |

---

## 4. Danh Sách Kiểm Thử Rust Mới Được Bổ Sung Trong Giai Đoạn 3

1. `tests/sdeck_package_test.rs`:
   - `test_slugify_vietnamese_and_special_chars`: Chuyển đổi tên tiếng Việt có dấu, ký tự đặc biệt, dấu gạch nối và fallback tên rỗng.
   - `test_safe_entry_and_image_detection`: Xác thực đường dẫn an toàn trong ZIP, kiểm tra magic bytes của PNG, JPG, GIF, SVG và từ chối file lạ.
   - `test_write_and_read_package_roundtrip_with_prune`: Quy trình khép kín: đóng gói có prune ảnh rác $\rightarrow$ đọc nhanh metadata $\rightarrow$ giải nén trích xuất đầy đủ dữ liệu và ảnh hợp lệ.
2. `tests/asset_and_library_test.rs`:
   - `test_asset_protocol_security_and_content_delivery`: Kiểm tra phục vụ ảnh qua giao thức `asset://`, đúng MIME type, CSP header sandbox; chặn path traversal (`..`), chặn đọc `deck.json`.
   - `test_asset_service_operations`: Thêm ảnh từ byte, kiểm tra giới hạn 5 MB, danh sách và xóa ảnh trong gói.
   - `test_library_scan_and_cache`: Quét thư mục thư viện, phân nhóm theo thư mục con, bỏ qua file ẩn/.bak/.tmp và tái sử dụng cache hiệu quả.

---

## 5. Kế Hoạch Cho Giai Đoạn 4 (Import, Draft, Backup)

- Cài đặt `services/import_service.rs` & `commands/import.rs`: Nhập từ CSV, TSV, Markdown với cơ chế cấp phát token tạm thời chống traversal, tự động dọn temp imports theo TTL.
- Cài đặt `services/draft_service.rs` & `commands/draft.rs`: Quản lý tự lưu bản nháp của Editor (`saveDraft`, `deleteDraft`, `listDrafts`, `loadDraft`).
- Cài đặt `services/backup_service.rs` & `commands/backup.rs`: Tự động sao lưu hàng ngày (giữ tối đa 7 bản), sao lưu đầy đủ (zip DB + thư viện decks), khôi phục có xác thực tên bằng regex whitelist, dọn dẹp sao lưu tạm trước khi khôi phục (`pruneTemporaryDbBackups`).

