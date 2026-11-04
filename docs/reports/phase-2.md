# Báo Cáo Nghiệm Thu Giai Đoạn 2: Nền Tảng DB, Settings, Progress, Folder

- **Dự án:** Turtle Deck (Chuyển đổi từ Electron sang Tauri v2)
- **Nhánh thực hiện:** `tauri-migration`
- **Giai đoạn:** Giai đoạn 2 — Nền tảng: DB, Settings, Progress, Folder
- **Trạng thái Gate 2:** ✅ **ĐẠT (PASSED)**
- **Thời gian nghiệm thu:** 03/11/2026

---

## 1. Mục tiêu Giai đoạn 2

Theo kế hoạch tại [TAURI_MIGRATION_PLAN.md](../plans/TAURI_MIGRATION_PLAN.md):
- Port toàn bộ cấu trúc SQLite DDL (`schema.ts`), PRAGMA chuẩn, chỉ mục toàn văn FTS5 và triggers sang Rust (`src-tauri/src/db/schema.rs`).
- Chuyển đổi và bảo toàn dữ liệu tự động:
  - `migration.rs`: Tự động nạp `progress.json` của bản Electron vào SQLite trong 1 transaction an toàn, đổi tên thành `progress.json.migrated`.
  - `migration_folders.rs`: Quét thư viện đĩa và nạp cây thư mục phân cấp vào `folders` & `deck_locations`.
- Cài đặt đầy đủ các Repositories Rust (`src-tauri/src/db/repositories/`):
  - `srs.rs`: Quản lý thẻ SRS, thuật toán lặp lại ngắt quãng SM-2 (learning steps `[1, 10]`), ghi nhận ôn tập nguyên tử (atomic transaction `srs_cards` + `review_logs`), `item_meta` (sao & ghi chú).
  - `stats.rs`: Thống kê SQL hiệu năng cao, tính chuỗi học liên tiếp (streak) chuẩn xác qua nửa đêm theo múi giờ `Asia/Saigon` (+07:00), tỉ lệ ghi nhớ (retention breakdown), danh sách thẻ leech.
  - `match_repo.rs`: Quản lý và lưu trữ kỷ lục thời gian chế độ Match.
  - `folder.rs`: Quản lý cấu trúc cây thư mục tối đa 10 cấp (depth 0..9), đổi tên và di chuyển đệ quy con cháu an toàn.
  - `deck_location.rs`: Quản lý vị trí lưu trữ và liên kết symlink của bộ thẻ.
  - `deck.rs`: Đồng bộ hóa gói thẻ, tính hash SHA-256, cache `items` và tìm kiếm FTS5.
- Cài đặt các Services tầng ứng dụng (`src-tauri/src/services/`):
  - `settings_service.rs`: Nạp/lưu cấu hình `settings.json` nguyên tử, tự động chuẩn hóa giá trị mặc định và sao lưu khi file lỗi.
  - `progress_service.rs`: Nạp, lưu, xuất file tiến độ ra JSON và áp dụng nhập dữ liệu (kèm tự động sao lưu SQLite trước khi nhập).
  - `folder_service.rs`: Xác thực ký tự thư mục, giới hạn độ sâu và đồng bộ với hệ thống tệp đĩa.
  - `deck_location_service.rs`: Di chuyển file vật lý, tạo symlink và cập nhật đường dẫn bộ thẻ.
- Kích hoạt và kết nối các IPC commands Tauri tương ứng:
  - `settings_load`, `settings_save`
  - `progress_load`, `progress_save`, `progress_export`, `progress_pick_import`, `progress_apply_import`
  - `folder_create`, `folder_rename`, `folder_move`, `folder_delete`, `folder_get_tree`
  - `deck_move`, `deck_link`, `deck_unlink`, `deck_get_locations`
  - `srs_get_deck_summary`, `srs_get_due_items`, `srs_record_review`, `srs_get_card`
  - `meta_get`, `meta_set_starred`, `meta_set_note`
  - `stats_get_deck_report`, `stats_get_overall_streak`
  - `deck_query_items` (FTS5 search)

---

## 2. Các hạng mục đã triển khai

