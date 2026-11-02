const { app, BrowserWindow, ipcMain, dialog, protocol, shell } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');

// Đăng ký scheme asset:// TRƯỚC khi app ready (study-app.md mục 7.10)
protocol.registerSchemesAsPrivileged([
  { scheme: 'asset', privileges: { standard: true, secure: true, supportFetchAPI: true } },
]);

const progressFile = () => path.join(app.getPath('userData'), 'progress.json');
const settingsFile = () => path.join(app.getPath('userData'), 'settings.json');

// core là ES module → nạp bằng import() động (study-app.md mục 7.1)
let sdeck, parser, fsutil, assetprotocol, deckmodel, deckkinds;
async function loadCore() {
  [sdeck, parser, fsutil, assetprotocol, deckmodel, deckkinds] = await Promise.all([
    import('./src/core/sdeck.js'),
    import('./src/core/parser.js'),
    import('./src/core/fsutil.js'),
    import('./src/core/assetprotocol.js'),
    import('./src/core/deckmodel.js'),
    import('./src/core/deckkinds.js'),
  ]);
}

// Các gói đang mở: deckKey -> { file: string|null, assets: Map<'img/x.png', Uint8Array>, sourceDir? }
// deckKey ngẫu nhiên (a-f0-9), sẽ dùng làm "host" của asset:// ở GĐ2B
const packages = new Map();
const tempImports = new Map(); // importId -> { assets: Map, sourceDir }
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
  window.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    console.log(`[Renderer] ${message} (${sourceId}:${line})`);
  });
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
  const parsed = parser.parseDeck(pkg.deckText, { assets: pkg.assets });
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

// Nhập .json hoặc thư mục (deck.json + img/) → gói trong bộ nhớ, chưa có file; sau đó renderer gọi deck:save.
// Trên Linux hộp thoại không chọn được cả file lẫn thư mục cùng lúc → renderer truyền kind: 'file' | 'dir' | 'text'.
// GĐ4 thêm csv/tsv/txt/md.
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

  // Nhập từ định dạng bảng/văn bản (.csv, .tsv, .txt, .md)
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
        meta: {
          id: deckId,
          title,
          kind: inferredKind,
          created: Date.now(),
        },
        items: parsed.items,
      };

      // Thu thập ảnh từ thư mục chứa file
      const { assets: tempAssets, issues: assetIssues } = await collectImportAssets(dir, parsed.items);
      const deckKey = newKey();
      const deckText = JSON.stringify(deck, null, 2);
      packages.set(deckKey, { file: null, assets: tempAssets, sourceDir: dir });

      return {
        ok: true,
        source: src,
        deckKey,
        deckText,
        deck,
        issues: [...pkgIssues(assetIssues), ...parsed.issues],
        total: parsed.items.length,
        skipped: 0,
        assetCount: tempAssets.size,
      };
    } catch (e) {
      return fail('Lỗi khi đọc file: ' + errMsg(e));
    }
  }

  // Nhập từ file deck.json hoặc thư mục deck.json + img/
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

// Hiện file .sdeck trong trình quản lý thư mục của hệ điều hành
handle('deck:showInFolder', (_e, filePath) => {
  if (typeof filePath !== 'string' || !filePath.trim()) {
    return { ok: false, error: 'Bộ thẻ chưa có file trên đĩa.' };
  }
  shell.showItemInFolder(path.resolve(filePath));
  return { ok: true };
});

// Tạo bộ thẻ mới trong bộ nhớ
handle('deck:new', async () => {
  const deckKey = newKey();
  packages.set(deckKey, { file: null, assets: new Map() });
  return { ok: true, deckKey };
});

// Nhân đôi bộ thẻ (kèm toàn bộ ảnh) trong bộ nhớ
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

// ── Quản lý ảnh trong gói (Editor) ───────────────────────────────────────────

// Nút "Chèn ảnh" (hộp thoại chọn 1 hoặc nhiều ảnh)
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

// Kéo thả / dán clipboard (Ctrl+V)
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

// Liệt kê ảnh trong gói kèm kích thước
handle('asset:list', (_event, deckKey) => {
  const pkg = packages.get(deckKey);
  if (!pkg) return [];
  return [...pkg.assets.entries()].map(([name, data]) => ({
    name,
    size: data.byteLength || data.length || 0,
  }));
});

// Xoá một ảnh khỏi gói
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

// ── Tiến độ và cài đặt (ghi atomic, tuần tự hoá, giữ .bak, hợp nhất an toàn) ──

handle('progress:load', () => fsutil.loadProgressFile(progressFile()));
handle('progress:save', (_e, data) => fsutil.saveProgressFile(progressFile(), data));

// decks: đường dẫn các .sdeck đã mở (tự nạp lại khi mở app); newCardsPerDay, learnSteps, độ rộng cột Editor...
handle('settings:load', () => fsutil.loadSettingsFile(settingsFile()));
handle('settings:save', (_e, data) => fsutil.saveSettingsFile(settingsFile(), data));

// ── Nhập hàng loạt (CSV, TSV, Quizlet, Markdown) ───────────────────────────

// Hộp thoại chọn file nhập dữ liệu (.csv, .tsv, .txt, .md)
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

// Xem trước dữ liệu nhập và thu thập ảnh tạm thời từ thư mục file nguồn
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

  // Thu thập ảnh từ thư mục nguồn nếu có
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
    ok: true,
    format: parsed.format,
    items: parsed.items,
    issues: [...assetIssues, ...parsed.issues],
    importId,
    assetCount: tempAssets.size,
  };
});

// Chuyển ảnh đã chọn vào gói bộ thẻ đang mở
handle('import:commit', async (_event, args) => {
  const { deckKey, importId, selectedIds } = args || {};
  if (!importId || !tempImports.has(importId)) {
    return { ok: true, assetCount: 0 };
  }
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

app.whenReady().then(async () => {
  await loadCore();
  registerAssetProtocol();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
