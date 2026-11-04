# Kế hoạch chuyển Turtle Deck từ Electron sang Tauri v2 (thời hạn: 7 ngày)

> Tài liệu cho người/AI thực hiện. Làm **đúng thứ tự giai đoạn**, mỗi giai đoạn = 1+ commit, qua cổng nghiệm thu (✅ Gate) mới được sang giai đoạn tiếp theo.

---

## 0. Mục tiêu & phi mục tiêu

### Mục tiêu
| # | Mục tiêu | Số đo nghiệm thu |
|---|---|---|
| G1 | Giảm dung lượng cài đặt | Từ **329 MiB** → **≤ 40 MiB** (unpacked); gói tải về **≤ 20 MiB** |
| G2 | Giảm RAM & khởi động | RAM idle ≤ 100 MB; cửa sổ hiện trong ≤ 0.5 s |
| G3 | **Giữ nguyên UI** | Tái dùng 100% `src/styles/*`, `src/views/*`, `src/app/*`, `src/core/*` (JS thuần) |
| G4 | **Giữ nguyên dữ liệu người dùng** | Mở được `studyapp.db`, `settings`, `.sdeck`, bản nháp, bản sao lưu cũ của bản Electron |
| G5 | Giữ nguyên hành vi | Mọi tính năng ở mục 6 (checklist) chạy đúng trên Linux + Windows |

### Phi mục tiêu (KHÔNG làm trong 1 tuần này)
- Không viết lại UI, không đổi framework, không đổi class CSS, không dịch lại chuỗi tiếng Việt.
- Không hỗ trợ macOS/auto-update (để sau).
- Không đổi định dạng `.sdeck` / schema SQLite (chỉ thêm, không đổi cột).
- Không xoá Electron cho tới khi qua Gate cuối (Giai đoạn 6).

---

## 1. Hiện trạng đã khảo sát (số liệu thật từ repo)

- Main process: **~5.400 dòng TS** (`src/main/**`), **66 kênh IPC** (`src/core/types/ipc.types.ts`), mỗi nhóm có file `*.ipc.ts` riêng.
- Renderer chỉ giao tiếp qua **`window.api`** (định nghĩa ở `preload.ts`) → đây là **ranh giới chuyển đổi**: giữ nguyên chữ ký `window.api`, đổi phần ruột sang `invoke` của Tauri.
- Điểm sinh ra 329 MiB: Chromium (224 MiB) + ICU/GPU/pak (~45 MiB) + `app.asar*` (57 MiB, trong đó `better-sqlite3` mang cả mã nguồn C++ và prebuild mọi OS ~20 MiB). Tauri bỏ hết phần này.
- CSS: dùng `color-mix` (36 chỗ), `::-webkit-scrollbar` (2 chỗ) → **WebKitGTK ≥ 2.38 hỗ trợ** (máy dev có 2.54, OK). Không dùng `:has`, `backdrop-filter`, `@container`.
- JS dùng `speechSynthesis` (10 chỗ, `src/tts.js`, `src/core/ttsvoice.js`) → **rủi ro số 1** trên Linux (xem mục 7).
- Có bộ test: ~206 test (`npm test`), nhiều test chạy logic thuần → giữ làm "hợp đồng hành vi" cho bản Rust.

---

## 2. Kiến trúc đích

```
┌──────────────────────────── Webview (WebKitGTK / WebView2) ───────────────────────────┐
│  src/index.html, src/styles/*, src/views/*, src/app/*, src/core/*.js  (GIỮ NGUYÊN)    │
│            window.api  ← src/platform/tauri-api.js  (MỚI, thay preload.ts)            │
└───────────────────────────────────────┬────────────────────────────────────────────────┘
                                        │ invoke / events
┌───────────────────────────────────────▼────────────────────────────────────────────────┐
│  src-tauri/  (Rust)                                                                    │
│   commands/  deck, asset, progress, settings, import, library, draft, backup, folder   │
│   db/        rusqlite (bundled) + schema + migration + repositories (srs/deck/stats/…) │
│   services/  package_store (zip), watcher (notify), asset protocol, single-instance    │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

### Nguyên tắc chia việc Rust ↔ JS (để rút ngắn thời gian)
| Việc | Nằm ở | Lý do |
|---|---|---|
| I/O file, zip `.sdeck`, SQLite, watcher, dialog, protocol `asset://`, single-instance | **Rust** | Cần quyền hệ thống |
| Logic thuần (SRS, grader, planner, validate, parser, hash, builder, stats thuần) | **JS giữ nguyên** (`src/core`) chạy trong webview | Đã có test, khỏi port |
| Repository SQL (`srs.repo`, `deck.repo`, `stats.repo`, `folder.repo`, …) | **Rust** (port 1-1 câu SQL) | Truy cập DB |

