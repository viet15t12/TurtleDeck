const { app, BrowserWindow, ipcMain, dialog, protocol, shell } = require('electron');
const fs = require('node:fs/promises');
const fsSync = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

// 1. Single Instance Lock (study-app.md mục 7.2 & Giai đoạn 6 F)
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
}

// Đăng ký scheme asset:// TRƯỚC khi app ready (study-app.md mục 7.10)
protocol.registerSchemesAsPrivileged([
  { scheme: 'asset', privileges: { standard: true, secure: true, supportFetchAPI: true } },
]);

let mainWindow = null;
let rendererReady = false;
const pendingExternalFiles = [];

const progressFile = () => path.join(app.getPath('userData'), 'progress.json');
const settingsFile = () => path.join(app.getPath('userData'), 'settings.json');
const backupsDir = () => path.join(app.getPath('userData'), 'backups');
const draftsDir = () => path.join(app.getPath('userData'), 'drafts');
const defaultLibraryDir = () => path.join(app.getPath('home'), 'StudyDecks');

// core là ES module → nạp bằng import() động (study-app.md mục 7.1)
let sdeck, parser, fsutil, assetprotocol, deckmodel, deckkinds, progressio, library;
async function loadCore() {
  [sdeck, parser, fsutil, assetprotocol, deckmodel, deckkinds, progressio, library] = await Promise.all([
    import('./src/core/sdeck.js'),
    import('./src/core/parser.js'),
    import('./src/core/fsutil.js'),
    import('./src/core/assetprotocol.js'),
    import('./src/core/deckmodel.js'),
    import('./src/core/deckkinds.js'),
    import('./src/core/progressio.js'),
    import('./src/core/library.js'),
  ]);
}

// Các gói đang mở: deckKey -> { file: string|null, assets: Map<'img/x.png', Uint8Array>, sourceDir? }
const packages = new Map();
const tempImports = new Map();
const newKey = () => crypto.randomBytes(6).toString('hex');

// Theo dõi thời điểm ghi file của chính app để watcher không kích hoạt lặp
const knownSaves = new Map(); // filePath -> timestamp ms

const SDECK_FILTER = [{ name: 'Bộ thẻ (.sdeck)', extensions: ['sdeck'] }];
const errMsg = e => (e && e.message) || String(e);
const pkgIssues = list => (list || []).map(msg => ({ level: 'warn', msg }));
const winOf = event => (event ? BrowserWindow.fromWebContents(event.sender) : mainWindow) || undefined;

// Lấy thư mục Thư viện hiện tại (từ settings hoặc mặc định ~/StudyDecks)
async function getActiveLibraryDir() {
  try {
    const s = await fsutil.loadSettingsFile(settingsFile());
    if (s?.libraryDir && typeof s.libraryDir === 'string') {
      return path.resolve(s.libraryDir);
    }
  } catch {}
  return defaultLibraryDir();
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 760,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('will-navigate', event => event.preventDefault());
  mainWindow.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    console.log(`[Renderer] ${message} (${sourceId}:${line})`);
  });
  mainWindow.loadFile(path.join(__dirname, 'src', 'index.html'));

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Bọc handler: lỗi bất ngờ → { ok:false, error } thay vì ném lỗi khó hiểu sang renderer
const handle = (channel, fn) => ipcMain.handle(channel, async (...args) => {
  try { return await fn(...args); }
  catch (e) { console.error(`[${channel}]`, e); return { ok: false, error: `Lỗi không mong muốn: ${errMsg(e)}` }; }
});

function slugify(s) {
  return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/gi, 'd')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'bo-the-moi';
}

// ── Kiểm tra đường dẫn và mở file bên ngoài (File Association & Second Instance) ──

async function validateSdeckPath(p) {
  if (typeof p !== 'string' || !p.trim()) return null;
  const resolved = path.resolve(p);
  if (!resolved.toLowerCase().endsWith('.sdeck')) return null;
  try {
    const real = await fs.realpath(resolved);
    const st = await fs.stat(real);
    if (st.isFile()) return real;
  } catch {}
  return null;
}

function extractSdeckFilesFromArgv(argv) {
  if (!Array.isArray(argv)) return [];
  return argv
    .filter(a => typeof a === 'string' && !a.startsWith('-') && a.toLowerCase().endsWith('.sdeck'))
    .map(p => path.resolve(p));
}

async function handleExternalFiles(filePaths) {
  const valid = [];
  for (const p of filePaths) {
    const v = await validateSdeckPath(p);
    if (v && !valid.includes(v)) valid.push(v);
  }
  if (!valid.length) return;

  if (rendererReady && mainWindow) {
    mainWindow.webContents.send('deck:openExternal', valid);
  } else {
    for (const v of valid) {
      if (!pendingExternalFiles.includes(v)) pendingExternalFiles.push(v);
    }
  }
}

app.on('second-instance', async (_event, commandLine) => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
    const files = extractSdeckFilesFromArgv(commandLine);
    await handleExternalFiles(files);
  }
});

app.on('open-file', async (event, filePath) => {
  event.preventDefault();
  await handleExternalFiles([filePath]);
});

