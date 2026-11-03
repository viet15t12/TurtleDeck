## Giai đoạn 6b — TypeScript hoá module nhạy cảm & tích hợp SQLite

> Chèn vào `study-app-phases.md` giữa GĐ 6 và GĐ 7. Đặc tả kiến trúc: `study-app-architecture-ts-sqlite.md`. Đây là giai đoạn **nâng cấp nền tảng**, không thêm tính năng mới cho người dùng; hành vi và định dạng `.sdeck` giữ nguyên.

**Mục tiêu:** chuyển các module lõi dễ sai sang TypeScript (strict), đưa tiến độ SRS + nhật ký ôn tập từ `progress.json` sang SQLite (`better-sqlite3`, chỉ Main process sở hữu kết nối), IPC có type. Xong 6b mới đóng gói (GĐ 7).

### Quyết định cần chốt TRƯỚC khi giao cho AI (tài liệu kiến trúc đang lệch với spec)

1. **Tên trường đáp án:** spec dùng `answer` (mảng) cho `fill`/`command`; file kiến trúc viết `answers`. → Giữ `answer` (không đổi định dạng `.sdeck`). Sửa lại `FillItem`/`CommandItem` trong `item.types.ts`.
2. **Hướng học:** spec dùng `en-vi` / `vi-en`; file kiến trúc dùng `fwd` / `rev`. → Chọn một. Khuyến nghị giữ `en-vi` / `vi-en` + `fwd` cho quiz (khớp khoá thẻ hiện có), để migration không phải đổi khoá.
3. **Định dạng `progress.json` thật** (study-app.md mục 8): `cards` là object khoá `deckId:itemId:direction`, `log` có `{t, card, rating, ms}`, có thêm `meta` (sao, ghi chú). Mã migration trong file kiến trúc giả định `card.deckId/itemId` và `log.reviewTime` → **sai**, phải viết lại: tách khoá bằng `:`, ánh xạ `t→review_time`, `ms→elapsed_ms`, và **migrate cả `meta`** (bảng `item_meta`).
4. **Khoá ngoại:** `srs_cards → items ON DELETE CASCADE` và `items → decks ON DELETE CASCADE` mâu thuẫn quy tắc "item bị xoá / deck gỡ khỏi danh sách vẫn giữ tiến độ". → Bỏ FK cascade cho `srs_cards`, `review_logs`, `item_meta` (khoá bằng `deck_id` + `item_id` dạng text); `items` chỉ là cache.
5. **`deck_hash`** để đồng bộ cache `items` khi file `.sdeck` đổi (Syncthing): dùng SHA-1 của `deck.json`.

### Việc cần làm

**A. Hạ tầng TS (nhẹ)**
- `typescript`, `@types/node`; `tsconfig.json` (strict, ES2022, NodeNext). Biên dịch `src/core/*.ts` → `.js` cạnh nguồn hoặc `dist/`; renderer vẫn nạp ES module, **không thêm bundler**.
- `src/core/types/`: `item.types.ts` (discriminated union, dùng `answer`), `deck.types.ts`, `srs.types.ts`, `stats.types.ts`, `ipc.types.ts`.
- Scripts: `typecheck` (`tsc --noEmit`), `build`, `test` (`tsx` hoặc build rồi `node --test`). Toàn bộ test hiện có phải xanh.

**B. Chuyển TS theo thứ tự ưu tiên** (mỗi bước chạy test xanh rồi mới sang bước sau)
- P0: `types/*`, `srs`, `planner`, `sdeck`, `validate`.
- P1: `grader`, `parser`, `deckmodel`, `builder`, `stats`; `preload.ts` + `ipc.types.ts`.
- Không chuyển `src/views/*` (DOM thuần giữ nguyên JS).

**C. SQLite tại Main (`src/main/db/`)**
- `DatabaseManager` singleton, PRAGMA WAL / `synchronous=NORMAL` / `foreign_keys=ON`; `schema.ts` có `PRAGMA user_version` để migrate schema về sau.
- Bảng: `decks`, `items` (cache + FTS5), `srs_cards`, `review_logs`, `item_meta`, `match_records` (nếu GĐ 5 đã có kỷ lục Match thì migrate luôn).
- Repositories: `srs.repo`, `deck.repo`, `stats.repo`, `match.repo`. Thuật toán SM-2 vẫn nằm ở `core/srs.ts` (hàm thuần); repo chỉ lưu.
- `recordReview` = một transaction (upsert card + insert log).
- `migration.ts`: đọc `progress.json` theo **định dạng thật** (mục 3 ở trên) trong 1 transaction → đổi tên `progress.json.migrated`; lỗi thì giữ nguyên file cũ và app vẫn chạy.
- `deck:open` → tính hash, đồng bộ `items` cache; item biến mất khỏi deck: giữ `srs_cards`.

