# Kế hoạch tái cấu trúc renderer Turtle Deck (bản chi tiết cho người/AI thực hiện)

Phạm vi: **renderer** (`src/app.js`, `src/views/home.js`, `src/views/session.js`, `src/views/settings.js` và các module `src/core/*` mà chúng gọi). **Không đụng main process** (`main.js`, preload) — đã có kế hoạch riêng.

Mục tiêu:
1. Tách các file lớn thành nhiều file nhỏ theo **trách nhiệm**.
2. Chỉ chuyển **TypeScript ở chỗ nhạy cảm** (dữ liệu, trạng thái, logic thuần). Code dựng DOM giữ `.js`.
3. **Không đổi hành vi** khi tách. Lỗi tìm thấy sửa ở bước riêng (mục 8).

---

## 0. Cách dùng tài liệu này (đọc trước khi làm)

Quy tắc bắt buộc cho người/AI thực hiện:

1. Làm **đúng thứ tự bước** ở mục 7. Mỗi bước = 1 commit, app phải chạy và test phải đạt trước khi sang bước sau.
2. Mỗi bước: đọc file nguồn → tạo file mới → chuyển code **nguyên văn** (chỉ đổi cách truyền phụ thuộc) → xoá code cũ → chạy `npm test`, `npm run typecheck`, `npm run build` → thử tay theo checklist của bước.
3. Không đổi tên hàm export công khai (`renderHome`, `renderSession`, `renderSettings`, `actions.*`) trừ khi bước nói rõ. Các view khác (`deck.js`, `editor.js`, `stats.js`, `learn.js`, `match.js`, `exam.js`, `result.js`) vẫn import như cũ.
4. Không thêm thư viện ngoài `typescript`, `esbuild`, (tuỳ chọn) `vitest`.
5. Không format lại / đổi chuỗi tiếng Việt / đổi class CSS.
6. Nếu gặp chỗ mơ hồ (ví dụ trường của `card` trong SRS), **đọc `core/srs.js` thật** rồi viết kiểu theo đó, không đoán.
7. Mỗi file mới có dòng comment đầu file: đường dẫn + 1 câu trách nhiệm (giống phong cách hiện tại).

Giới hạn kích thước sau khi xong: mỗi file ≤ ~300 dòng; file `index.js` của mỗi màn ≤ ~150 dòng.

---

## 1. Hiện trạng (các file cần tách)

| File | Đang chứa những trách nhiệm trộn lẫn |
|---|---|
| `app.js` | state toàn cục; `applyResult` (gộp entry, trùng `meta.id`); lưu danh sách đường dẫn; ghi review; quét thư viện; ~35 action (deck, modal, session, settings); router `render()`; đăng ký ~12 sự kiện IPC; khôi phục bản nháp; `init()` |
| `views/home.js` | state UI (localStorage); history Back/Forward; breadcrumb; kéo thả deck/thư mục (kiểm tra vòng lặp); nhập `.sdeck`; sao lưu/khôi phục toàn bộ; 2 menu thả xuống; toolbar; dải "Hôm nay"; sidebar; lọc/sắp xếp bộ thẻ; render thư mục con + bộ thẻ + trạng thái rỗng; phím tắt |
| `views/session.js` | dựng câu hỏi; máy trạng thái phiên; chấm điểm; ghi review; chèn lại câu sai; chấm lại đúng (override); sao/ghi chú; phím tắt; render 4 loại câu hỏi; render phản hồi; thanh tiến độ; màn trống |
| `views/settings.js` | form state + validate; theme; thư viện; TTS; danh sách sao lưu; xuất/nhập tiến độ; đặt lại SRS; render toàn màn |

Điểm chung gây khó tách: `renderHome` và `renderSession` là **closure lớn** dùng chung nhiều biến cục bộ (`flatFolders`, `locationsByDeckId`, `session`, `progress`…). Giải pháp ở mục 2.2.

---

## 2. Quy ước kiến trúc

### 2.1 Phân tầng (phụ thuộc chỉ đi xuống)

```
view (DOM, .js)  →  actions/handlers (IPC, side effect, .js/.ts)  →  logic thuần (.ts)  →  types (.ts)
```

- **Logic thuần**: không đụng DOM, `window`, `localStorage`, `api`. Nhận dữ liệu, trả dữ liệu. Dễ test.
- **Handlers**: gọi `window.api`, `notify`, `confirm`, sửa state. Nhận phụ thuộc qua tham số.
- **View**: chỉ dựng DOM và gắn sự kiện; gọi handler.

### 2.2 Mẫu "ctx" thay cho closure

Gom biến dùng chung vào một object `ctx` và truyền xuống mọi module con.

```js
// views/home/index.js
const ctx = {
  ui: homeUiState,               // trạng thái UI
  data: { entries, progress, settings, statsByUid, flatFolders: [], locationsByDeckId: new Map() },
  actions,                       // actions của app
  refresh: { folders, cards, sidebar, breadcrumb },   // các hàm render lại, gán sau khi view dựng xong
};
```