> Nếu một command Rust hiện đang gọi logic thuần từ `src/core` (vd. `validateDeck`, `parseDeck`, `hash`), **trả dữ liệu thô (bytes/JSON string) về JS** để JS parse/validate, thay vì port sang Rust. Chỉ port sang Rust nếu benchmark cho thấy cần.

---

## 3. Tái sử dụng CSS & UI hiện tại

| Hạng mục | Cách xử lý |
|---|---|
| `src/styles/*.css`, `src/styles.css`, `src/vendor/katex/*` | **Copy nguyên**, không sửa. `frontendDist` trỏ thẳng vào thư mục build renderer |
| `src/index.html` | Giữ; chỉ **sửa CSP** để cho phép `asset:` / `ipc:` / `http://ipc.localhost` (xem mục 4.2) |
| Font (KaTeX fonts, font hệ thống) | Giữ; kiểm tra render trên WebKitGTK |
| `::-webkit-scrollbar` | WebKitGTK hỗ trợ; nếu thiếu thì thêm `scrollbar-width: thin` song song |
| `theme-init.js`, `localStorage` | Giữ nguyên (Tauri có localStorage theo app) |
| Hiệu ứng | Kiểm tra bằng mắt từng màn: home, deck, session, editor, stats, settings, learn, match, exam |

Việc cần làm cho CSS: **chỉ kiểm thử thị giác**, lập bảng "màn hình × (Linux/Windows) × OK/lỗi" trong `docs/tauri-visual-qa.md`. Lỗi nào đặc thù WebKit thì vá bằng 1 file `src/styles/webkit-fixes.css` (không sửa file gốc).

---

## 4. Thiết kế chi tiết các phần nhạy cảm

### 4.1 Lớp tương thích `window.api`
- Tạo `src/platform/tauri-api.js` (JS thuần) export đúng object `api` như `preload.ts` (mọi tên hàm giữ nguyên: `openDecks`, `saveDeck`, `recordReview`, `onDeckChanged`, …).
- Cơ chế: `invokeTyped(channel, data)` → `invoke('ipc', { channel, data })`? **Không** — dùng **1 command / 1 kênh**: tên command = kênh với `:` → `_` (`deck:open` → `deck_open`). Giữ bảng ánh xạ trong `src/platform/channels.js`.
- `onEvent(channel, cb)` → `listen(channel, e => cb(e.payload))`, trả về hàm huỷ đăng ký.
- `platform` = `navigator.userAgent`/`@tauri-apps/plugin-os`.
- Chọn shell lúc build: `index.html` nạp `./platform/electron-shim.js` (không làm gì, `window.api` do preload cấp) **hoặc** `./platform/tauri-api.js` — để chạy song song được hai bản.
- Test hợp đồng: `test/ipc-channels.test.mjs` hiện có → mở rộng để kiểm tra **mọi kênh trong `ipc.types.ts` đều có command Rust và có ánh xạ**.

### 4.2 Bảo mật (CSP, capability, protocol)
- CSP đích: `default-src 'self' asset: ipc: http://ipc.localhost; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' asset: data:; font-src 'self' data:; object-src 'none'; base-uri 'none'; frame-src 'none'`.
- Capability tối thiểu (`src-tauri/capabilities/default.json`): chỉ `core:default`, `dialog:default`, `shell:allow-open` (mở thư mục), `single-instance`. **Không** bật `fs:*` cho webview — mọi file I/O đi qua command Rust có kiểm tra đường dẫn.
- Port các kiểm tra bảo mật hiện có (đã có test Issue 1–14 trong `test/bugfixes.test.mjs`): chống path traversal (`isPathInsideRoot`), whitelist đuôi ảnh, whitelist tên backup (regex), token xác thực cho `import:preview`, kiểm tra sender frame.
- Protocol `asset://<deckKey>/<path>`: đăng ký bằng `register_uri_scheme_protocol("asset", …)`; trả đúng `Content-Type`, chặn `deck.json`, deckKey lạ, `..`; thêm header `Content-Security-Policy: sandbox`. Logic tham chiếu: `src/core/assetprotocol.js` + `src/main/services/asset-protocol.ts`.

