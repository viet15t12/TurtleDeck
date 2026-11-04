# Báo Cáo Nghiệm Thu Giai Đoạn 4: Import, Draft & Backup

- **Dự án:** Turtle Deck (Chuyển đổi từ Electron sang Tauri v2)
- **Nhánh thực hiện:** `tauri-migration`
- **Giai đoạn:** Giai đoạn 4 — Nhập dữ liệu hàng loạt (Import), Bản nháp (Draft), và Sao lưu / Khôi phục (Backup)
- **Trạng thái Gate 4:** ✅ **ĐẠT (PASSED)**
- **Thời gian nghiệm thu:** 04/11/2026

---

## 1. Mục tiêu Giai đoạn 4

Theo kế hoạch tại [TAURI_MIGRATION_PLAN.md](../plans/TAURI_MIGRATION_PLAN.md):
- **Nhập dữ liệu hàng loạt (Import Service):**
  - Hỗ trợ chọn file nguồn qua hộp thoại hệ thống (`import:pickFile`), cấp phát token bảo mật tạm thời `token`.
  - Cơ chế bảo mật (Issue 2): Chặn tuyệt đối renderer gửi đường dẫn tệp tuỳ ý `filePath` / `path` nếu không kèm theo `token` hợp lệ do backend cấp; từ chối token hết hạn.
  - Phân tích cú pháp linh hoạt: tự động nhận diện định dạng (`detect_import_format`), hỗ trợ CSV, TSV (có xử lý dấu nháy kép `""`, multiline trong ô), Quizlet, Markdown Vocab và Markdown Quiz.
  - Tự động chuẩn hoá và sinh ID từ vựng ổn định (`stable_vocab_id` bằng Sha256).
  - Thu thập và kiểm tra an toàn ảnh nguồn (`collect_import_assets`): kiểm tra kích thước $\le$ 5 MB, nhận diện magic bytes, ngăn chặn path traversal ra ngoài thư mục nguồn.
  - Quản lý phiên nhập tạm thời (`TempImportSession`), tự động dọn dẹp các token/phiên quá hạn dựa theo TTL 30 phút (`prune_temp_imports` - Issue 9).
  - Chuyển giao ảnh hợp lệ vào `PackageStore` khi hoàn tất nhập (`import:commit`).
- **Quản lý bản nháp Editor (Draft Service):**
  - Tự động lưu bản nháp (`draft:save`): làm sạch ID bằng `sanitize_draft_id` (chỉ giữ `[A-Za-z0-9._-]`, tối đa 80 ký tự), đóng gói `.sdeck` không prune ảnh rác và ghi kèm file siêu dữ liệu `{draftId}.json`.
  - Liệt kê danh sách bản nháp (`draft:list`): kiểm tra sự tồn tại của file gốc (`origFile`), so sánh `mtime` để cảnh báo tệp gốc đã bị chỉnh sửa ngoài (`origChanged: true`).
  - Nạp bản nháp (`draft:load`): mở gói thẻ vào bộ nhớ RAM, liên kết lại đường dẫn gốc `origFile` và thông tin gói thẻ.
  - Xoá bản nháp (`draft:delete`): dọn dẹp file `.sdeck` và `.json` tương ứng.