Module con export **hàm tạo**: `createXxx(ctx)` trả về `{ ...api, element? }`. Ví dụ `createNavigation(ctx)` trả `{ backBtn, forwardBtn, goBack, goForward, navigateToFolder }`.

Tránh phụ thuộc vòng: module con **không import lẫn nhau**; chúng gọi nhau qua `ctx.refresh.*` / `ctx.nav.*` (gán trong `index.js`).

### 2.3 Đặt tên & import

- File: `kebab-case`. Hàm tạo: `createXxx`. Hàm render: `renderXxx`.
- Import có đuôi như hiện tại (`'./dom.js'`). Với file `.ts` vẫn viết đuôi `.js` trong import? **Không** — vì dùng esbuild bundle, import file TS bằng đuôi `.ts` hoặc bỏ đuôi đều được; chọn **bỏ đuôi cho file `.ts`** (`'./query'`), giữ `.js` cho file JS. Một nơi duy nhất cấu hình, xem mục 3.

### 2.4 Quy tắc sửa khi tách

- Hàm đóng gói đang dùng `this` (ví dụ `reloadLibrary() { return this.scanLibrary(); }`) → đổi thành gọi qua `actions.scanLibrary()`.
- Biến module-level hiện có (`homeUiState`, `activeCleanup`, `uidSeq`) giữ nguyên ý nghĩa, chuyển vào file tương ứng.

---

## 3. Thiết lập TypeScript + build (Bước 1)

### 3.1 Cài đặt

```bash
npm i -D typescript esbuild
# tuỳ chọn, cho test TS:
npm i -D vitest
```