### 4.3 SQLite
- Crate: `rusqlite` với feature `bundled` (không phụ thuộc sqlite hệ thống) + `serde`, `serde_json`.
- PRAGMA y hệt `src/main/db/index.ts`: `journal_mode=WAL`, `synchronous=NORMAL`, `foreign_keys=ON`, `temp_store=MEMORY`, `cache_size=-32000`, `busy_timeout=5000`.
- Port `schema.ts`, `migration.ts`, `migration-folders.ts` **nguyên văn câu SQL**. File DB dùng chung đường dẫn dữ liệu của bản Electron (`<userData>/studyapp.db`) → xem 4.5.
- FTS5: bật `bundled` có sẵn FTS5; kiểm tra test `DeckRepository ... FTS`.
- Một `Mutex<Connection>` trong `State`, hoặc pool nhỏ; thao tác nặng chạy `spawn_blocking`.

### 4.4 Watcher, single-instance, mở file `.sdeck`
- Watcher: crate `notify` (+ debounce) thay `watcher-service.ts`; phát event `deck:fileAdded|fileRemoved|changed|watchError`.
- `tauri-plugin-single-instance`: instance thứ hai chuyển đường dẫn file cho instance đầu → emit `deck:openExternal`.
- File association `.sdeck` + MIME `application/x-studydeck`: cấu hình ở `bundle.fileAssociations` (Linux .desktop, Windows registry).

### 4.5 Tương thích dữ liệu bản cũ (BẮT BUỘC)
- `identifier`: `com.turtledeck.app` (giống `appId` hiện tại).
- Đường dẫn dữ liệu Electron (Linux): `~/.config/Turtle Deck/` (kiểm tra thực tế `app.getPath('userData')` trong `src/main/app/paths.ts`). Rust phải **dùng đúng thư mục này** (tự tính: `dirs::config_dir()/"Turtle Deck"`), không dùng thư mục mặc định của Tauri, để người dùng cũ không mất dữ liệu.
- Kiểm thử bắt buộc: copy 1 thư mục dữ liệu thật từ bản Electron → chạy bản Tauri → mọi thứ hiện đủ (thư mục, bộ thẻ, tiến độ, thống kê, bản nháp, sao lưu).
- Backup: `backup-service` (461 dòng) xử lý zip + `VACUUM INTO`/`db.backup`; trong Rust dùng `rusqlite::backup` hoặc `VACUUM INTO`.

---

## 5. Lộ trình 7 ngày

> Ước lượng cho 1 người làm toàn thời gian (hoặc 1 người + 1 AI). **Ngày 7 là đệm**. Nếu trễ, cắt theo mục 9.

### Giai đoạn 0 — Spike & quyết định Go/No-Go (Ngày 1, buổi sáng, ~4 giờ)
**Mục tiêu:** chứng minh các rủi ro lớn không chặn đường.
Việc cần làm:
1. `npm i -D @tauri-apps/cli@^2` ; `npx tauri init` → tạo `src-tauri/` (`identifier: com.turtledeck.app`, `frontendDist: ../dist`, không devUrl).
2. Cài thiếu: `sudo dnf install webkit2gtk4.1-devel libappindicator-gtk3-devel librsvg2-devel` (nếu thiếu header) — máy hiện có runtime `webkit2gtk4.1`, **cần kiểm tra thêm gói `-devel`**.
3. Cho webview nạp `dist/index.html` hiện tại, `window.api` giả (stub trả dữ liệu rỗng) → app lên được màn Home.
4. Kiểm 5 điểm rủi ro: (a) `color-mix` & giao diện đúng; (b) KaTeX hiển thị công thức; (c) Chart.js; (d) **`speechSynthesis` có phát tiếng/`getVoices()` có giọng không**; (e) kéo-thả file/thư mục & clipboard.
5. Đo: kích thước binary release (`cargo tauri build`), thời gian mở.

