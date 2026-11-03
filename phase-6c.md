## Giai đoạn 6c — Tái cấu trúc `main.js` và chuyển sang TypeScript

> Chèn vào `study-app-phases.md` sau GĐ 6b, trước GĐ 7. Làm **sau** 6b vì `main.js` đã gọi `DatabaseManager` và `registerTypedIpcHandlers`. Đây là giai đoạn **refactor thuần**: hành vi, tên kênh IPC và định dạng dữ liệu giữ nguyên. Các lỗi tìm được (mục 2) sửa ở commit riêng sau khi refactor xong.

### 1. Hiện trạng `main.js` (~1.215 dòng, một file làm mọi việc)

| Nhóm | Nội dung trong file |
|---|---|
| Khởi động | single-instance lock, đăng ký scheme `asset`, cửa sổ, `second-instance`, `open-file`, `app:ready` |
| Trạng thái toàn cục | `packages`, `tempImports`, `knownSaves`, `watchedDirs`, `watchDebouncers`, `pendingExternalFiles`, `rendererReady`; 10 biến `let` nạp động module core |
| Bộ thẻ | `openOne`, `deck:open/import/save/close/new/duplicate/exportCopy/showInFolder` |
| Ảnh & nhập hàng loạt | `asset:*`, `import:*`, `collectImportAssets` |
| Thư viện | `library:*`, `scanLibraryRecursively` |
| Nháp | `draft:save/delete/list/load` |
| Tiến độ & sao lưu | `progress:*`, `backup:*`, `ensureDailyBackup` |
| Theo dõi file | `watchPath`, `onWatchedFileChanged` |
| Giao thức | `registerAssetProtocol` |

Cấu trúc mới (mỗi file < 250 dòng, một trách nhiệm):

```
src/main/
├── index.ts                  # entry: lock single-instance, registerSchemesAsPrivileged, nạp lifecycle
├── app/
│   ├── lifecycle.ts          # whenReady, before-quit, activate, window-all-closed
│   ├── window.ts             # createWindow, winOf
│   ├── paths.ts              # progressFile, settingsFile, backupsDir, draftsDir, defaultLibraryDir
│   └── external-files.ts     # argv, second-instance, open-file, hàng đợi pendingExternalFiles, app:ready
├── ipc/
│   ├── register.ts           # handle() có kiểu + registerAll(ctx)
│   ├── deck.ipc.ts   asset.ipc.ts   import.ipc.ts   library.ipc.ts
│   ├── draft.ipc.ts  backup.ipc.ts  progress.ipc.ts  settings.ipc.ts
├── services/                 # logic thật, KHÔNG import 'electron' (nhận phụ thuộc qua tham số)
│   ├── package-store.ts      # packages Map, tempImports (có TTL), newKey
│   ├── deck-service.ts       # openOne, saveDeck, validateSdeckPath
│   ├── import-service.ts     # collectImportAssets
│   ├── library-service.ts    # scanLibrary, getActiveLibraryDir
│   ├── draft-service.ts
│   ├── backup-service.ts     # ensureDailyBackup, manual, restore, dọn bản cũ
│   ├── watcher-service.ts    # watchPath, onWatchedFileChanged, knownSaves
│   └── asset-protocol.ts
└── db/                       # đã có từ 6b
```

Lớp `ipc/*` chỉ làm 3 việc: kiểm tra tham số, gọi service, mở hộp thoại (`dialog`). Service nhận `deps` (fs, `notify(channel, payload)`, `now()`) để test bằng thư mục tạm, không cần Electron.

### 2. Vấn đề phát hiện khi đọc `main.js` (sửa sau refactor, mỗi mục một commit + test)