**D. IPC có type**
- `invokeTyped` trong `preload.ts`; handlers đăng ký trong `src/main/ipc-handlers.ts`. Thay `progress:load/save` bằng `srs:recordReview`, `srs:getDeckSummary`, `srs:getDueItems`, `stats:*`, `deck:queryItems`, thao tác sao/ghi chú. Renderer **không** còn giữ toàn bộ progress trong RAM.
- Lưu ý khi code: `stmtGetCard` đang `private` nhưng handler gọi trực tiếp → thêm method `getCard()` trong repo.

**E. Đụng tới tính năng GĐ 6 đã làm**
- `core/stats.js` (streak, leech, heatmap) → truy vấn SQL; giữ test giả lập múi giờ Asia/Saigon (dùng `'localtime'` hoặc tính ngày ở TS, kiểm tra qua nửa đêm).
- Import/Export tiến độ: export từ SQLite ra JSON **cùng định dạng cũ** (mục 8) để tương thích; import ghi vào SQLite.
- Backup hằng ngày: dùng `db.backup()` / `VACUUM INTO` (không chép file `.db` đang ở WAL), giữ 7 bản.
- Tìm kiếm xuyên bộ thẻ bằng FTS5 (tuỳ chọn, nếu kịp).

### Nghiệm thu
- [ ] `npm run typecheck` sạch lỗi với `strict`; không còn `any` ở `core/` và `main/db/` (trừ chỗ có chú thích lý do).
- [ ] Toàn bộ test cũ xanh; thêm test mới: repo (DB `:memory:`), migration, stats SQL, `recordReview` atomic.
- [ ] Migration trên **bản sao `progress.json` thật** của bạn: số card, số log, sao/ghi chú khớp 100%; chạy lần 2 không nhân đôi; file lỗi → app vẫn mở, `progress.json` còn nguyên.
- [ ] Xoá/gỡ deck khỏi Home rồi thêm lại → tiến độ còn; sửa item (giữ `id`) trong Editor → tiến độ còn; *Lưu thành bản sao* → bắt đầu lại.
- [ ] Mô phỏng 50.000 log: màn Stats mở < 50 ms; ghi một lượt ôn < 5 ms.
- [ ] Kill app lúc đang ôn → mở lại không mất lượt đã trả lời, DB không hỏng.
- [ ] `npm start` trên Fedora chạy được với `better-sqlite3` đã rebuild đúng ABI Electron (`electron-rebuild` / `electron-builder install-app-deps` trong `postinstall`).
- [ ] Định dạng `.sdeck` và `deck.json` không đổi; file `.sdeck` tạo ở bản trước vẫn mở được.

### Ảnh hưởng tới GĐ 7 (đóng gói)
- `electron-builder`: thêm `asarUnpack` cho `better-sqlite3` (`**/*.node`), bước `npmRebuild`/`install-app-deps`; build TS trước khi `dist`.
- Thử AppImage **và** rpm trên Fedora sạch: mở app, ôn thẻ, kiểm tra tạo được `studyapp.db` trong `userData`.
- README thêm: vị trí `studyapp.db`, cách backup/restore, cách export tiến độ.
- Rà bảo mật thêm: mọi tham số SQL dùng prepared statement (không nối chuỗi), renderer không truy cập DB trực tiếp.

### Prompt giao việc
```
Làm GIAI ĐOẠN 6b trong study-app-phases.md, theo study-app-architecture-ts-sqlite.md,
NHƯNG áp dụng các quyết định chốt ở đầu mục 6b: giữ `answer` (không `answers`), giữ hướng en-vi/vi-en,
migration phải đọc đúng định dạng progress.json ở study-app.md mục 8 (khoá `deckId:itemId:direction`,
log {t, card, rating, ms}, cả `meta`), không dùng FK cascade cho bảng tiến độ.
Làm theo thứ tự A→B→C→D→E, mỗi bước chạy test xanh rồi mới sang bước sau.
Không đổi định dạng .sdeck, không đụng src/views ngoài chỗ gọi IPC mới. Chưa làm đóng gói (GĐ 7).
Cuối cùng báo file đã tạo/sửa, cách chạy test và migration, và những gì chưa làm.
```