### 3.2 `tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "allowJs": true,
    "checkJs": false,
    "noEmit": true,
    "strict": true,
    "skipLibCheck": true,
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "types": []
  },
  "include": ["src/**/*", "src/types/api.d.ts"]
}
```

`checkJs: false` → chỉ file `.ts` bị kiểm tra chặt. Mục đích: không phải sửa hàng trăm cảnh báo trong code DOM.

### 3.3 Script `package.json`

```json
{
  "scripts": {
    "build": "esbuild src/app.js --bundle --format=esm --sourcemap --outfile=dist/app.js",
    "dev": "esbuild src/app.js --bundle --format=esm --sourcemap --outfile=dist/app.js --watch",
    "typecheck": "tsc"
  }
}
```

### 3.4 Chỉnh `index.html`

Đổi thẻ script module từ `src/app.js` sang `dist/app.js`. Nếu có CSP (`Content-Security-Policy`) thì đảm bảo cho phép script cùng nguồn (`script-src 'self'`).

### 3.5 Cảnh báo cần kiểm tra

- **Test hiện có**: nếu chạy bằng `node --test` và import trực tiếp `core/*.js`, khi chuyển file sang `.ts` test sẽ không import được. Chọn một: (a) chạy test bằng `tsx` (`npx tsx --test`), hoặc (b) chuyển sang Vitest. Ghi lại lựa chọn trong README.
- **Main process** nạp renderer bằng `loadFile('index.html')`: đảm bảo `dist/` được đóng gói (`electron-builder` `files`) — để dành cho giai đoạn đóng gói.
- Thêm `dist/` vào `.gitignore`.

### 3.6 Tiêu chí hoàn thành bước 1

- `npm run build` tạo `dist/app.js`, mở app chạy **y như cũ**.
- `npm run typecheck` chạy không lỗi (chưa có file `.ts`, hoặc chỉ có `types/api.d.ts`).
- `npm test` vẫn đạt.

---

## 4. Kiểu dữ liệu dùng chung (Bước 2)

### 4.1 `src/core/types.ts`

Viết theo code thật; các trường chưa rõ phải **mở `srs.js` / `deckmodel.js` / `planner.js` để lấy đúng**.

```ts
export type Rating = 1 | 2 | 3 | 4;               // RATING.AGAIN|HARD|GOOD|EASY (xem srs.js)
export type DeckKind = 'qa' | 'quiz' | 'vocab';
export type QuestionKind = 'single' | 'multi' | 'fill' | 'command' | 'listen' | 'card';
export type Direction = 'fwd' | 'rev';              // đối chiếu srs.js

export interface DeckMeta { id: string; title: string; kind?: DeckKind; lang?: string; description?: string; }
export interface DeckItem { id: string; [k: string]: unknown }  // thu hẹp dần theo deckmodel.js
export interface Deck { meta: DeckMeta; items: DeckItem[]; }

// TODO: điền đúng trường từ newCard() trong srs.js
export interface CardState { [k: string]: unknown }

export interface ReviewLogEntry { t: number; card: string; ms: number; [k: string]: unknown }
export interface ItemMeta { starred: boolean; note: string }

export interface Progress {
  version: 1;
  cards: Record<string, CardState>;                 // key = cardKey(deckId, itemId, direction)
  meta: Record<string, ItemMeta>;                   // key = `${deckId}:${itemId}`
  log: ReviewLogEntry[];
}

export interface Settings {
  version: number;
  decks: string[];
  newCardsPerDay: number;
  learnSteps: number[];
  ttsLang?: string;
  ttsVoiceName?: string;
  theme?: 'system' | 'light' | 'dark';
  libraryDir?: string;
}

export type EntryStatus = 'loading' | 'ok' | 'error' | 'missing';
export interface Entry {
  uid: number;
  path: string | null;
  status: EntryStatus;
  deckKey?: string | null;
  deckText?: string;
  deck?: Deck | null;
  issues: unknown[];
  error?: string | null;
  source?: string;
  assetCount?: number;
  group?: string;
  relPath?: string;
  inLibrary?: boolean;
}

export interface Folder { id: string; name: string; parentId: string | null; path: string; }
export interface DeckLocation { deckId: string; folderId: string | null; isLink?: boolean; locationId?: string; }

export type Route =
  | { name: 'home' } | { name: 'stats' } | { name: 'settings' }
  | { name: 'editor'; uid: number; itemId?: string | null }
  | { name: 'deck' | 'learn' | 'match' | 'exam'; uid: number; config?: Record<string, unknown> }
  | { name: 'session'; uid: number; config?: SessionConfig; fromEditor?: boolean; trialDeck?: Deck };

export interface SessionConfig {
  mode?: 'srs' | 'custom' | 'trial' | 'learn' | 'match' | 'exam';
  persist?: boolean; count?: number; shuffle?: boolean; itemIds?: string[];
}
```

### 4.2 `src/types/api.d.ts` — khai báo `window.api`

Liệt kê **tất cả** hàm `window.api` mà renderer gọi (grep `api\.` và `window.api`). Mẫu:

```ts
import type { Progress, Settings, Folder, DeckLocation } from '../core/types';
type Res<T = {}> = ({ ok: true } & T) | { ok: false; error: string; canceled?: boolean };

declare global {
  interface Window {
    api: {
      loadSettings(): Promise<Settings>;
      saveSettings(patch: Partial<Settings>): Promise<Res<{ settings: Settings }>>;
      loadProgress(): Promise<Progress>;
      saveProgress(p: Progress): Promise<Res>;
      getFolderTree(): Promise<unknown[]>;
      getDeckLocations?(): Promise<DeckLocation[]>;
      moveDeck(deckId: string, folderId: string | null): Promise<Res>;
      moveFolder(id: string, parentId: string | null): Promise<Res>;
      // … điền đủ: openDecks, importDeck, saveDeck, scanLibrary, listBackups,
      //   createFullBackup, restoreFullBackup, listDrafts, loadDraft, onFileAdded, ...
      // hàm tuỳ chọn (dùng `?.` trong code) khai báo là optional.
    };
  }
}
export {};
```

### 4.3 Tiêu chí hoàn thành bước 2

- `npm run typecheck` đạt. Chưa đổi code runtime nào.

---

## 5. Cấu trúc đích

`[TS]` = file TypeScript. Còn lại `.js`.

```
src/
  app.js                         # bootstrap: init() + gắn click-đóng-menu (≤ 50 dòng)
  app/
    state.ts            [TS]     # state, newEntry, kiểu AppState
    runtime.js                   # render() proxy: setRenderer(fn), render()
    router.js                    # createRouter({state, actions}) → render theo state.route
    entries.ts          [TS]     # samePath, applyResult
    progress.js                  # handleRecordReview, helper lưu progress
    library.js                   # persistDeckPaths, scanLibrary, reloadLibrary
    events.js                    # registerEvents(actions): toàn bộ api.onXxx
    drafts.js                    # showDraftRecovery()
    busy.js                      # withBusy(fn)
    actions/
      index.js                   # createActions() ghép các nhóm
      navigation.js              # home, openStats, openSettings, openDeckView, openEditor
      deck.js                    # openFiles, importDeck, saveAs, saveEntry, reload, remove,
                                 #   duplicateDeck, exportCopy, showInFolder
      modals.js                  # hasModal, closeModal, showShortcuts, openNewDeckModal,
                                 #   openDeckInfoModal, openSessionSetup
      sessions.js                # startSrsSession/Learn/Match/Exam, startSession, startTrialSession
      settings.js                # saveSettings, resetProgress, reloadProgress
  core/
    types.ts            [TS]
    srs.ts  planner.ts  progressio.ts  grader.ts   [TS]   # chuyển ở bước 8 (nếu đang là .js)
  types/api.d.ts        [TS]
  views/
    home/
      index.js                   # renderHome: tạo ctx, ghép, đăng ký phím
      ui-state.ts       [TS]     # homeUiState + load/save localStorage an toàn
      folder-store.js            # cache cây thư mục + vị trí deck, invalidate()
      query.ts          [TS]     # filterDecks, sortDecks, filterSubfolders (hàm thuần)
      navigation.js              # history Back/Forward, navigateToFolder, nút ‹ ›
      breadcrumb.js              # createBreadcrumb(ctx)
      dnd.ts            [TS]     # canMoveFolderInto, handleDropDeck, handleDropFolder
      folder-actions.js          # handleFolderAction (create/rename/move/delete)
      deck-actions.js            # deckCardActions (onMove/onLink/onUnlink)
      transfer-actions.js        # handleImportSdeck, handleFullBackup, handleFullRestore
      menus.js                   # closeAllDropdowns, createImportMenu, createBackupMenu
      toolbar.js                 # createToolbar, createViewToggle, createSidebarToggle
      today-strip.js             # renderTodayStrip
      filter-bar.js              # chips lọc loại + search + sort
      workspace.js               # renderWorkspace: subfolders + decks + empty state
      empty-state.js             # renderEmptyFolder
      keyboard.js                # attachHomeKeyboard(ctx) → trả hàm cleanup
    session/
      index.js                   # renderSession: ghép, render(), exit, next
      build-questions.js         # tạo danh sách câu hỏi theo config
      session-state.ts  [TS]     # SessionState, createSessionState, resetForQuestion
      submit.ts         [TS]     # gradeAnswer, buildReviewPayload, finalizeSubmit, overrideAsCorrect
      item-meta.ts      [TS]     # getItemMeta (chỉ đọc), setItemMeta
      keyboard.js                # createKeyHandler(ctx)
      empty-view.js              # renderEmptySession
      labels.js                  # RATING_VN_LABELS, catLabels
      answer-chips.js            # richEl, buildAcceptedAnswerChips
      progress-bar.js            # renderSegmentedProgressBar
      actions-row.js             # renderActionsRow (nộp / hiện đáp án / 4 nút chấm / tiếp tục)
      question/
        index.js                 # renderQuestionBody: chọn theo q.kind
        choices.js               # single/multi
        text-input.js            # fill/command
        listen.js                # listen
        flashcard.js             # card
      feedback/
        index.js                 # renderFeedback: ghép
        banner.js                # tiêu đề + icon + lớp CSS
        compare-grid.js          # "Bạn trả lời" / "Đáp án đúng"
        vocab-extra.js
        actions-bar.js           # sao + chấm lại đúng
        note.js                  # ghi chú cá nhân
    settings/
      index.js                   # renderSettings: ghép + Lưu/Khôi phục mặc định
      form-state.ts     [TS]     # FormState, fromSettings, validate → {ok, value|error}
      theme.js                   # applyTheme
      sections/
        appearance.js            # theme + thư mục thư viện
        learning.js              # newCardsPerDay + learnSteps
        tts.js
        backup.js                # tạo/khôi phục/xuất/nhập + danh sách bản sao lưu
        reset-progress.js
```

Các view khác (`deck.js`, `editor.js`, `stats.js`, `result.js`…) giữ nguyên chỗ cũ.

---

## 6. Bản đồ chuyển code (hàm cũ → file mới)

### 6.1 `app.js`

| Hiện tại | Chuyển tới | Ghi chú |
|---|---|---|
| `state`, `uidSeq`, `newEntry` | `app/state.ts` | gõ kiểu `AppState`, `Entry` |
| `samePath`, `applyResult` | `app/entries.ts` | nhận `state` làm tham số hoặc import từ `state.ts`; vẫn gọi `api.closeDeck`, `notify` (tách phần thuần ở bước 8) |
| `persistDeckPaths` | `app/library.js` | |
| `handleRecordReview` | `app/progress.js` | |
| `withBusy` | `app/busy.js` | gọi `render()` từ `runtime.js` |
| `actions.home/openStats/openSettings/openDeckView/openEditor` | `actions/navigation.js` | |
| `exportCopy/showInFolder/openFiles/importDeck/saveAs/reload/remove/duplicateDeck` + `saveEntry` | `actions/deck.js` | `saveEntry` là hàm nội bộ của file này |
| `hasModal/closeModal/showShortcuts/openNewDeckModal/openDeckInfoModal/openSessionSetup` | `actions/modals.js` | |
| `startSrsSession/startLearnSession/startMatchSession/startExamSession/startSession/startTrialSession` | `actions/sessions.js` | |
| `saveSettings/resetProgress/reloadProgress` | `actions/settings.js` | |
| `scanLibrary/reloadLibrary` | `app/library.js` (export) + `actions/index.js` gắn vào `actions` | `reloadLibrary` dùng `actions.scanLibrary()` thay `this.` |
| `render()` | `app/router.js` | giữ nguyên thứ tự `if` hiện tại |
| listener `document.click` | `app.js` | |
| các `api.onXxx` trong `init()` | `app/events.js` `registerEvents(actions)` | |
| khối "khôi phục bản nháp" trong `init()` | `app/drafts.js` `showDraftRecovery()` | |
| `init()` | `app.js` | chỉ còn: `initGlobalShortcuts` → `registerEvents` → load settings/progress → mở deck → `scanLibrary` → `showDraftRecovery` → `notifyReady` |

**Cách ghép `actions` không vòng phụ thuộc**:

```js
// app/actions/index.js
import { navigationActions } from './navigation.js';
// …
export function createActions({ state }) {
  const actions = {};
  Object.assign(actions,
    navigationActions({ state, actions }),
    deckActions({ state, actions }),
    modalActions({ state, actions }),
    sessionActions({ state, actions }),
    settingsActions({ state, actions }),
    libraryActions({ state, actions }));
  return actions;       // mỗi nhóm đọc `actions.xxx` lúc GỌI, không phải lúc tạo
}
```

`render()` được gọi qua `runtime.js`:

```js
// app/runtime.js
let renderFn = () => {};
export const setRenderer = fn => { renderFn = fn; };
export const render = () => renderFn();
```
`app.js`: `setRenderer(createRouter({ state, actions }))`.

### 6.2 `views/session.js`

| Hiện tại | Chuyển tới |
|---|---|
| `choiceText` | **Kiểm tra có dùng không** (hiện không thấy được gọi) → xoá nếu không dùng |
| `RATING_VN_LABELS`, `catLabels` | `labels.js` |
| `richEl`, `buildAcceptedAnswerChips` | `answer-chips.js` |
| tính `persist/isSrsMode/deckId/…` + dựng `questions` | `build-questions.js` → `createQuestions({ entry, config, progress, settings })` |
| khối `if (!questions.length)` | `empty-view.js` → `renderEmptySession(root, { trialBanner, isSrsMode, entry, actions })` |
| object `session` + `initAnswerForCurrent` | `session-state.ts` → `createSessionState(questions)`, `resetForQuestion(session, q)`; phần TTS autoplay giữ lại ở `index.js` sau khi gọi `resetForQuestion` |
| `currentQ`, `currentCardState` | `index.js` (dùng `ctx`) |
| `submitCurrent` | `submit.ts` (xem 6.2.1) |
| `handleOverride` | `submit.ts` → `overrideAsCorrect(...)`; phần sửa `progress` đưa vào `progressio` |
| `getCurrentMeta`, `toggleStar`, `saveNote` | `item-meta.ts` (đọc/ghi) + gọi từ `index.js` |
| `nextQuestion`, `requestExit` | `index.js` |
| `onKeyDown` | `keyboard.js` → chia theo `q.kind` thành các hàm nhỏ (`handleSingle`, `handleMulti`, `handleText`, `handleCard`) |
| `renderResultView` | `index.js` |
| `renderQuestionBody` | `question/index.js` + 4 file con |
| `renderFeedback` | `feedback/index.js` + 5 file con |
| `renderSegmentedProgressBar` | `progress-bar.js` |
| phần tính `actionsRow`/`shortcutFooter` trong `render()` | `actions-row.js` → trả `{ actionsRow, shortcutFooter }` |
| `render()` | `index.js` |

#### 6.2.1 Thiết kế `submit.ts` (nhạy cảm nhất)

```ts
import type { Rating, Progress, QuestionKind } from '../../core/types';

export type UserAnswer = number | null | number[] | string | boolean;
export interface Grade { ok: boolean; near: boolean; rating: Rating; overridden?: boolean }

/** Thuần: chấm điểm theo loại câu. Không đụng progress. */
export function gradeAnswer(q: Question, userAnswer: UserAnswer, explicitRating?: Rating): { grade: Grade; userAnswer: UserAnswer };