| # | Vị trí | Vấn đề | Mức |
|---|---|---|---|
| 1 | `scanLibraryRecursively` | `real.startsWith(realRoot)` thiếu `path.sep`: `/home/u/StudyDecks2` bị coi là nằm trong `/home/u/StudyDecks`. (`collectImportAssets` đã làm đúng.) | Cao |
| 2 | `import:preview` | Đọc **đường dẫn bất kỳ** renderer gửi lên. Trái nguyên tắc "main không tin renderer". Chỉ nhận đường dẫn do `import:pickFile` cấp (token → path trong Map). | Cao |
| 3 | `progress:save` | Mỗi lần gọi ghi lại toàn bộ tiến độ vào SQLite (`importProgressData`). Mâu thuẫn mục tiêu 6b (ghi từng lượt qua `srs:recordReview`). Kiểm tra renderer còn gọi không; nếu không thì xoá kênh, nếu còn thì chuyển sang IPC có kiểu. | Cao |
| 4 | Đầu file | `app.quit()` khi không giành được lock nhưng code phía dưới vẫn chạy. Cần `return`/thoát sớm trong `index.ts`. | Trung bình |
| 5 | `library:pickDir/setDir` | `saveSettingsFile(file, { libraryDir })` có thể **ghi đè các cài đặt khác** nếu hàm không merge. Xác minh trong `fsutil.saveSettingsFile`; nếu không merge thì đọc → gộp → ghi. | Trung bình (cần xác minh) |
| 6 | Sao lưu | `pre-restore-*.db` và `pre-import-*.db` không bao giờ bị dọn (chỉ giữ 7 bản `progress-*.json`). Đĩa đầy dần. Thêm chính sách giữ N bản cho từng loại. | Trung bình |
| 7 | `library:scan` | Đọc **toàn bộ byte** mọi file `.sdeck` (tối đa 2000 file) mỗi lần quét. Cache theo `mtime+size`, chỉ đọc lại file đổi. | Trung bình |
| 8 | Watcher | `fs.watch(..., {recursive:false})` chỉ theo dõi thư mục gốc, trong khi quét đi sâu 4 cấp; file trong thư mục con đổi không được báo. Watcher không bao giờ `close()`. | Trung bình |
| 9 | `tempImports` | Người dùng huỷ nhập thì mục ở lại trong Map mãi. Thêm TTL (vd 30 phút) và dọn khi `deck:close`. | Thấp |
| 10 | `asset:addBytes`, `asset:remove` | Chấp nhận hai kiểu tham số (đối tượng hoặc rời). Thống nhất một kiểu trong `ipc.types.ts`. | Thấp |
| 11 | `backup:restore` | Chỉ chặn `/` và `\`. Nên dùng whitelist `^progress-[\w-]+\.json$`. | Thấp |
| 12 | `handle()` | Lỗi bất ngờ trả `{ok:false,error}` cả với kênh vốn trả mảng (`deck:open`, `asset:add`, `draft:list`), renderer có thể hiểu sai. Cho mỗi kênh khai báo kiểu lỗi. | Thấp |
| 13 | `console-message` | Chữ ký listener `(event, level, message, line, sourceId)` đã bị đánh dấu lỗi thời ở Electron mới; kiểm tra phiên bản đang dùng. | Thấp |
| 14 | Bảo mật IPC | Chưa kiểm tra `event.senderFrame.url` (chỉ nhận từ `file://…/src/index.html`). Nên thêm vào `register.ts` một lần cho mọi kênh. | Thấp (hardening) |

### 3. Quyết định kỹ thuật cần chốt trước

1. **Định dạng module cho main.** Nếu Electron ≥ 28: main dùng ESM (`import`), bỏ toàn bộ `await import()` và 10 biến `let`; thay `__dirname` bằng `import.meta.dirname` (Node ≥ 20.11) hoặc `fileURLToPath`. Nếu Electron cũ hơn: giữ CJS và chỉ import động ở một chỗ (`index.ts`).
2. **Preload bắt buộc là CJS một file** (renderer sandbox không `require` được module cục bộ). `preload.ts` chỉ được `import type` từ `ipc.types.ts`; build riêng (tsconfig thứ hai hoặc esbuild một file).
3. **Điểm vào mới:** `package.json` → `"main": "dist/main/index.js"`; `electron-builder` (GĐ 7) phải đưa `dist/` vào gói.
4. **Kiểu cho mọi kênh cũ.** Mở rộng `IpcContracts` (6b mới có `srs:*`, `stats:*`, `deck:queryItems`) cho `deck:*`, `asset:*`, `import:*`, `library:*`, `draft:*`, `backup:*`, `progress:*`, `settings:*`; thêm `IpcEvents` cho sự kiện main → renderer: `deck:openExternal`, `deck:changed`, `deck:fileAdded`, `deck:fileRemoved`, `deck:watchError`.

### 4. Việc cần làm (theo thứ tự, mỗi bước test xanh mới sang bước sau)

**A. Lưới an toàn trước khi đụng code**
- Script trích mọi tên kênh (`handle('…')`, `ipcMain.on/handle`) từ `main.js` hiện tại → `test/fixtures/ipc-channels.json`. Test sau refactor: tập kênh đăng ký phải **bằng** tập này (trừ kênh xoá có chủ ý, liệt kê rõ).
- Test đặc trưng (characterization) cho các service sẽ tách, viết trên thư mục tạm: `openOne` (file hỏng, thiếu, quá lớn), `deck:save` (ghi `.bak`, nháp bị xoá), `collectImportAssets` (ảnh ngoài thư mục, symlink, ảnh giả), `scanLibrary`, `ensureDailyBackup` (giữ 7 bản).