✅ **Gate 0:** Home render đúng; KaTeX + Chart OK; kết luận về TTS (OK / cần phương án thay — mục 7); binary ≤ 20 MiB. Nếu TTS không dùng được và không có phương án → báo lại để quyết định, **không tự bỏ tính năng**.

### Giai đoạn 1 — Khung + lớp `window.api` + CI build (Ngày 1 chiều)
Việc cần làm:
1. `src-tauri/Cargo.toml`: `tauri 2`, `tauri-plugin-dialog`, `tauri-plugin-shell` (chỉ open), `tauri-plugin-single-instance`, `rusqlite{bundled}`, `serde`, `serde_json`, `notify`, `zip`, `sha2`, `thiserror`, `dirs`, `tokio`.
2. Cấu trúc module Rust: `main.rs`, `lib.rs`, `state.rs`, `error.rs`, `paths.rs`, `commands/*.rs`, `db/*.rs`, `services/*.rs`.
3. Tạo `src/platform/tauri-api.js` + `channels.js` (mục 4.1); sửa `tools/build.mjs` thêm cờ `--shell=tauri|electron` (mặc định electron, **không phá bản cũ**).
4. Lỗi chuẩn hoá: `Result<T, AppError>` serialize về `{ ok:false, error }` giống `getFallbackErrorResponse` (kênh mảng trả `[]`).
5. Scripts: `"tauri:dev"`, `"tauri:build"`.
6. GitHub Actions (`.github/`): job build Linux + Windows cho Tauri (cache cargo).

✅ **Gate 1:** `npm run tauri:dev` mở app, mọi lời gọi `window.api.*` chưa cài đặt trả lỗi rõ ràng "chưa hỗ trợ" (không crash).

### Giai đoạn 2 — Nền tảng: DB, Settings, Progress, Folder (Ngày 2)
Port theo thứ tự (mỗi mục: code Rust + test Rust tương đương test JS hiện có):
1. `paths.rs`, `settings-service`, `progress-service` (`settings:load/save`, `progress:*`).
2. `db/` : `schema`, `migration`, `migration-folders`, PRAGMA.
3. Repositories: `srs.repo` (393 dòng, giữ **transaction atomic card+log**), `stats.repo` (múi giờ Asia/Saigon, streak qua nửa đêm), `match.repo`, `folder.repo`, `deck-location.repo`.
4. Commands: `srs_*`, `stats_*`, `meta_*`, `folder_*`.

Tham chiếu test: `test/sqlite-repo.test.mjs`, `migration.test.mjs`, `folder-service.test.ts`, `folder-migration.test.ts`, `stats.test.mjs`.

✅ **Gate 2:** Test Rust (`cargo test`) tương đương đạt; mở DB thật từ bản Electron không lỗi migration; màn Home (cây thư mục), Stats, Settings hoạt động.

### Giai đoạn 3 — Bộ thẻ, `.sdeck`, asset protocol (Ngày 3–4)
1. `package_store` / `deck-service`: đọc/ghi `.sdeck` (zip, crate `zip`), ghi `.bak`, dọn bản nháp, ghi nguyên tử (tmp + rename).
2. `deck_open` (mảng đường dẫn, không bật dialog), `deck_new`, `deck_save`, `deck_close`, `deck_duplicate`, `deck_import`, `deck_importSdeck`, `deck_showInFolder`, `deck_exportCopy`, `deck_queryItems` (FTS).
3. `asset_*` (add/addBytes/list/remove) + giới hạn ảnh 5 MB, whitelist đuôi.
4. Protocol `asset://` (mục 4.2).
5. `deck_move/link/unlink/getLocations` (port `deck-location-service`, 304 dòng) + `library_*` (quét thư viện, cache theo mtime+size, bỏ qua file ẩn/.bak/.tmp).
6. `watcher` bằng `notify` (đệ quy, `closeAll`).
7. Tham số: phần parse/validate/hash vẫn có thể gọi từ JS (mục 2); nếu Rust cần `meta.id`/hash thì đọc `deck.json` bằng `serde_json` và tính SHA như `src/core/hash.ts` (đối chiếu bằng test vector chung).