ipcMain.on('app:ready', () => {
  rendererReady = true;
  if (pendingExternalFiles.length > 0 && mainWindow) {
    const files = [...pendingExternalFiles];
    pendingExternalFiles.length = 0;
    mainWindow.webContents.send('deck:openExternal', files);
  }
});

// ── Mở 1 file .sdeck vào bộ nhớ ───────────────────────────────────────────────

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
  const parsed = parser.parseDeck(pkg.deckText, { assets: pkg.assets });
  if (!parsed.ok) return fail(parsed.error, { issues: [...pkgIssues(pkg.issues), ...parsed.issues] });

  const deckKey = newKey();
  packages.set(deckKey, { file, assets: pkg.assets });

  // Đăng ký thư mục chứa file vào watcher nếu chưa có
  watchPath(path.dirname(file));

  return {
    path: file, ok: true, deckKey,
    deckText: pkg.deckText, deck: parsed.deck,
    issues: [...pkgIssues(pkg.issues), ...parsed.issues],
    total: parsed.total, skipped: parsed.skipped, assetCount: pkg.assets.size,
  };
}

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

// ── Nhập / Lưu / Xuất bản sao bộ thẻ ─────────────────────────────────────────

async function collectImportAssets(sourceDir, items) {
  const assets = new Map();
  const issues = [];
  if (!sourceDir || !items) return { assets, issues };

  let rootPrefix = sourceDir;
  try {
    const realRoot = await fs.realpath(sourceDir);
    rootPrefix = realRoot.endsWith(path.sep) ? realRoot : realRoot + path.sep;
  } catch {}

  for (const item of items) {
    const refs = deckmodel.imageRefs(item);
    for (const ref of refs) {
      if (/^[a-z][a-z0-9+.-]*:/i.test(ref) || ref.startsWith('//')) {
        issues.push({ level: 'warn', msg: `Bỏ qua ảnh ngoài gói: ${ref}` });
        continue;
      }
      if (!/\.(png|jpe?g|gif|webp|svg)$/i.test(ref)) {
        issues.push({ level: 'warn', msg: `Bỏ qua ảnh không hợp lệ: ${ref}` });
        continue;
      }
      try {
        const fullPath = path.resolve(sourceDir, ...ref.split('/'));
        const real = await fs.realpath(fullPath);
        if (!real.startsWith(rootPrefix)) {
          issues.push({ level: 'warn', msg: `Bỏ qua ảnh nằm ngoài thư mục nguồn: ${ref}` });
          continue;
        }
        const st = await fs.stat(real);
        if (!st.isFile() || st.size > sdeck.LIMITS.image) {
          issues.push({ level: 'warn', msg: `Bỏ qua ${ref}: tập tin không hợp lệ hoặc lớn hơn 5 MB.` });
          continue;
        }
        const buf = await fs.readFile(real);
        if (!sdeck.detectImageType(buf)) {
          issues.push({ level: 'warn', msg: `Bỏ qua ${ref}: nội dung không phải ảnh thật.` });
          continue;
        }
        const normRef = ref.startsWith('img/') ? ref : `img/${ref}`;
        assets.set(normRef, new Uint8Array(buf));
      } catch {
        issues.push({ level: 'warn', msg: `Không tìm thấy ảnh: ${ref}` });
      }
    }
  }
  return { assets, issues };
}