/** Thuần: có được nộp không (single phải đã chọn, v.v.) — dùng cho nút "Nộp bài". */
export function canSubmit(q: Question, userAnswer: UserAnswer): boolean;

/** Có tác dụng phụ qua deps: ghi review, chèn lại câu sai, cập nhật session. */
export function submitAnswer(session: SessionState, deps: SubmitDeps, explicitRating?: Rating): void;

export function overrideAsCorrect(session: SessionState, deps: SubmitDeps): void;
```

`SubmitDeps = { deckId, persist, learnSteps, progress, onRecordReview, now?: () => number, saveProgress }`.
Việc `gradeAnswer` đã tách thuần để test không cần DOM.

Kiểu `Question`: discriminated union theo `kind` (single/multi có `choices`, `answers: number[]`; fill/command/listen có `answers: string[]`, `match`, `tolerance`; card có `front/back`). Lấy chính xác từ `core/builder.js` và `core/planner.js`.

### 6.3 `views/home.js`

| Hiện tại | Chuyển tới |
|---|---|
| `homeUiState` | `ui-state.ts` (kèm `loadHomeUiState()`/`savePref(key,value)` bọc try/catch) |
| `createSearchSvg` | `filter-bar.js` |
| `closeAllDropdowns` | `menus.js` |
| tính stats (`statsByUid`, `totalDueToday`, `totalNewLeftToday`, `reviewedToday`) | đầu `index.js` (hoặc `today-strip.js` nhận `entries/progress/settings`) |
| `refreshDeckLocations`, `refreshFolders`, `rawFolderTree`, `flatFolders`, `locationsByDeckId` | `folder-store.js` (cache + `invalidate()`; xem bug #4) |
| `findFolder`, `getBreadcrumbChain` | `folder-store.js` (hàm thuần nhận `flatFolders`) |
| `togglePin` | `index.js` hoặc `ui-state.ts` (`togglePinned(folderId)` trả mảng mới) |
| `navigateToFolder/goBack/goForward/updateNavButtons`, `backBtn`, `forwardBtn` | `navigation.js` |
| `pathBarHost`, `renderBreadcrumbBar` (+ drop trên pill) | `breadcrumb.js` |
| `handleDropDeck`, `handleDropFolder` | `dnd.ts` — tách `canMoveFolderInto(dragged, target)` thuần (kiểm tra `target.path === dragged.path \|\| startsWith(dragged.path + '/')`) |
| `handleImportSdeck`, `handleFullBackup`, `handleFullRestore` | `transfer-actions.js` |
| `importMenu`, `backupMenu` | `menus.js` |
| `setViewMode`, `gridBtn`, `listBtn`, `viewToggleGroup` | `toolbar.js` |
| `sidebarHost`, `sidebarToggleBtn`, `toggleSidebar`, `renderSidebar` | `toolbar.js` (nút) + `index.js` (`renderSidebar` gọi `renderFolderTree`) |
| `toolbar` | `toolbar.js` |
| `todaySection` | `today-strip.js` |
| `handleFolderAction` | `folder-actions.js` |
| `deckCardActions` | `deck-actions.js` |
| `renderDeckSection` (filter bar) | `filter-bar.js` |
| `renderCardsOnly` (logic lọc/sắp xếp) | `query.ts` (thuần) |
| `renderCardsOnly` (dựng DOM) | `workspace.js` + `empty-state.js` |
| `onHomeKeyDown` | `keyboard.js` (kèm sửa bug #1) |

#### 6.3.1 `query.ts` — hàm thuần (dễ test)

```ts
export interface QueryInput {
  entries: Entry[]; flatFolders: Folder[];
  locationsByDeckId: Map<string, string | null>;
  selectedFolderId: 'all' | string | null;
  filterKind: 'all' | DeckKind; searchQuery: string; sortBy: 'due' | 'recent' | 'title';
  statsByUid: Map<number, DeckStats>;
  stripAccents: (s: string) => string; kindOf: (d: Deck) => DeckKind;
}
export function selectSubfolders(i: QueryInput): Folder[];
export function selectDecks(i: QueryInput): Entry[];   // gồm lọc + sắp xếp
```
Giữ **nguyên** thứ tự ưu tiên hiện tại: nguồn chuẩn là `locationsByDeckId`; fallback theo `e.group`/`e.relPath`.

### 6.4 `views/settings.js`

| Hiện tại | Chuyển tới |
|---|---|
| biến form (`newCardsVal`, `stepsVal`…) + kiểm tra trong `handleSave` | `form-state.ts`: `fromSettings(settings)`, `validate(form): { ok:true; value: Patch } \| { ok:false; error:string; field:'newCards'\|'steps' }` |
| `applyTheme` | `theme.js` |
| ô Theme + ô thư viện | `sections/appearance.js` |
| ô số thẻ mới + bước nhắc | `sections/learning.js` |
| `ttsVoiceSelect` + nút nghe thử | `sections/tts.js` |
| `loadBackups`, `renderBackupsList`, các nút sao lưu/xuất/nhập | `sections/backup.js` |
| `deckChoices`, `handleResetProgress`, thẻ thống kê | `sections/reset-progress.js` |
| `handleReset` (khôi phục mặc định) | `index.js` (gọi hàm `reset()` của từng section) |
| `handleSave` | `index.js` (gọi `validate`, rồi `actions.saveSettings`) |

Mỗi section export `createXxxSection({ settings, form, showError, actions })` trả `{ element, reset?() }`.

---

## 7. Các bước thực hiện (mỗi bước = 1 commit)

Với mọi bước: `npm run typecheck && npm test && npm run build`, rồi thử tay.

### Bước 1 — Thiết lập TS + build
Xem mục 3. **Thử tay**: mở app, vào Home, mở 1 bộ thẻ, học 1 câu.

### Bước 2 — Kiểu chung
`core/types.ts`, `types/api.d.ts` (mục 4). Chỉ khai báo.

### Bước 3 — Tách `app.js`
Thứ tự con: (3a) `runtime.js`, `state.ts`, `entries.ts`, `busy.js` → (3b) `progress.js`, `library.js` → (3c) `actions/*` + `actions/index.js` → (3d) `events.js`, `drafts.js` → (3e) `router.js` → (3f) rút gọn `app.js`.
**Thử tay**: mở/nhập deck, lưu `.sdeck`, nhân đôi, gỡ, quét thư viện, thay đổi file ngoài (watcher), mở bản nháp, chuyển qua đủ các màn.

### Bước 4 — Tách `session.js`
Thứ tự con: (4a) `labels`, `answer-chips`, `progress-bar` → (4b) `question/*` → (4c) `feedback/*` → (4d) `actions-row`, `empty-view`, `build-questions` → (4e) `keyboard.js` → (4f) `session-state.ts`, `item-meta.ts`, `submit.ts` (gõ kiểu) → (4g) `index.js`.
**Thử tay** (đủ 6 loại): `single`, `multi`, `fill`, `command`, `listen`, `card` (phím 1–4, Space, Enter). Thử: câu sai được hỏi lại; "Tôi chấm lại là đúng"; gắn sao (phím S); ghi chú; Esc thoát có hỏi xác nhận; Học thử từ Editor không ghi tiến độ; màn kết quả + "Học lại câu sai".

### Bước 5 — Tách `home.js`
Thứ tự con: (5a) `ui-state.ts`, `query.ts`, `folder-store.js` → (5b) `navigation`, `breadcrumb` → (5c) `dnd.ts`, `folder-actions`, `deck-actions`, `transfer-actions` → (5d) `menus`, `toolbar`, `today-strip`, `filter-bar` → (5e) `workspace`, `empty-state` → (5f) `keyboard`, `index.js`.
**Thử tay**: tạo/đổi tên/di chuyển/xoá thư mục; kéo thả deck vào sidebar/breadcrumb/thẻ thư mục; kéo thư mục vào chính nó (phải bị chặn); Back/Forward (Alt+←/→); Ctrl+B; tìm kiếm có dấu/không dấu; lọc loại; 3 kiểu sắp xếp; Grid/List; ghim thư mục; nhập `.sdeck`; sao lưu/khôi phục toàn bộ.

### Bước 6 — Tách `settings.js`
Thứ tự con: `theme.js`, `form-state.ts` → các `sections/*` → `index.js`.
**Thử tay**: đổi theme; đổi thư viện; số thẻ mới âm / bước nhắc `0` (phải báo lỗi); lưu; khôi phục mặc định; sao lưu nhanh/toàn bộ; khôi phục; xuất/nhập (gộp & thay thế); đặt lại SRS cho 1 bộ và toàn bộ.

### Bước 7 — Sửa lỗi (mục 8), mỗi lỗi 1 commit nhỏ

### Bước 8 — Chuyển `core/*` nhạy cảm sang TS
`progressio`, `srs`, `planner`, `grader` (nếu đang là `.js`): đổi đuôi, gõ kiểu bằng `types.ts`, sửa lỗi kiểu thật sự. Đưa `applyCardOverride`-liên quan (cập nhật `progress.cards`, `progress.log`) vào `progressio.ts` thành `applyOverrideToProgress(progress, key, nextCard, overrideLogEntry): Progress`.
Tách phần thuần của `applyResult`: `planApplyResult(entries, r, target) → { fields, toClose[], toRemove[], warn? }` rồi lớp mỏng thực thi tác dụng phụ.

### Bước 9 — Test
Viết test (Vitest hoặc test runner hiện có) cho:
- `query.ts`: lọc theo thư mục (nguồn `locationsByDeckId` vs fallback `group/relPath`), tìm kiếm không dấu, 3 kiểu sắp xếp (deck lỗi luôn cuối).
- `dnd.ts` → `canMoveFolderInto`: tự thân, con trực tiếp, cháu, anh em (thư mục tên có tiền tố giống: `A` và `AB` — không được coi `AB` là con của `A`).
- `submit.ts` → `gradeAnswer`: 6 loại câu, câu `card` với từng rating.
- `form-state.ts` → `validate`: rỗng, âm, không phải số, steps `0`/chữ, steps hợp lệ `"1, 10"`.
- `entries.ts` → `planApplyResult`: trùng `meta.id`, thay entry cùng path.

---

## 8. Lỗi/rủi ro đã phát hiện — cách sửa cụ thể (Bước 7)

1. **Rò listener phím ở Home.** `onHomeKeyDown` chỉ gỡ khi `!root.isConnected`, nhưng `#app` luôn nằm trong DOM → mỗi lần `render()` thêm một listener (Ctrl+B, Alt+←/→ bị chạy nhiều lần).
   Sửa: trong `keyboard.js` giữ biến module và gỡ cái cũ trước khi thêm:
   ```js
   let off = null;
   export function attachHomeKeyboard(ctx) {
     off?.();
     const handler = e => { /* như cũ */ };
     window.addEventListener('keydown', handler);
     off = () => window.removeEventListener('keydown', handler);
   }
   export const detachHomeKeyboard = () => { off?.(); off = null; };
   ```
   Router gọi `detachHomeKeyboard()` khi rời `home`.
2. **Listener phím phiên học còn lại sau khi thoát.** `activeCleanup` chỉ chạy khi gọi `renderSession` lần nữa.
   Sửa: export `disposeSession()` từ `session/index.js`; router gọi nó khi `state.route.name !== 'session'` trước khi render màn khác.
3. **`window.notify` vs `notify`.** Một số chỗ trong `home.js` gọi `window.notify` (có thể `undefined` → thông báo không hiện). Dùng `notify` đã import ở mọi nơi.
4. **`refreshFolders()` chạy mỗi lần `render()`.** Sửa: `folder-store.js` giữ cache; `renderHome` chỉ nạp khi cache rỗng hoặc đã `invalidate()`. Gọi `invalidate()` trong `events.js` ở `onFolderChanged`, `onDeckMoved`, `onDeckLinked`, `onDeckUnlinked` và sau mỗi thao tác thư mục/deck ở handlers. Đồng thời bỏ lần gọi trùng (`refreshFolders()` rồi `renderSidebar(); renderDeckSection();` ngay sau — `refreshFolders` đã render).
5. **`session.currentReviewResult` không khai báo ban đầu.** Thêm vào kiểu `SessionState` (`currentReviewResult?: { prevState; logEntry?; key }`).
6. **`getCurrentMeta()` ghi vào `progress.meta` khi chỉ đọc**, rồi `render()` gọi nhiều lần. Sửa: `getItemMeta` chỉ đọc, trả giá trị mặc định mà **không** gán; chỉ `setItemMeta` mới ghi và gọi `saveProgress`.
7. **`handleOverride` sửa `progress` trực tiếp** khác với `recordReview`. Chuyển logic vào `progressio.applyOverrideToProgress` (bước 8).
8. **`applyResult` trộn tính toán và tác dụng phụ** (`api.closeDeck`, `notify`, sửa `state.entries`). Tách như bước 8.
9. **Biến `newEntry` bị che** trong `actions.duplicateDeck` (`const newEntry = applyResult(...)` che hàm `newEntry` cấp module). Đổi tên biến cục bộ thành `copyEntry`.
10. **`choiceText` trong `session.js`** khai báo nhưng không thấy dùng → xoá nếu grep xác nhận.

Sau mỗi sửa lỗi: thêm 1 dòng vào `CHANGELOG`/commit message mô tả hành vi thay đổi.

---

## 9. Checklist nghiệm thu cuối

- [ ] `npm run typecheck`, `npm test`, `npm run build` đều sạch
- [ ] `app.js` ≤ ~50 dòng; `home/index.js`, `session/index.js`, `settings/index.js` ≤ ~150 dòng; không file nào > ~300 dòng
- [ ] Không còn `this.` trong `actions`
- [ ] Mỗi phím tắt Home/Session chỉ chạy **một lần** mỗi lần bấm (kiểm tra bằng `console.count` tạm trong handler rồi gỡ)
- [ ] Thử tay đủ checklist ở bước 3–6
- [ ] Mọi file `.ts` bật `strict`, không dùng `any` (trừ chỗ có comment `// TODO(type)` giải thích)
- [ ] README ghi: cách build, cách chạy test, quy ước ctx, danh sách file `.ts` và lý do

---

## 10. Prompt mẫu giao cho AI (mỗi lần 1 bước)

> Bạn là kỹ sư refactor. Đọc `REFACTOR_PLAN.md`. Thực hiện **Bước N** (chỉ bước này) cho dự án Turtle Deck.
> Ràng buộc: không đổi hành vi, không đổi tên export công khai, không thêm thư viện ngoài danh sách, chuyển code nguyên văn, mỗi file mới có comment đầu file.
> Quy trình: (1) đọc các file nguồn liên quan; (2) tạo file mới theo mục 5–6; (3) xoá code cũ đã chuyển; (4) chạy `npm run typecheck && npm test && npm run build` và sửa đến khi sạch; (5) báo cáo: danh sách file tạo/sửa/xoá, kết quả lệnh, các chỗ mơ hồ đã gặp và cách xử lý, và danh sách mục cần tôi thử tay.
> Nếu gặp chỗ không khớp tài liệu (hàm/biến không tồn tại, hành vi khác), **dừng và hỏi** thay vì đoán.