Tham chiếu test: `characterization.test.mjs`, `asset.test.mjs`, `library.test.mjs`, `sdeck.test.mjs`, `bugfixes.test.mjs`, `deck-location-service.test.ts`.

✅ **Gate 3:** Mở/lưu/nhân bản/nhập `.sdeck`, ảnh hiện trong thẻ, quét thư viện, kéo-thả di chuyển bộ thẻ, watcher cập nhật khi thêm/xoá file; **Editor lưu & học thử chạy**.

### Giai đoạn 4 — Import, Draft, Backup (Ngày 5 sáng)
1. `import_pickFile / preview / commit` (CSV/TSV/Markdown): giữ cơ chế **token** (không nhận `filePath` tuỳ ý từ renderer), dọn temp import theo TTL.
2. `draft_*` (autosave, liệt kê, khôi phục).
3. `backup_*`: sao lưu hằng ngày giữ 7 bản; sao lưu đầy đủ (zip DB + decks); khôi phục có kiểm tra tên bằng regex whitelist; `pruneTemporaryDbBackups` giữ N bản.
4. `progress_export / pickImport / applyImport`.

Tham chiếu test: `full-backup-service.test.ts`, `progressio.test.mjs`, `bugfixes.test.mjs` (Issue 2, 5, 6, 9, 11).

✅ **Gate 4:** Sao lưu → khôi phục vòng tròn không mất dữ liệu; nhập CSV; khôi phục bản nháp sau khi tắt đột ngột.

### Giai đoạn 5 — Vòng đời ứng dụng & đóng gói (Ngày 5 chiều – Ngày 6)
1. Single-instance, mở file ngoài (`argv`), sự kiện `app:ready` → flush hàng đợi `deck:openExternal`.
2. Cửa sổ: kích thước/vị trí nhớ lại, icon (`build/icons`), `desktopName`, menu (nếu bản Electron có menu), Esc/phím tắt toàn cục vẫn do `src/shortcuts.js`.
3. `tauri.conf.json` → `bundle`: targets `appimage`, `rpm`, `deb`, `nsis` (Windows); `fileAssociations` `.sdeck`; `category: Education`; `shortDescription` tiếng Việt.
4. Rút gọn: `profile.release { opt-level="s", lto=true, codegen-units=1, panic="abort", strip=true }`.
5. Chạy checklist đầy đủ (mục 6) trên Linux; build + chạy thử trên Windows (CI hoặc VM).

✅ **Gate 5:** Gói cài Linux (AppImage + rpm) cài và chạy; kích thước đạt G1; `.sdeck` double-click mở đúng bộ thẻ.

### Giai đoạn 6 — Kiểm thử cuối, dọn dẹp, tài liệu (Ngày 7 — đệm)
1. Sửa lỗi còn lại từ checklist, lỗi CSS đặc thù WebKit (`webkit-fixes.css`).
2. Đo lại G1/G2, ghi bảng so sánh vào README.
3. Cập nhật `README.md`, `.github` workflow, ghi hướng dẫn `docs/tauri-dev.md` (cài `webkit2gtk4.1-devel` …).
4. **Chỉ khi toàn bộ Gate đạt**: tách PR riêng gỡ Electron (`electron`, `electron-builder`, `better-sqlite3`, `preload.ts`, `src/main/**`, script `dist*`). Nếu chưa tự tin: giữ Electron thêm 1 bản phát hành.

✅ **Gate cuối:** mục 6 đạt 100% trên Linux; Windows đạt các mục lõi (A–F).

---

## 6. Checklist nghiệm thu chức năng (thử tay + test tự động)