handle('deck:import', async (event, kind) => {
  const isDirPick = kind === 'dir';
  const isTextPick = kind === 'text';

  let dialogOptions;
  if (isDirPick) {
    dialogOptions = { title: 'Chọn thư mục chứa deck.json (và img/)', properties: ['openDirectory'] };
  } else if (isTextPick) {
    dialogOptions = {
      title: 'Chọn file dữ liệu (.csv, .tsv, .txt, .md)',
      properties: ['openFile'],
      filters: [
        { name: 'File dữ liệu (.csv, .tsv, .txt, .md)', extensions: ['csv', 'tsv', 'txt', 'md'] },
        { name: 'Tất cả tập tin', extensions: ['*'] },
      ],
    };
  } else {
    dialogOptions = {
      title: 'Chọn file nguồn bộ thẻ',
      properties: ['openFile'],
      filters: [
        { name: 'Nguồn bộ thẻ (.json, .csv, .tsv, .txt, .md)', extensions: ['json', 'csv', 'tsv', 'txt', 'md'] },
      ],
    };
  }

  const r = await dialog.showOpenDialog(winOf(event), dialogOptions);
  if (r.canceled || !r.filePaths.length) return null;

  const src = r.filePaths[0];
  const fail = error => ({ ok: false, source: src, error, issues: [{ level: 'error', msg: error }] });
  let isDir, targetFile;
  try {
    isDir = (await fs.stat(src)).isDirectory();
    targetFile = isDir ? path.join(src, 'deck.json') : src;
    const st = await fs.stat(targetFile);
    if (st.size > sdeck.LIMITS.deckJson) return fail('Tập tin quá lớn (hơn 20 MB).');
  } catch (e) {
    if (e.code === 'ENOENT') return fail(isDir ? 'Thư mục này không có deck.json.' : 'Không tìm thấy file.');
    return fail('Không đọc được nguồn: ' + errMsg(e));
  }

  const dir = isDir ? src : path.dirname(src);
  const ext = path.extname(targetFile).toLowerCase();

  if (!isDir && ['.csv', '.tsv', '.txt', '.md'].includes(ext)) {
    try {
      const content = await fs.readFile(targetFile, 'utf8');
      const parsed = parser.parseImport(content, { format: 'auto', hasSourceDir: true });
      if (!parsed.ok || !parsed.items?.length) {
        return fail('Không tìm thấy mục hợp lệ nào trong file để nhập.');
      }

      const inferredKind = deckkinds.inferKind(parsed.items);
      const title = path.basename(targetFile, ext);
      const deckId = `deck-${crypto.randomBytes(4).toString('hex')}`;
      const deck = {
        meta: { id: deckId, title, kind: inferredKind, created: Date.now() },
        items: parsed.items,
      };

      const { assets: tempAssets, issues: assetIssues } = await collectImportAssets(dir, parsed.items);
      const deckKey = newKey();
      const deckText = JSON.stringify(deck, null, 2);
      packages.set(deckKey, { file: null, assets: tempAssets, sourceDir: dir });

      return {
        ok: true, source: src, deckKey, deckText, deck,
        issues: [...pkgIssues(assetIssues), ...parsed.issues],
        total: parsed.items.length, skipped: 0, assetCount: tempAssets.size,
      };
    } catch (e) {
      return fail('Lỗi khi đọc file: ' + errMsg(e));
    }
  }

  try {
    const deckText = await fs.readFile(targetFile, 'utf8');
    const { assets, issues: assetIssues } = await sdeck.collectAssetsFromDir(dir, deckText);
    const parsed = parser.parseDeck(deckText, { assets });
    if (!parsed.ok) return { ...fail(parsed.error), issues: [...pkgIssues(assetIssues), ...parsed.issues] };
    const deckKey = newKey();
    packages.set(deckKey, { file: null, assets, sourceDir: dir });
    return {
      ok: true, source: src, deckKey, deckText, deck: parsed.deck,
      issues: [...pkgIssues(assetIssues), ...parsed.issues],
      total: parsed.total, skipped: parsed.skipped, assetCount: assets.size,
    };
  } catch (e) {
    return fail('Không đọc được nguồn: ' + errMsg(e));
  }
});

handle('deck:save', async (event, args) => {
  const { deckKey, deckText, saveAs = false, pruneUnused = true } = args || {};
  const pkg = packages.get(deckKey);
  if (!pkg) return { ok: false, error: 'Bộ thẻ không còn mở.' };
  if (typeof deckText !== 'string') return { ok: false, error: 'Nội dung bộ thẻ không hợp lệ.' };
  const parsed = parser.parseDeck(deckText);
  if (!parsed.ok) return { ok: false, error: parsed.error };

  let file = saveAs ? null : pkg.file;
  if (!file) {
    const libDir = await getActiveLibraryDir();
    const baseDir = pkg.file ? path.dirname(pkg.file) : (pkg.sourceDir ? path.dirname(pkg.sourceDir) : libDir);
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
    await fsutil.backupFile(file);
    await fsutil.atomicWrite(file, built.bytes);
    knownSaves.set(file, Date.now()); // đánh dấu self-save để watcher bỏ qua
  } catch (e) {
    return { ok: false, error: 'Không ghi được file: ' + errMsg(e) };
  }
  pkg.file = file;
  pkg.assets = built.keptAssets;
  watchPath(path.dirname(file));

  // Nếu có bản nháp của bộ thẻ này -> xoá sạch sau khi lưu thành công
  if (parsed.deck?.meta?.id) {
    const draftId = library.sanitizeDraftId(parsed.deck.meta.id);
    await fs.rm(path.join(draftsDir(), `${draftId}.sdeck`), { force: true }).catch(() => {});
    await fs.rm(path.join(draftsDir(), `${draftId}.json`), { force: true }).catch(() => {});
  }

  const reparsed = parser.parseDeck(check.deckText);
  return {
    ok: true, path: file, deckText: check.deckText, deck: reparsed.deck,
    issues: [...pkgIssues(check.issues), ...reparsed.issues],
    total: reparsed.total, skipped: reparsed.skipped, assetCount: built.keptAssets.size,
  };
});

handle('deck:close', (_e, deckKey) => packages.delete(deckKey));

// Xuất bản sao (giữ nguyên meta.id, chép file .sdeck đang lưu sang nơi khác)
handle('deck:exportCopy', async (event, filePath) => {
  const valid = await validateSdeckPath(filePath);
  if (!valid) return { ok: false, error: 'Bộ thẻ chưa có file trên đĩa hoặc đường dẫn không hợp lệ.' };

  const defaultName = path.basename(valid);
  const r = await dialog.showSaveDialog(winOf(event), {
    title: 'Xuất bản sao bộ thẻ (giữ nguyên mã bộ thẻ)',
    defaultPath: defaultName,
    filters: SDECK_FILTER,
  });
  if (r.canceled || !r.filePath) return { ok: false, canceled: true };

  const dest = r.filePath.toLowerCase().endsWith('.sdeck') ? r.filePath : r.filePath + '.sdeck';
  try {
    await fsutil.atomicWrite(dest, await fs.readFile(valid));
    return { ok: true, path: dest };
  } catch (e) {
    return { ok: false, error: 'Không thể xuất bản sao: ' + errMsg(e) };
  }
});