- **Sao lưu & Khôi phục hệ thống (Backup Service):**
  - Sao lưu tự động hàng ngày (`ensure_daily_backup`): tính toán `dayKey` theo múi giờ Asia/Saigon (+7h), xuất tiến độ học ra JSON và snapshot cơ sở dữ liệu SQLite qua `VACUUM INTO`, duy trì chính xác 7 ngày sao lưu gần nhất.
  - Sao lưu thủ công (`create_backup`): tạo tệp `progress-{dayKey}-manual-{timestamp}.json` và snapshot `.db`.
  - Danh sách bản sao lưu (`list_backups`): sắp xếp theo thời gian sửa đổi mới nhất.
  - Khôi phục tiến độ (`restore_backup`): xác thực tên tệp nghiêm ngặt bằng regex whitelist `^progress-[\w-]+\.json$` (Issue 11), tự động tạo bản sao lưu an toàn `pre-restore-{timestamp}.db` trước khi ghi đè dữ liệu.
  - Dọn dẹp sao lưu tạm thời (`prune_temporary_db_backups` - Issue 6): chỉ giữ tối đa $N$ bản `pre-import-*.db` và `pre-restore-*.db` mới nhất.
  - Sao lưu toàn bộ hệ thống (`create_full_backup`): đóng gói ZIP nén Deflate chứa toàn bộ cây thư mục bộ thẻ `.sdeck` trong thư viện, dump toàn bộ các bảng SQLite (`folders`, `deck_locations`, `decks`, `items`, `srs_cards`, `review_logs`, `item_meta`, `match_records`), `settings.json`, `progress.json` và `manifest.json`.
  - Khôi phục toàn bộ hệ thống (`restore_full_backup`): giải nén các tệp `.sdeck` về đúng vị trí cây thư mục, phục hồi toàn bộ cơ sở dữ liệu SQLite trong một transaction nguyên tử duy nhất có điều chỉnh đường dẫn tương ứng với thư viện hiện tại.
  - Mở thư mục sao lưu (`backup_open_folder`): tích hợp với file manager hệ thống (`xdg-open` / `explorer` / `open`).

---

## 2. Các hạng mục đã triển khai

### 2.1 Quản Lý Bản Nháp (`src-tauri/src/services/draft_service.rs` & `commands/draft.rs`)
- `sanitize_draft_id`: chuẩn hoá tên file an toàn.
- `save_draft`: ghi nguyên tử file nháp `.sdeck` và `{draftId}.json`.
- `list_drafts`: quét thư mục nháp, kiểm tra tệp gốc thay đổi ngoài đĩa.
- `load_draft`: nạp file nháp vào `PackageStore` và trả đầy đủ ngữ cảnh bộ thẻ.
- `delete_draft`: xoá sạch các file nháp khi người dùng đã lưu hoặc huỷ.

### 2.2 Dịch Vụ Nhập Dữ Liệu (`src-tauri/src/services/import_service.rs` & `commands/import.rs`)
- `import_pick_file`: hiển thị dialog chọn file nguồn, tạo token bảo mật ngẫu nhiên.
- `preview_import`: xác thực token, kiểm tra giới hạn 5 MB, phân tích dữ liệu phân cách (CSV/TSV/Markdown), chuẩn hoá từ vựng, thu thập ảnh và lưu session nhập.
- `commit_import`: trích xuất các ảnh đã được người dùng chọn vào `OpenPackage`.
- `prune_temp_imports`: dọn dẹp các token và session hết hạn theo TTL.

### 2.3 Quản Lý Sao Lưu & Khôi Phục (`src-tauri/src/services/backup_service.rs` & `commands/backup.rs`)
- `ensure_daily_backup` & `create_backup`: sao lưu kép gồm JSON tiến độ học và snapshot SQLite.
- `prune_temporary_db_backups`: giữ lại tối đa số lượng cấu hình của `pre-import-*.db` và `pre-restore-*.db`.
- `restore_backup`: kiểm tra tên hợp lệ qua whitelist, sao lưu phòng ngừa và nạp đè dữ liệu.
- `create_full_backup` & `restore_full_backup`: quy trình khép kín sao lưu và phục hồi 100% dữ liệu cây thư mục, gói thẻ và cơ sở dữ liệu phân cấp.

---

## 3. Kết Quả Kiểm Thử & Nghiệm Thu (Gate 4)

| Hạng mục kiểm tra | Lệnh thực hiện | Kết quả | Ghi chú |
|---|---|---|---|
| **Cú pháp Rust** | `cargo check --manifest-path src-tauri/Cargo.toml` | ✅ PASS | Biên dịch hoàn tất không lỗi |
| **Linting Rust** | `cargo clippy --manifest-path src-tauri/Cargo.toml -- -D warnings` | ✅ PASS | 0 warning, 0 error |
| **Định dạng code Rust** | `cargo fmt --manifest-path src-tauri/Cargo.toml -- --check` | ✅ PASS | Chuẩn format Rust |
| **Bộ Unit Tests Rust** | `cargo test --manifest-path src-tauri/Cargo.toml` | ✅ PASS (21/21) | 21 test suites: Import token security, CSV/TSV/Markdown parser, Temp import TTL, Draft lifecycle, Daily/manual backup retention, Full backup & restore roundtrip |
| **Kiểm tra kiểu TypeScript** | `npm run typecheck` | ✅ PASS | 0 error |
| **Hợp đồng kênh IPC** | `node --import ./tools/register-test-hooks.mjs --test test/ipc-channels.test.mjs` | ✅ PASS (2/2) | Khớp 56/56 kênh IPC |
| **Bộ kiểm thử logic JS** | `npm test` | ✅ PASS (207/207) | Toàn bộ 207 tests logic frontend chạy xanh |
| **Đóng gói Frontend** | `node tools/build.mjs --shell=tauri` | ✅ PASS | Tạo `dist/app.js` và `dist/platform/tauri-api.js` |
| **Biên dịch Binary Tauri** | `cargo build --manifest-path src-tauri/Cargo.toml` | ✅ PASS | Binary chạy được tạo tại `src-tauri/target/debug/turtle-deck` |