- [ ] A. Khởi động: mở app < 0.5 s, nạp settings/progress, tự nạp lại bộ thẻ đã mở
- [ ] B. Home: cây thư mục, tạo/đổi tên/di chuyển/xoá thư mục, kéo-thả bộ thẻ/thư mục, tìm kiếm bỏ dấu, lọc, sắp xếp, ghim
- [ ] C. Bộ thẻ: mở, tạo mới, nhân bản, nhập `.sdeck`, xuất bản sao, mở trong thư mục
- [ ] D. Học: session (single/multi/fill/command/card/vocab), SRS ghi review, sao/ghi chú, chấm lại đúng, Học thử không lưu
- [ ] E. Chế độ khác: Learn, Match (kỷ lục thời gian), Exam
- [ ] F. Thống kê: biểu đồ, heatmap 90 ngày, streak, leech
- [ ] G. Editor: thêm/sửa/xoá/đổi dạng, undo/redo, ảnh (thêm từ file, dán bytes), nhập hàng loạt, tự lưu nháp + khôi phục
- [ ] H. Markdown + KaTeX + ảnh `asset://` hiển thị đúng; chặn `javascript:`/`http:` trong ảnh
- [ ] I. TTS (đọc từ vựng, chọn giọng) — theo kết luận Gate 0
- [ ] J. Backup: hằng ngày (giữ 7), thủ công, đầy đủ, khôi phục, xuất/nhập tiến độ
- [ ] K. Thư viện: đặt thư mục, quét, watcher thêm/xoá file
- [ ] L. Single-instance + mở `.sdeck` từ file manager
- [ ] M. Dữ liệu cũ từ bản Electron mở được nguyên vẹn
- [ ] N. Bảo mật: path traversal, deck.json qua `asset://`, `import:preview` với filePath lạ đều bị chặn
- [ ] O. `npm test` (logic JS) + `cargo test` đều xanh

---

## 7. Rủi ro & phương án

| Rủi ro | Mức | Phương án |
|---|---|---|
| **`speechSynthesis` không hoạt động trên WebKitGTK** (cần `speech-dispatcher`; giọng có thể trống) | **Cao** | Gate 0 kiểm. Nếu lỗi: (1) yêu cầu `speech-dispatcher` là dependency của gói rpm/deb; hoặc (2) command Rust `tts_speak` gọi `spd-say`/SAPI (Windows) với cùng giao diện `ttsvoice.js`; hoặc (3) tắt TTS có thông báo rõ. |
| Khối lượng port Rust (~5.4k dòng TS) trong 7 ngày | Cao | Giữ logic thuần ở JS (mục 2); port SQL nguyên văn; dùng test hiện có làm đặc tả; cắt phạm vi theo mục 9 |
| Khác biệt render WebKit vs Chromium | Trung bình | QA thị giác sớm (Gate 0, Gate 3); `webkit-fixes.css` |
| Mất dữ liệu người dùng cũ | Cao | Mục 4.5; bắt buộc test với bản sao dữ liệu thật; không đổi schema |
| WebView2 chưa có trên Windows cũ | Thấp | NSIS `webviewInstallMode: downloadBootstrapper` |
| Hiệu năng thấp hơn kỳ vọng ở WebKit | Thấp–TB | Đo bằng `test/perf-1000-cards.test.mjs` logic; xem `PERF`/kế hoạch tối ưu JS riêng |
| `perf-1000-cards` đang đỏ (validateDeck 514 ms > 500 ms) | Đã biết | Sửa riêng, **không** thuộc phạm vi chuyển đổi nhưng cần trước Gate cuối |

---

## 8. Yêu cầu dành cho người code

1. Không sửa file UI/CSS gốc trừ khi bắt buộc; mọi vá lỗi WebKit đặt ở file mới.
2. Mỗi giai đoạn: 1+ commit nhỏ, thông điệp `tauri(gđN): …`; chạy `npm test`, `npm run typecheck`, `cargo test`, `cargo clippy -- -D warnings`, `cargo fmt --check` trước khi commit.
3. Mọi command Rust: tham số/kết quả khớp **chính xác** `src/core/types/ipc.types.ts` (camelCase qua `#[serde(rename_all="camelCase")]`).
4. Không dùng `unwrap()`/`expect()` ở đường chạy thật; trả `AppError` có thông điệp tiếng Việt thân thiện như bản hiện tại.
5. Mọi đường dẫn nhận từ webview phải được chuẩn hoá và kiểm tra nằm trong thư mục cho phép.
6. Mỗi file mới có dòng comment đầu file: đường dẫn + 1 câu trách nhiệm (đúng phong cách repo). Giữ nguyên toàn bộ comment/chuỗi tiếng Việt có sẵn.
7. Không thêm crate/package ngoài danh sách ở Giai đoạn 1 nếu chưa ghi lý do vào `docs/tauri-dev.md`.
8. Cuối mỗi ngày cập nhật bảng tiến độ ở mục 10.