// Hiện file .sdeck trong trình quản lý thư mục hệ điều hành
handle('deck:showInFolder', async (_e, filePath) => {
  const valid = await validateSdeckPath(filePath);
  if (!valid) return { ok: false, error: 'Bộ thẻ chưa có file trên đĩa hoặc đường dẫn không hợp lệ.' };
  shell.showItemInFolder(valid);
  return { ok: true };
});

handle('deck:new', async () => {
  const deckKey = newKey();
  packages.set(deckKey, { file: null, assets: new Map() });
  return { ok: true, deckKey };
});

handle('deck:duplicate', async (_event, oldDeckKey) => {
  const oldPkg = packages.get(oldDeckKey);
  const deckKey = newKey();
  const newAssets = new Map();
  if (oldPkg?.assets) {
    for (const [k, v] of oldPkg.assets) newAssets.set(k, new Uint8Array(v));
  }
  packages.set(deckKey, { file: null, assets: newAssets });
  return { ok: true, deckKey, assetCount: newAssets.size };
});

// ── Quản lý ảnh trong gói ───────────────────────────────────────────────────

handle('asset:add', async (event, deckKey) => {
  const pkg = packages.get(deckKey);
  if (!pkg) return [];
  const r = await dialog.showOpenDialog(winOf(event), {
    title: 'Chèn ảnh vào bộ thẻ',
    properties: ['openFile', 'multiSelections'],
    filters: [{ name: 'Ảnh', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'] }],
  });
  if (r.canceled || !r.filePaths.length) return [];
  const results = [];
  for (const p of r.filePaths) {
    try {
      const bytes = await fs.readFile(p);
      results.push(sdeck.addImage(pkg.assets, path.basename(p), bytes));
    } catch (e) {
      results.push({ ok: false, error: errMsg(e) });
    }
  }
  return results;
});

handle('asset:addBytes', async (_event, deckKeyOrObj, name, bytes) => {
  let deckKey = deckKeyOrObj;
  let imgName = name;
  let rawBytes = bytes;
  if (typeof deckKeyOrObj === 'object' && deckKeyOrObj !== null) {
    deckKey = deckKeyOrObj.deckKey;
    imgName = deckKeyOrObj.name;
    rawBytes = deckKeyOrObj.bytes;
  }
  const pkg = packages.get(deckKey);
  if (!pkg) return { ok: false, error: 'Bộ thẻ không còn mở.' };
  if (!rawBytes) return { ok: false, error: 'Không có dữ liệu ảnh.' };
  const buf = Buffer.isBuffer(rawBytes) ? rawBytes : Buffer.from(rawBytes);
  return sdeck.addImage(pkg.assets, String(imgName || 'image.png'), buf);
});

handle('asset:list', (_event, deckKey) => {
  const pkg = packages.get(deckKey);
  if (!pkg) return [];
  return [...pkg.assets.entries()].map(([name, data]) => ({
    name, size: data.byteLength || data.length || 0,
  }));
});

handle('asset:remove', (_event, deckKeyOrObj, assetPath) => {
  let deckKey = deckKeyOrObj;
  let p = assetPath;
  if (typeof deckKeyOrObj === 'object' && deckKeyOrObj !== null) {
    deckKey = deckKeyOrObj.deckKey;
    p = deckKeyOrObj.assetPath;
  }
  const pkg = packages.get(deckKey);
  if (!pkg) return { ok: false, error: 'Bộ thẻ không còn mở.' };
  pkg.assets.delete(p);
  return { ok: true };
});

// ── Tiến độ & Cài đặt ───────────────────────────────────────────────────────

handle('progress:load', () => fsutil.loadProgressFile(progressFile()));
handle('progress:save', (_e, data) => fsutil.saveProgressFile(progressFile(), data));

handle('settings:load', () => fsutil.loadSettingsFile(settingsFile()));
handle('settings:save', (_e, data) => fsutil.saveSettingsFile(settingsFile(), data));

// ── Nhập hàng loạt xem trước ────────────────────────────────────────────────

handle('import:pickFile', async event => {
  const r = await dialog.showOpenDialog(winOf(event), {
    title: 'Chọn file nhập dữ liệu',
    properties: ['openFile'],
    filters: [
      { name: 'File dữ liệu (.csv, .tsv, .txt, .md)', extensions: ['csv', 'tsv', 'txt', 'md'] },
      { name: 'Tất cả tập tin', extensions: ['*'] },
    ],
  });
  if (r.canceled || !r.filePaths.length) return { canceled: true };
  const filePath = r.filePaths[0];
  const name = path.basename(filePath);
  const text = await fs.readFile(filePath, 'utf8');
  return { ok: true, path: filePath, name, text };
});

handle('import:preview', async (_event, args) => {
  const { path: filePath, text: rawText, format, options = {} } = args || {};
  let content = rawText;
  let hasSourceDir = false;
  let sourceDir = null;

  if (typeof filePath === 'string' && filePath.trim()) {
    try {
      content = await fs.readFile(filePath, 'utf8');
      sourceDir = path.dirname(path.resolve(filePath));
      hasSourceDir = true;
    } catch (e) {
      return { ok: false, error: 'Không đọc được file: ' + errMsg(e) };
    }
  }

  if (typeof content !== 'string') {
    return { ok: false, error: 'Chưa có nội dung văn bản để nhập.' };
  }

  const parsed = parser.parseImport(content, { ...options, format, hasSourceDir });
  let tempAssets = new Map();
  let assetIssues = [];

  if (hasSourceDir && sourceDir) {
    const collected = await collectImportAssets(sourceDir, parsed.items);
    tempAssets = collected.assets;
    assetIssues = collected.issues;
  }

  const importId = crypto.randomUUID();
  tempImports.set(importId, { assets: tempAssets, sourceDir, items: parsed.items });

  return {
    ok: true, format: parsed.format, items: parsed.items,
    issues: [...assetIssues, ...parsed.issues], importId, assetCount: tempAssets.size,
  };
});

handle('import:commit', async (_event, args) => {
  const { deckKey, importId, selectedIds } = args || {};
  if (!importId || !tempImports.has(importId)) return { ok: true, assetCount: 0 };
  const temp = tempImports.get(importId);
  tempImports.delete(importId);

  const pkg = deckKey ? packages.get(deckKey) : null;
  if (!pkg) return { ok: true, assetCount: 0 };

  if (temp?.assets && temp.assets.size > 0) {
    let allowedRefs = null;
    if (Array.isArray(selectedIds) && temp.items) {
      allowedRefs = new Set();
      const selSet = new Set(selectedIds);
      for (const item of temp.items) {
        if (selSet.has(item.id)) {
          for (const ref of deckmodel.imageRefs(item)) {
            const normRef = ref.startsWith('img/') ? ref : `img/${ref}`;
            allowedRefs.add(normRef);
            allowedRefs.add(ref);
          }
        }
      }
    }
    for (const [k, v] of temp.assets) {
      if (!allowedRefs || allowedRefs.has(k) || allowedRefs.has(k.replace(/^img\//, ''))) {
        pkg.assets.set(k, v);
      }
    }
  }
  return { ok: true, assetCount: pkg.assets.size };
});

// ── Thư viện: Quét đệ quy & Nhóm thư mục con (Section F) ─────────────────────

async function scanLibraryRecursively(dir, rootDir, depth = 0, results = [], maxFiles = 2000) {
  if (depth > 4 || results.length >= maxFiles) return results;
  let dirents;
  try {
    dirents = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return results;
  }

  let realRoot = rootDir;
  try { realRoot = await fs.realpath(rootDir); } catch {}

  for (const ent of dirents) {
    if (results.length >= maxFiles) break;
    const name = ent.name;
    if (name.startsWith('.')) continue; // bỏ thư mục/file ẩn

    const fullPath = path.join(dir, name);
    try {
      const real = await fs.realpath(fullPath);
      if (!real.startsWith(realRoot)) continue; // không theo symlink ra ngoài
    } catch {
      continue;
    }

    if (ent.isDirectory()) {
      await scanLibraryRecursively(fullPath, rootDir, depth + 1, results, maxFiles);
    } else if (ent.isFile() && name.toLowerCase().endsWith('.sdeck')) {
      if (name.endsWith('.bak') || name.endsWith('.tmp')) continue;
      const relPath = path.relative(rootDir, fullPath);
      results.push({ fullPath, relPath, name });
    }
  }
  return results;
}

handle('library:getDir', async () => getActiveLibraryDir());

handle('library:pickDir', async event => {
  const current = await getActiveLibraryDir();
  const r = await dialog.showOpenDialog(winOf(event), {
    title: 'Chọn thư mục Thư viện bộ thẻ',
    defaultPath: current,
    properties: ['openDirectory', 'createDirectory'],
  });
  if (r.canceled || !r.filePaths.length) return null;
  const picked = path.resolve(r.filePaths[0]);
  await fsutil.saveSettingsFile(settingsFile(), { libraryDir: picked });
  watchPath(picked);
  return picked;
});

handle('library:setDir', async (_event, dir) => {
  if (typeof dir !== 'string' || !dir.trim()) return { ok: false, error: 'Đường dẫn không hợp lệ.' };
  const resolved = path.resolve(dir);
  await fs.mkdir(resolved, { recursive: true }).catch(() => {});
  await fsutil.saveSettingsFile(settingsFile(), { libraryDir: resolved });
  watchPath(resolved);
  return { ok: true, libraryDir: resolved };
});

handle('library:scan', async () => {
  const libDir = await getActiveLibraryDir();
  await fs.mkdir(libDir, { recursive: true }).catch(() => {});
  watchPath(libDir);

  const scannedFiles = await scanLibraryRecursively(libDir, libDir);
  const decks = [];

  for (const item of scannedFiles) {
    const group = library.inferGroup(item.relPath);
    try {
      const st = await fs.stat(item.fullPath);
      if (st.size > sdeck.LIMITS.total) continue;
      const bytes = await fs.readFile(item.fullPath);
      const metaRes = sdeck.readPackageMeta(bytes);
      if (!metaRes.ok) {
        decks.push({
          path: item.fullPath, relPath: item.relPath, group, ok: false, error: metaRes.error,
        });
        continue;
      }
      const parsed = parser.parseDeck(metaRes.deckText);
      if (!parsed.ok) {
        decks.push({
          path: item.fullPath, relPath: item.relPath, group, ok: false, error: parsed.error,
        });
        continue;
      }
      decks.push({
        path: item.fullPath, relPath: item.relPath, group, ok: true,
        deck: parsed.deck, total: parsed.total,
      });
    } catch (e) {
      decks.push({
        path: item.fullPath, relPath: item.relPath, group, ok: false, error: errMsg(e),
      });
    }
  }

  return { ok: true, libraryDir: libDir, decks };
});

// ── Tự lưu nháp Editor (Auto-save draft, Section H) ──────────────────────────

handle('draft:save', async (_event, { metaId, deckKey, deckText }) => {
  if (!metaId || typeof deckText !== 'string') return { ok: false };
  const pkg = packages.get(deckKey);
  const assets = pkg?.assets || new Map();

  const draftId = library.sanitizeDraftId(metaId);
  const drafts = draftsDir();
  await fs.mkdir(drafts, { recursive: true }).catch(() => {});

  const built = sdeck.writePackage(deckText, assets, { prune: false });
  if (!built.ok) return { ok: false, error: built.error };

  const parsed = parser.parseDeck(deckText);
  const title = parsed?.deck?.meta?.title || 'Bộ thẻ chưa đặt tên';

  const sdeckPath = path.join(drafts, `${draftId}.sdeck`);
  const metaJsonPath = path.join(drafts, `${draftId}.json`);

  const metaData = {
    draftId,
    metaId,
    title,
    origFile: pkg?.file || null,
    draftedAt: Date.now(),
  };

  try {
    await fsutil.atomicWrite(sdeckPath, built.bytes);
    await fsutil.atomicWrite(metaJsonPath, JSON.stringify(metaData, null, 2));
    return { ok: true, draftId };
  } catch (e) {
    return { ok: false, error: errMsg(e) };
  }
});

handle('draft:delete', async (_event, metaId) => {
  if (!metaId) return { ok: true };
  const draftId = library.sanitizeDraftId(metaId);
  const drafts = draftsDir();
  await fs.rm(path.join(drafts, `${draftId}.sdeck`), { force: true }).catch(() => {});
  await fs.rm(path.join(drafts, `${draftId}.json`), { force: true }).catch(() => {});
  return { ok: true };
});

handle('draft:list', async () => {
  const drafts = draftsDir();
  await fs.mkdir(drafts, { recursive: true }).catch(() => {});
  let files;
  try {
    files = await fs.readdir(drafts);
  } catch {
    return [];
  }

  const list = [];
  for (const f of files) {
    if (!f.endsWith('.json')) continue;
    const jsonPath = path.join(drafts, f);
    const sdeckPath = path.join(drafts, f.replace(/\.json$/, '.sdeck'));
    try {
      const data = JSON.parse(await fs.readFile(jsonPath, 'utf8'));
      const st = await fs.stat(sdeckPath);
      if (st.isFile()) {
        let origChanged = false;
        if (data.origFile) {
          try {
            const origSt = await fs.stat(data.origFile);
            if (origSt.mtimeMs > data.draftedAt) origChanged = true;
          } catch {}
        }
        list.push({ ...data, sdeckPath, origChanged });
      }
    } catch {}
  }
  return list;
});

handle('draft:load', async (_event, draftId) => {
  const cleanId = library.sanitizeDraftId(draftId);
  const sdeckPath = path.join(draftsDir(), `${cleanId}.sdeck`);
  const jsonPath = path.join(draftsDir(), `${cleanId}.json`);
  let origFile = null;
  try {
    const meta = JSON.parse(await fs.readFile(jsonPath, 'utf8'));
    origFile = meta.origFile;
  } catch {}
  const res = await openOne(sdeckPath);
  if (res.ok && origFile) {
    // Gán lại đường dẫn file gốc để renderer biết đang sửa tiếp file nào
    const pkg = packages.get(res.deckKey);
    if (pkg) pkg.file = origFile;
    res.origFile = origFile;
  }
  return res;
});

// ── Sao lưu & Xuất / Nhập tiến độ (Section I) ───────────────────────────────

async function ensureDailyBackup() {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const fileName = progressio.backupFileName(Date.now(), tz);
  const dir = backupsDir();
  await fs.mkdir(dir, { recursive: true }).catch(() => {});
  const dest = path.join(dir, fileName);

  try {
    await fs.stat(dest);
    // Đã có bản sao lưu ngày hôm nay
  } catch (e) {
    if (e.code === 'ENOENT') {
      try {
        const pFile = progressFile();
        const pStat = await fs.stat(pFile);
        if (pStat.isFile()) {
          const content = await fs.readFile(pFile);
          await fsutil.atomicWrite(dest, content);
        }
      } catch {}
    }
  }

  // Dọn dẹp bản sao lưu cũ, chỉ giữ 7 ngày mới nhất
  try {
    const files = await fs.readdir(dir);
    const toDel = progressio.pickBackupsToDelete(files, 7);
    for (const name of toDel) {
      await fs.rm(path.join(dir, name), { force: true }).catch(() => {});
    }
  } catch {}
}

handle('backup:create', async () => {
  const dir = backupsDir();
  await fs.mkdir(dir, { recursive: true }).catch(() => {});
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const now = Date.now();
  const name = `progress-${progressio.dayKey(now, tz)}-manual-${now}.json`;
  const dest = path.join(dir, name);
  try {
    const content = await fs.readFile(progressFile());
    await fsutil.atomicWrite(dest, content);
    return { ok: true, name };
  } catch (e) {
    return { ok: false, error: errMsg(e) };
  }
});

handle('backup:list', async () => {
  const dir = backupsDir();
  await fs.mkdir(dir, { recursive: true }).catch(() => {});
  let files;
  try {
    files = await fs.readdir(dir);
  } catch {
    return [];
  }
  const result = [];
  for (const f of files) {
    if (!f.endsWith('.json')) continue;
    try {
      const st = await fs.stat(path.join(dir, f));
      result.push({ name: f, size: st.size, mtime: st.mtimeMs });
    } catch {}
  }
  result.sort((a, b) => b.mtime - a.mtime);
  return result;
});

handle('backup:restore', async (_event, name) => {
  if (typeof name !== 'string' || name.includes('/') || name.includes('\\')) {
    return { ok: false, error: 'Tên file sao lưu không hợp lệ.' };
  }
  const src = path.join(backupsDir(), name);
  try {
    const content = await fs.readFile(src, 'utf8');
    const validated = progressio.validateProgress(JSON.parse(content));
    if (!validated.ok) return { ok: false, error: validated.error };

    // Tự sao lưu bản hiện tại trước khi khôi phục
    await fsutil.backupFile(progressFile()).catch(() => {});
    await fsutil.saveProgressFile(progressFile(), validated.progress, { replace: true });
    return { ok: true, progress: validated.progress };
  } catch (e) {
    return { ok: false, error: 'Không khôi phục được bản sao lưu: ' + errMsg(e) };
  }
});

handle('backup:openFolder', async () => {
  const dir = backupsDir();
  await fs.mkdir(dir, { recursive: true }).catch(() => {});
  shell.openPath(dir);
  return { ok: true };
});

handle('progress:export', async event => {
  const p = await fsutil.loadProgressFile(progressFile());
  const data = progressio.exportProgress(p);
  const r = await dialog.showSaveDialog(winOf(event), {
    title: 'Xuất dữ liệu tiến trình học tập',
    defaultPath: `study-progress-${progressio.dayKey(Date.now())}.json`,
    filters: [{ name: 'JSON', extensions: ['json'] }],
  });
  if (r.canceled || !r.filePath) return { ok: false, canceled: true };
  try {
    await fsutil.atomicWrite(r.filePath, JSON.stringify(data, null, 2));
    return { ok: true, path: r.filePath };
  } catch (e) {
    return { ok: false, error: errMsg(e) };
  }
});

handle('progress:pickImport', async event => {
  const r = await dialog.showOpenDialog(winOf(event), {
    title: 'Chọn file dữ liệu tiến trình (.json)',
    properties: ['openFile'],
    filters: [{ name: 'JSON', extensions: ['json'] }],
  });
  if (r.canceled || !r.filePaths.length) return null;
  const filePath = r.filePaths[0];
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    const valid = progressio.validateProgress(parsed);
    if (!valid.ok) return { ok: false, error: valid.error };
    return {
      ok: true,
      path: filePath,
      preview: {
        cardsCount: Object.keys(valid.progress.cards).length,
        metaCount: Object.keys(valid.progress.meta).length,
        logCount: valid.progress.log.length,
      },
      importedProgress: valid.progress,
    };
  } catch (e) {
    return { ok: false, error: 'Tập tin JSON hỏng hoặc không đúng định dạng: ' + errMsg(e) };
  }
});

handle('progress:applyImport', async (_event, { importedProgress, mode = 'merge' }) => {
  const valid = progressio.validateProgress(importedProgress);
  if (!valid.ok) return { ok: false, error: valid.error };

  // 1. Tự động sao lưu tiến độ hiện tại TRƯỚC khi nhập
  await fsutil.backupFile(progressFile()).catch(() => {});

  const current = await fsutil.loadProgressFile(progressFile());
  const finalProg = mode === 'replace'
    ? valid.progress
    : progressio.mergeProgress(current, valid.progress);

  const res = await fsutil.saveProgressFile(progressFile(), finalProg, { replace: true });
  return res;
});

// ── Watcher: Theo dõi file .sdeck thay đổi từ bên ngoài (Section G) ──────────

const watchedDirs = new Set();
const watchDebouncers = new Map();

function watchPath(dirPath) {
  if (!dirPath || typeof dirPath !== 'string') return;
  const resolved = path.resolve(dirPath);
  if (watchedDirs.has(resolved)) return;
  watchedDirs.add(resolved);

  try {
    const watcher = fsSync.watch(resolved, { recursive: false }, (eventType, filename) => {
      if (!filename || !filename.toLowerCase().endsWith('.sdeck')) return;
      if (filename.endsWith('.tmp') || filename.endsWith('.bak')) return;

      const fullFile = path.join(resolved, filename);
      const timerKey = fullFile;
      if (watchDebouncers.has(timerKey)) {
        clearTimeout(watchDebouncers.get(timerKey));
      }

      watchDebouncers.set(timerKey, setTimeout(async () => {
        watchDebouncers.delete(timerKey);
        await onWatchedFileChanged(fullFile);
      }, 500));
    });

    watcher.on('error', () => {
      watchedDirs.delete(resolved);
    });
  } catch {}
}

async function onWatchedFileChanged(filePath) {
  let st;
  try {
    st = await fs.stat(filePath);
    if (!st.isFile()) return;
  } catch (e) {
    if (e.code === 'ENOENT') {
      // File đã bị xoá
      if (mainWindow && rendererReady) {
        mainWindow.webContents.send('deck:fileRemoved', { path: filePath });
      }
      return;
    }
    return;
  }

  // Bỏ qua nếu do chính app vừa ghi
  if (library.isSelfSaveEvent(filePath, st.mtimeMs, knownSaves)) {
    return;
  }

  // Đợi kích thước file ổn định (tránh đọc file đang chép dở)
  await new Promise(r => setTimeout(r, 200));
  let bytes;
  try {
    bytes = await fs.readFile(filePath);
  } catch {
    return;
  }

  const pkg = sdeck.readPackage(bytes);
  if (!pkg.ok) {
    if (mainWindow && rendererReady) {
      mainWindow.webContents.send('deck:watchError', { path: filePath, error: pkg.error });
    }
    return;
  }

  const parsed = parser.parseDeck(pkg.deckText, { assets: pkg.assets });
  if (!parsed.ok) {
    if (mainWindow && rendererReady) {
      mainWindow.webContents.send('deck:watchError', { path: filePath, error: parsed.error });
    }
    return;
  }

  // Tìm gói trong packages (nếu file này đang mở)
  const openedEntry = [...packages.entries()].find(([_k, v]) => v.file && path.resolve(v.file) === path.resolve(filePath));

  if (openedEntry) {
    const [deckKey, pkgObj] = openedEntry;
    pkgObj.assets = pkg.assets; // GIỮ NGUYÊN deckKey để asset:// không gãy
    if (mainWindow && rendererReady) {
      mainWindow.webContents.send('deck:changed', {
        path: filePath,
        deckKey,
        deckText: pkg.deckText,
        deck: parsed.deck,
        total: parsed.total,
        assetCount: pkg.assets.size,
      });
    }
  } else {
    // File mới xuất hiện trong thư viện
    if (mainWindow && rendererReady) {
      mainWindow.webContents.send('deck:fileAdded', {
        path: filePath,
        deck: parsed.deck,
        total: parsed.total,
      });
    }
  }
}

// ── Asset Protocol ──────────────────────────────────────────────────────────

function registerAssetProtocol() {
  protocol.handle('asset', req => {
    try {
      const res = assetprotocol.handleAssetUrl(req.url, packages);
      if (res.status === 200) {
        return new Response(res.data, { headers: res.headers });
      }
      return new Response('Not found', { status: 404 });
    } catch {
      return new Response('Not found', { status: 404 });
    }
  });
}

// ── Lifecycle App ───────────────────────────────────────────────────────────

app.whenReady().then(async () => {
  await loadCore();
  registerAssetProtocol();

  // Khởi tạo các thư mục lưu trữ cần thiết
  await fs.mkdir(backupsDir(), { recursive: true }).catch(() => {});
  await fs.mkdir(draftsDir(), { recursive: true }).catch(() => {});
  const libDir = await getActiveLibraryDir();
  await fs.mkdir(libDir, { recursive: true }).catch(() => {});
  watchPath(libDir);

  // Chạy sao lưu tự động hàng ngày lúc khởi động & định kỳ mỗi giờ
  await ensureDailyBackup().catch(e => console.error('[Backup Error]', e));
  setInterval(() => {
    ensureDailyBackup().catch(e => console.error('[Backup Error]', e));
  }, 3600000);

  createWindow();

  // Kiểm tra file .sdeck truyền qua argv lúc mở app
  const argvFiles = extractSdeckFilesFromArgv(process.argv);
  if (argvFiles.length > 0) {
    handleExternalFiles(argvFiles);
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