---

## 4. Danh Sách Kiểm Thử Rust Mới Được Bổ Sung Trong Giai Đoạn 4

1. `tests/draft_and_backup_test.rs`:
   - `test_draft_service_save_list_load_delete`: Kiểm tra quy trình lưu nháp $\rightarrow$ nhận diện file gốc thay đổi `origChanged` $\rightarrow$ nạp bản nháp gắn lại `origFile` $\rightarrow$ xoá bản nháp.
   - `test_backup_service_daily_and_manual_retention`: Kiểm tra regex whitelist cho tên file sao lưu, dọn dẹp các tệp `pre-import-*.db` và `pre-restore-*.db` cũ (giữ lại 3 bản mới nhất), tạo bản sao lưu thủ công, liệt kê danh sách và phục hồi dữ liệu.
   - `test_full_backup_roundtrip_with_folders_and_sdeck`: Khởi tạo cây thư mục phân cấp (`ToanHoc` $\rightarrow$ `DaiSo`) và bộ thẻ `.sdeck` trong DB và trên đĩa $\rightarrow$ xuất full backup `.turtlebackup` $\rightarrow$ xoá sạch đĩa và tạo DB trống $\rightarrow$ khôi phục hoàn chỉnh cây thư mục và file bộ thẻ.
2. `tests/import_test.rs`:
   - `test_import_token_security_and_preview`: Kiểm tra từ chối đường dẫn tuỳ ý từ webview khi không có token (Issue 2), từ chối token hết hạn/không tồn tại, và chấp nhận token hợp lệ cấp qua `set_temp_import`.
   - `test_import_csv_tsv_parser_and_assets`: Phân tích CSV/TSV phức tạp (dấu nháy kép, multiline, header mapping, deduplication), thu thập ảnh kèm kiểm tra magic bytes và giới hạn dung lượng, chuyển giao ảnh vào `OpenPackage` khi commit.
   - `test_temp_import_ttl_pruning`: Kiểm tra cơ chế tự động dọn dẹp token và session nhập dữ liệu tạm thời khi vượt quá TTL 30 phút (Issue 9).

---

## 5. Kế Hoạch Cho Giai Đoạn 5 (Lifecycle & Đóng Gói)

Theo kế hoạch tại [TAURI_MIGRATION_PLAN.md](../plans/TAURI_MIGRATION_PLAN.md):
- Single-instance plugin: ngăn chặn mở nhiều cửa sổ trùng lặp, chuyển đường dẫn file từ instance thứ hai sang instance thứ nhất và phát sự kiện `deck:openExternal`.
- Quản lý cửa sổ: ghi nhớ kích thước và vị trí cửa sổ, icon ứng dụng (`build/icons`), thiết lập `desktopName`.
- Cấu hình đóng gói `tauri.conf.json`:
  - Thiết lập targets: `appimage`, `rpm`, `deb` (Linux) và `nsis` (Windows).
  - Đăng ký file association cho đuôi `.sdeck` và MIME `application/x-studydeck`.
- Cấu hình tối ưu hoá kích thước release trong `Cargo.toml`: `opt-level = "s"`, `lto = true`, `codegen-units = 1`, `panic = "abort"`, `strip = true`.
- Kiểm thử toàn diện checklist nghiệm thu trên Linux và kiểm tra kích thước binary đạt mục tiêu G1 ($\le 40$ MiB unpacked, $\le 20$ MiB gói tải về).