**B. Tách theo lớp (không đổi hành vi)**
1. `paths.ts`, `package-store.ts`, `register.ts` (`handle()` có kiểu).
2. Chuyển từng nhóm kênh: settings → progress → asset → import → deck → library → draft → backup. Mỗi nhóm: service trước, `*.ipc.ts` sau, chạy lại test kênh.
3. `watcher-service`, `external-files`, `asset-protocol`, `window`, `lifecycle`; cuối cùng thu `main.js` thành `index.ts`.

**C. TypeScript strict**
- `strict`, không `any` ở `src/main/` (ngoại lệ có chú thích). Các giá trị `{ ok: true, … } | { ok: false, error }` dùng discriminated union để TS bắt thiếu nhánh lỗi.
- `packages` có kiểu `Map<string, OpenPackage>` với `OpenPackage = { file: string | null; assets: Map<string, Uint8Array>; sourceDir?: string }`.
- `preload.ts` dùng `invokeTyped` cho **tất cả** kênh; renderer nhận `WindowApi` đầy đủ.

**D. Sửa các lỗi ở mục 2** (mỗi mục một commit, có test thất bại trước khi sửa).

### 5. Nghiệm thu
- [ ] `npm run typecheck` sạch, không còn `main.js`; `src/main/index.ts` < 60 dòng, không file nào > 250 dòng.
- [ ] Test tập kênh IPC khớp fixture; toàn bộ test cũ (core + db) xanh.
- [ ] Không file trong `services/` import `electron` (kiểm bằng test grep hoặc ESLint rule).
- [ ] Thủ công trên Fedora: mở app, mở/lưu/nhập/xuất bộ thẻ, kéo thả ảnh, thư viện (quét + thư mục con), nháp (kill app rồi mở lại → hỏi khôi phục), sao lưu/khôi phục tiến độ, double-click file `.sdeck` khi app đang chạy và khi chưa chạy.
- [ ] Mỗi lỗi ở mục 2 có test; riêng #1 (`StudyDecks2`) và #2 (đường dẫn lạ ở `import:preview`) phải có test đỏ → xanh.
- [ ] `npm run build` ra `dist/main/*.js` + `dist/preload.js` (CJS một file); `npm start` chạy từ bản build.
- [ ] Không đổi: tên kênh IPC, định dạng `.sdeck`, `settings.json`, tên file sao lưu.

### 6. Ảnh hưởng tới GĐ 7
- `electron-builder`: `main` trỏ `dist/main/index.js`, `files` gồm `dist/**`, `src/index.html`, `src/**` của renderer, `asarUnpack` cho `better-sqlite3`.
- README: không cần nhắc cấu trúc main; thêm lệnh `npm run build` trước `npm run dist`.

### Prompt giao việc
```
Làm GIAI ĐOẠN 6c trong study-app-phases.md: tái cấu trúc main.js (đính kèm) và chuyển toàn bộ
sang TypeScript strict theo cấu trúc src/main/ ở mục 1 của 6c.

Quy tắc:
- Đây là REFACTOR: không đổi tên kênh IPC, định dạng .sdeck, settings.json, tên file sao lưu.
  Không sửa lỗi lẫn vào lúc tách file; các lỗi ở mục 2 sửa ở bước D, mỗi lỗi một commit và có test.
- Làm theo thứ tự A→B→C→D. Bước A (fixture tên kênh + test đặc trưng) làm TRƯỚC khi tách bất kỳ dòng nào.
- Service trong src/main/services/ không được import 'electron'; nhận phụ thuộc qua tham số để test bằng thư mục tạm.
- Preload là CJS một file, chỉ import type. Mở rộng IpcContracts/IpcEvents cho mọi kênh cũ.
- Trước khi bắt đầu hãy báo cho tôi: phiên bản Electron đang dùng và quyết định ESM/CJS cho main (mục 3.1).
- Chưa làm đóng gói (GĐ 7); không đụng src/views ngoài chỗ cần cho preload mới.

Mỗi bước: chạy typecheck + node --test + npm start rồi mới sang bước sau.
Cuối cùng báo: file đã tạo/xoá, kết quả test, các lỗi đã sửa ở mục 2 (và mục nào chưa sửa), và cách chạy.
```
