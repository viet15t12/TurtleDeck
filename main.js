const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');

const progressFile = () => path.join(app.getPath('userData'), 'progress.json');
const settingsFile = () => path.join(app.getPath('userData'), 'settings.json');

// core là ES module → nạp bằng import() động (study-app.md mục 7.1)
let sdeck, parser, fsutil;
async function loadCore() {
  [sdeck, parser, fsutil] = await Promise.all([
    import('./src/core/sdeck.js'),
    import('./src/core/parser.js'),
    import('./src/core/fsutil.js'),
  ]);
}

// Các gói đang mở: deckKey -> { file: string|null, assets: Map<'img/x.png', Uint8Array>, sourceDir? }
// deckKey ngẫu nhiên (a-f0-9), sẽ dùng làm "host" của asset:// ở GĐ2B
const packages = new Map();
const newKey = () => crypto.randomBytes(6).toString('hex');

const SDECK_FILTER = [{ name: 'Bộ thẻ (.sdeck)', extensions: ['sdeck'] }];
const errMsg = e => (e && e.message) || String(e);
const pkgIssues = list => (list || []).map(msg => ({ level: 'warn', msg }));
const winOf = event => BrowserWindow.fromWebContents(event.sender) || undefined;

function createWindow() {
  const window = new BrowserWindow({
    width: 1100,
    height: 760,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', event => event.preventDefault());
  window.loadFile(path.join(__dirname, 'src', 'index.html'));
}

// Bọc handler: lỗi bất ngờ → { ok:false, error } thay vì ném lỗi khó hiểu sang renderer
const handle = (channel, fn) => ipcMain.handle(channel, async (...args) => {
  try { return await fn(...args); }
  catch (e) { console.error(`[${channel}]`, e); return { ok: false, error: `Lỗi không mong muốn: ${errMsg(e)}` }; }
});

// tên file gợi ý từ tiêu đề bộ thẻ
function slugify(s) {
  return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/gi, 'd')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'bo-the-moi';
}

// ── Mở / nhập / lưu bộ thẻ ───────────────────────────────────────────────────

// Mở 1 file .sdeck vào bộ nhớ (không giải nén ra đĩa) → kết quả cho renderer
async function openOne(p) {
  if (typeof p !== 'string' || !p.trim()) return { path: String(p), ok: false, error: 'Đường dẫn không hợp lệ.' };
  const file = path.resolve(p);
  const fail = (error, extra = {}) => ({ path: file, ok: false, error, issues: [{ level: 'error', msg: error }], ...extra });
  if (path.extname(file).toLowerCase() !== '.sdeck') return fail('Chỉ mở được file bộ thẻ có đuôi .sdeck.');

  let bytes;
  try {
    const st = await fs.stat(file);
    if (!st.isFile()) return fail('Đường dẫn không phải là file.');
    if (st.size > sdeck.LIMITS.total) return fail('File quá lớn (hơn 500 MB).');
    bytes = await fs.readFile(file);
  } catch (e) {
    if (e.code === 'ENOENT') return fail('File không còn tồn tại (đã bị xoá hoặc di chuyển).', { missing: true });
    if (e.code === 'EACCES' || e.code === 'EPERM') return fail('Không có quyền đọc file.');
    return fail('Không đọc được file: ' + errMsg(e));
  }

  const pkg = sdeck.readPackage(bytes);
  if (!pkg.ok) return fail(pkg.error);
  const parsed = parser.parseDeck(pkg.deckText);
  if (!parsed.ok) return fail(parsed.error, { issues: [...pkgIssues(pkg.issues), ...parsed.issues] });

  const deckKey = newKey();
  packages.set(deckKey, { file, assets: pkg.assets });
  return {
    path: file, ok: true, deckKey,
    deckText: pkg.deckText, deck: parsed.deck,
    issues: [...pkgIssues(pkg.issues), ...parsed.issues],
    total: parsed.total, skipped: parsed.skipped, assetCount: pkg.assets.size,
  };
}

// Mở file .sdeck. Có filePath (chuỗi hoặc mảng): mở thẳng (mở lại khi khởi động); không có: hiện hộp thoại (nhiều file).
handle('deck:open', async (event, filePath) => {
  let paths = typeof filePath === 'string' ? [filePath]
    : Array.isArray(filePath) ? filePath.filter(p => typeof p === 'string') : null;
  if (!paths) {
    const r = await dialog.showOpenDialog(winOf(event), {
      title: 'Mở bộ thẻ', properties: ['openFile', 'multiSelections'], filters: SDECK_FILTER,
    });
    if (r.canceled) return [];
    paths = r.filePaths;
  }
  const out = [];
  for (const p of paths) out.push(await openOne(p));
  return out;
});

// Nhập .json hoặc thư mục (deck.json + img/) → gói trong bộ nhớ, chưa có file; sau đó renderer gọi deck:save.
// Trên Linux hộp thoại không chọn được cả file lẫn thư mục cùng lúc → renderer truyền kind: 'file' | 'dir'.
// GĐ4 thêm csv/tsv/md.
handle('deck:import', async (event, kind) => {
  const isDirPick = kind === 'dir';
  const r = await dialog.showOpenDialog(winOf(event), isDirPick
    ? { title: 'Chọn thư mục chứa deck.json (và img/)', properties: ['openDirectory'] }
    : { title: 'Chọn file deck .json', properties: ['openFile'], filters: [{ name: 'Nguồn bộ thẻ (.json)', extensions: ['json'] }] });
  if (r.canceled || !r.filePaths.length) return null;

  const src = r.filePaths[0];
  const fail = error => ({ ok: false, source: src, error, issues: [{ level: 'error', msg: error }] });
  let isDir, jsonFile;
  try {
    isDir = (await fs.stat(src)).isDirectory();
    jsonFile = isDir ? path.join(src, 'deck.json') : src;
    const st = await fs.stat(jsonFile);
    if (st.size > sdeck.LIMITS.deckJson) return fail('deck.json quá lớn (hơn 20 MB).');
  } catch (e) {
    if (e.code === 'ENOENT') return fail(isDir ? 'Thư mục này không có deck.json.' : 'Không tìm thấy file.');
    return fail('Không đọc được nguồn: ' + errMsg(e));
  }
  const deckText = (await fs.readFile(jsonFile, 'utf8')).replace(/^\uFEFF/, '');
  const parsed = parser.parseDeck(deckText);
  if (!parsed.ok) return { ...fail(parsed.error), issues: parsed.issues };

  // đọc các ảnh được tham chiếu từ thư mục nguồn: realpath phải nằm trong `dir`, đúng đuôi/nội dung ảnh, ≤ 5 MB
  const dir = isDir ? src : path.dirname(src);
  const { assets, issues: assetIssues } = await sdeck.collectAssetsFromDir(dir, deckText);
  const deckKey = newKey();
  packages.set(deckKey, { file: null, assets, sourceDir: dir });
  return {
    ok: true, source: src, deckKey, deckText, deck: parsed.deck,
    issues: [...pkgIssues(assetIssues), ...parsed.issues],
    total: parsed.total, skipped: parsed.skipped, assetCount: assets.size,
  };
});

// Lưu. saveAs=true hoặc chưa có file → hộp thoại "Lưu thành…". Luôn kiểm tra lại ở main (không tin renderer).
// Quy trình: kiểm tra deck → nén → đọc lại kiểm tra → .bak bản cũ → ghi .tmp → rename.
handle('deck:save', async (event, args) => {
  const { deckKey, deckText, saveAs = false, pruneUnused = true } = args || {};
  const pkg = packages.get(deckKey);
  if (!pkg) return { ok: false, error: 'Bộ thẻ không còn mở.' };
  if (typeof deckText !== 'string') return { ok: false, error: 'Nội dung bộ thẻ không hợp lệ.' };
  const parsed = parser.parseDeck(deckText);
  if (!parsed.ok) return { ok: false, error: parsed.error };

  let file = saveAs ? null : pkg.file;
  if (!file) {
    const baseDir = pkg.file ? path.dirname(pkg.file) : (pkg.sourceDir ? path.dirname(pkg.sourceDir) : app.getPath('documents'));
    const r = await dialog.showSaveDialog(winOf(event), {
      title: 'Lưu thành .sdeck',
      defaultPath: path.join(baseDir, slugify(parsed.deck.meta.title) + '.sdeck'),
      filters: SDECK_FILTER,
    });
    if (r.canceled || !r.filePath) return { ok: false, canceled: true };
    file = r.filePath.toLowerCase().endsWith('.sdeck') ? r.filePath : r.filePath + '.sdeck';
  }

  const built = sdeck.writePackage(deckText, pkg.assets, { prune: pruneUnused });
  if (!built.ok) return { ok: false, error: built.error };
  const check = sdeck.readPackage(built.bytes);
  if (!check.ok || !parser.parseDeck(check.deckText).ok) return { ok: false, error: 'Gói vừa nén không đọc lại được, chưa ghi file.' };

  try {
    await fsutil.backupFile(file);                 // giữ bản lần lưu trước: .sdeck.bak
    await fsutil.atomicWrite(file, built.bytes);
  } catch (e) {
    return { ok: false, error: 'Không ghi được file: ' + errMsg(e) };
  }
  pkg.file = file;
  pkg.assets = built.keptAssets;
  const reparsed = parser.parseDeck(check.deckText);
  return {
    ok: true, path: file, deckText: check.deckText, deck: reparsed.deck,
    issues: [...pkgIssues(check.issues), ...reparsed.issues],
    total: reparsed.total, skipped: reparsed.skipped, assetCount: built.keptAssets.size,
  };
});

handle('deck:close', (_e, deckKey) => packages.delete(deckKey));

// ── Tiến độ và cài đặt (ghi atomic) ──────────────────────────────────────────

const isPlainObject = v => v !== null && typeof v === 'object' && !Array.isArray(v);

async function loadJson(file, fallback) {
  try {
    const data = JSON.parse(await fs.readFile(file, 'utf8'));
    return isPlainObject(data) ? data : fallback;
  } catch { return fallback; }
}

handle('progress:load', () => loadJson(progressFile(), { version: 1, cards: {}, log: [] }));
handle('progress:save', async (_e, data) => {
  if (!isPlainObject(data)) return { ok: false, error: 'Dữ liệu tiến độ không hợp lệ.' };
  await fsutil.atomicWrite(progressFile(), JSON.stringify(data));
  return { ok: true };
});

// decks: đường dẫn các .sdeck đã mở (tự nạp lại khi mở app)
handle('settings:load', async () => {
  const s = await loadJson(settingsFile(), { version: 1, decks: [] });
  if (!Array.isArray(s.decks)) s.decks = [];
  s.decks = s.decks.filter(p => typeof p === 'string');
  return s;
});
handle('settings:save', async (_e, data) => {
  if (!isPlainObject(data)) return { ok: false, error: 'Dữ liệu cài đặt không hợp lệ.' };
  await fsutil.atomicWrite(settingsFile(), JSON.stringify(data, null, 2));
  return { ok: true };
});

app.whenReady().then(async () => {
  await loadCore();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