---

## 9. Nếu trễ tiến độ — thứ tự cắt (từ ít quan trọng nhất)

1. Windows: để sau, chỉ phát hành Linux trước.
2. Full backup/restore (`backup_createFull/restoreFull`) → giữ bản Electron cho tính năng này (không khả thi nếu đã gỡ Electron → hoãn việc gỡ).
3. Import hàng loạt CSV/Markdown.
4. Watcher đệ quy (thay bằng quét lại khi mở app).
5. **Không cắt:** DB/SRS/Stats, mở/lưu `.sdeck`, asset protocol, tương thích dữ liệu cũ, bảo mật.

Nếu sau Ngày 5 chưa qua Gate 3 → **dừng, giữ Electron làm bản chính**, tiếp tục Tauri như nhánh phụ; đừng gỡ Electron.

---

## 10. Bảng theo dõi tiến độ

| Ngày | Giai đoạn | Trạng thái | Ghi chú |
|---|---|---|---|
| 1 sáng | GĐ0 Spike | ☑ | Thư viện hệ thống WebKitGTK 2.54, dbus-1, rsvg, appindicator đã sẵn sàng |
| 1 chiều | GĐ1 Khung + api | ☑ | Hoàn thành khung Tauri v2, window.api shim, cargo clippy/fmt/test và 207 tests JS |
| 2 | GĐ2 DB/Settings/Progress/Folder | ☑ | Hoàn thành toàn bộ SQLite DDL + FTS5, SRS repo, Stats repo (Asia/Saigon), Folder repo, Settings/Progress services và 9 unit tests Rust pass 100% |
| 3–4 | GĐ3 Deck/.sdeck/asset/library | ☑ | Hoàn thành PackageStore, ZIP .sdeck, asset protocol, asset/deck/library commands, notify watcher và 15 unit tests Rust pass 100% |
| 5 sáng | GĐ4 Import/Draft/Backup | ☑ | Hoàn thành ImportService (CSV/TSV/Markdown, token security, TTL), DraftService (autosave, list, load, delete), BackupService (daily 7 bản, full backup ZIP + DB dump/restore, whitelist regex) và 21 unit tests Rust pass 100% |
| 5 chiều–6 | GĐ5 Lifecycle/đóng gói | ☑ | Hoàn thành single-instance, mở file ngoài argv/.sdeck, queue & flush khi app_ready, cấu hình release LTO strip, đóng gói RPM/DEB 5.75 MiB (unpacked 11 MiB, giảm 98.25% dung lượng so với Electron) và 23 unit tests Rust pass 100% |
| 7 | GĐ6 Dọn Electron, v0.2.1 | ☑ | Gỡ bỏ hoàn toàn Electron (electron, electron-builder, better-sqlite3, preload.ts, src/main), nâng version 0.2.1, thiết lập GitHub Actions CI/CD tự động đóng gói DEB, RPM và NSIS EXE |

## 11. Cấu trúc thư mục dự kiến thêm vào repo

```
src-tauri/
  Cargo.toml  tauri.conf.json  build.rs
  capabilities/default.json
  icons/                      (lấy từ build/icons)
  src/
    main.rs  lib.rs  state.rs  error.rs  paths.rs
    commands/  deck.rs asset.rs progress.rs settings.rs import.rs
               library.rs draft.rs backup.rs folder.rs srs.rs stats.rs
    db/        mod.rs schema.rs migration.rs repositories/*.rs
    services/  package_store.rs watcher.rs asset_protocol.rs
src/platform/  tauri-api.js  channels.js  electron-shim.js
src/styles/webkit-fixes.css   (chỉ tạo khi cần)
docs/          tauri-dev.md  tauri-visual-qa.md
```