### 2.1 Cơ sở dữ liệu SQLite (`src-tauri/src/db/`)
- **`schema.rs`:** DDL 8 bảng và virtual table FTS5 (`decks`, `items`, `srs_cards`, `review_logs`, `item_meta`, `match_records`, `folders`, `deck_locations`, `items_fts` với tokenizer `unicode61 remove_diacritics 2`), cùng bộ 3 triggers duy trì FTS (`trg_items_ai`, `trg_items_ad`, `trg_items_au`).
- **`migration.rs`:** Đọc dữ liệu `progress.json` cũ, phân tách khóa thẻ `deckId:itemId:direction`, chuyển đổi xếp hạng rating (1..4 / text), nạp thẻ SRS, log và meta trong 1 transaction duy nhất. Đổi tên thành `progress.json.migrated` sau khi hoàn tất.
- **`migration_folders.rs`:** Quét cây thư mục đĩa đệ quy (độ sâu tối đa 9), tự động sinh UUID v4 cho các thư mục mới, phát hiện file `.sdeck` và gắn vào `deck_locations`.
- **`mod.rs`:** Hàm tiện ích `open_or_create(db_path)` và `open_in_memory()` áp dụng chuẩn PRAGMA WAL, foreign keys, cache size và busy timeout.

### 2.2 Tầng Repositories (`src-tauri/src/db/repositories/`)
- **`srs.rs`:**
  - Cài đặt thuật toán SM-2 scheduling với các trạng thái `new`, `learning`, `review`, `relearning`.
  - Transaction nguyên tử đồng thời cập nhật trạng thái thẻ và thêm bản ghi nhật ký `review_logs`.
  - Tổng hợp thẻ đến hạn ôn tập (`get_due_cards`), thẻ theo trạng thái (`get_summary`), xuất và nhập tiến độ tương thích chuẩn định dạng `LegacyProgressData`.
- **`stats.rs`:**
  - Thuật toán chuyển đổi ngày Dương lịch (Hinnant algorithm) chuẩn xác tuyệt đối không phụ thuộc thư viện ngày tháng ngoài.
  - Tính chuỗi ngày học liên tiếp (`get_overall_streak`) chuẩn xác qua mốc nửa đêm theo múi giờ Việt Nam `Asia/Saigon` (+07:00), giữ chuỗi khi hôm nay chưa học nếu hôm qua đã học.
  - Phân tích độ ghi nhớ `get_retention_breakdown`, biểu đồ lịch sử theo ngày `get_daily_activity`, lọc thẻ leech (`get_leech_cards`).
- **`folder.rs` & `deck_location.rs`:**
  - Cây thư mục lồng nhau, kiểm tra độ sâu $\le 9$ (tối đa 10 cấp), chặn vòng lặp di chuyển vào con cháu, tự động cập nhật đường dẫn con cháu khi đổi tên hoặc di chuyển cha.
- **`deck.rs`:**
  - Tính hash SHA-256 nội dung deck, cập nhật cache bảng `items`, tự động đồng bộ chỉ mục FTS5 và tìm kiếm từ khóa không dấu.
- **`match_repo.rs`:**
  - Lưu và truy vấn thời gian ngắn nhất của chế độ Match theo `deck_id`.

### 2.3 Tầng Dịch Vụ & Commands (`src-tauri/src/services/` & `src-tauri/src/commands/`)
- `settings_service.rs` & `commands/settings.rs`: Nạp và lưu cài đặt nguyên tử (atomic write qua file tạm).
- `progress_service.rs` & `commands/progress.rs`: Hỗ trợ dialog chọn file lưu/nhập tiến độ qua `tauri_plugin_dialog`.
- `folder_service.rs`, `deck_location_service.rs` & `commands/folder.rs`: Quản lý thư mục và liên kết bộ thẻ.
- `commands/srs.rs` & `commands/stats.rs`: Khởi tạo và liên kết các truy vấn SRS và Thống kê trực tiếp với SQLite.
- `commands/deck.rs`: Hoàn thiện lệnh `deck_query_items` sử dụng truy vấn FTS5.

---

## 3. Kết Quả Kiểm Thử & Nghiệm Thu (Gate 2)

| Hạng mục kiểm tra | Lệnh thực hiện | Kết quả | Ghi chú |
|---|---|---|---|
| **Cú pháp Rust** | `cargo check` | ✅ PASS | Biên dịch hoàn tất không lỗi |
| **Linting Rust** | `cargo clippy -- -D warnings` | ✅ PASS | 0 warning, 0 error |
| **Định dạng code Rust** | `cargo fmt -- --check` | ✅ PASS | Chuẩn format Rust |
| **Bộ Unit Tests Rust (MỚI)** | `cargo test` | ✅ PASS (9/9) | 9 test suites: SQLite DDL, FTS5, SRS SM-2, Stats streak, Folder hierarchy, Migrations |
| **Kiểm tra kiểu TypeScript** | `npm run typecheck` | ✅ PASS | 0 error |
| **Hợp đồng kênh IPC** | `npm run test` (ipc-channels) | ✅ PASS (2/2) | Khớp 56/56 kênh IPC |
| **Bộ kiểm thử logic JS** | `npm test` | ✅ PASS (207/207) | Toàn bộ 207 tests logic frontend chạy xanh |
| **Build Frontend Tauri** | `node tools/build.mjs --shell=tauri` | ✅ PASS | Đóng gói `dist/app.js` và `dist/platform/tauri-api.js` thành công |
| **Build Binary Tauri** | `cargo build` | ✅ PASS | Binary chạy được tạo tại `src-tauri/target/debug/turtle-deck` |

---

## 4. Danh Sách Kiểm Thử Rust Tương Đương Đã Hoàn Thành

1. `tests/sqlite_repo_test.rs`:
   - `test_database_init_pragma_and_schema`: Khởi tạo DB, PRAGMAs, 8 bảng chính và virtual table FTS5.
   - `test_deck_repository_sync_hash_fts_query_and_item_removal`: Đồng bộ deck, kiểm tra hash SHA-256, tìm kiếm FTS5 tiếng Việt bỏ dấu, xoá item khỏi deck nhưng bảo toàn 100% tiến độ SRS.
   - `test_match_repository`: Lưu trữ và cập nhật kỷ lục Match khi đạt thời gian tốt hơn.
2. `tests/migration_test.rs`:
   - `test_migrate_legacy_progress_format_and_idempotence`: Di chuyển dữ liệu từ `progress.json` vào SQLite trong 1 transaction, đổi tên file thành `.migrated`, kiểm tra tính idempotent.
3. `tests/folder_service_test.rs`:
   - `test_folder_service_create_rename_move_delete`: Tạo, đổi tên, di chuyển, xóa thư mục, đồng bộ thư mục đĩa và cập nhật đường dẫn con cháu.
   - `test_folder_service_validate_depth`: Kiểm tra giới hạn 10 cấp thư mục (depth 0..9) và chặn di chuyển vượt quá giới hạn.
4. `tests/folder_migration_test.rs`:
   - `test_folder_migration_from_disk_and_srs_preservation`: Quét thư viện đĩa có file `.sdeck` mẫu, tạo thư mục và vị trí lưu trữ, bảo toàn tiến trình học.
5. `tests/stats_test.rs`:
   - `test_stats_overall_streak_across_midnight_in_asia_saigon`: Kiểm tra streak qua nửa đêm ở múi giờ Việt Nam `Asia/Saigon` (+07:00), giữ chuỗi khi hôm nay chưa học nếu hôm qua đã học.
   - `test_stats_daily_activity_retention_and_leeches`: Phân tích tỉ lệ ghi nhớ, biểu đồ theo ngày và trích xuất thẻ leech.

---

## 5. Kế Hoạch Cho Giai Đoạn 3 (Deck, .sdeck, Asset Protocol, Library Watcher)

- Cài đặt `services/package_store.rs`: Đọc/ghi file `.sdeck` (định dạng ZIP), giải nén, ghi tạm và ghi đè nguyên tử, dọn bản nháp.
- Cài đặt các commands bộ thẻ: `deck_open`, `deck_new`, `deck_save`, `deck_close`, `deck_duplicate`, `deck_import`, `deck_import_sdeck`, `deck_export_copy`, `deck_show_in_folder`.
- Cài đặt `services/asset_protocol.rs`: Đăng ký custom URI scheme `asset://<deckKey>/<path>`, chặn path traversal, chặn `deck.json`.
- Cài đặt các commands asset: `asset_add`, `asset_add_bytes`, `asset_list`, `asset_remove`.
- Cài đặt `services/watcher.rs`: Sử dụng crate `notify` để tự động theo dõi thay đổi thư mục thư viện và phát sự kiện `deck:fileAdded`, `deck:fileRemoved`, `deck:changed`.

