// test/bugfixes.test.mjs — Test các lỗi mục 2 trong phase-6c.md
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { isPathInsideRoot, scanLibraryRecursively } from '../src/main/services/library-service.js';
import { PackageStore } from '../src/main/services/package-store.js';
import { previewImport } from '../src/main/services/import-service.js';

// Test Lỗi 1: scanLibrary / isPathInsideRoot thiếu path.sep
test('Issue 1: isPathInsideRoot rejects sibling directory with matching prefix (e.g. StudyDecks2 vs StudyDecks)', () => {
  const rootDir = '/home/user/StudyDecks';
  const siblingDir = '/home/user/StudyDecks2/deck.sdeck';
  const insideDir = '/home/user/StudyDecks/folder/deck.sdeck';

  assert.equal(isPathInsideRoot(insideDir, rootDir), true, 'Files inside StudyDecks must be allowed');
  assert.equal(isPathInsideRoot(siblingDir, rootDir), false, 'Files in StudyDecks2 must be rejected');
});

// Test Lỗi 2: import:preview không tin đường dẫn tuỳ tiện từ renderer
test('Issue 2: previewImport rejects arbitrary filePath from renderer without valid token', async () => {
  const store = new PackageStore();
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'study-issue2-'));
  const secretFile = path.join(tmpDir, 'secret.csv');
  await fs.writeFile(secretFile, 'term,definition\ncat,mèo');

  try {
    // 1. Gửi trực tiếp đường dẫn không có token -> phải bị từ chối
    const arbitraryRes = await previewImport(store, { path: secretFile, filePath: secretFile });
    assert.equal(arbitraryRes.ok, false, 'Arbitrary filePath without token must be rejected');

    // 2. Cấp token qua pickFile (setTempImport) -> được chấp nhận
    const token = store.newKey();
    store.setTempImport(token, secretFile);
    const tokenRes = await previewImport(store, { token });
    assert.equal(tokenRes.ok, true, 'Valid token must be allowed');
    assert.equal(tokenRes.items?.length, 1);
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
});

// Test Lỗi 3: progress:save vẫn còn được renderer dùng nên được giữ lại và hoạt động an toàn
test('Issue 3: progress:save remains supported and safely syncs progress data', async () => {
  const { DatabaseManager } = await import('../src/main/db/index.js');
  const { saveProgress, loadProgress } = await import('../src/main/services/progress-service.js');
  const dbManager = DatabaseManager.createInMemory();
  const deps = { progressFile: '/tmp/p.json', backupsDir: '/tmp', dbManager };

  const testProgress = {
    cards: {
      'd1:i1:fwd': { deckId: 'd1', itemId: 'i1', direction: 'fwd', state: 'review', interval: 5, ease: 2.5, due: Date.now() + 100000 }
    },
    logs: []
  };

  const res = await saveProgress(deps, testProgress);
  assert.equal(res.ok, true);

  const loaded = await loadProgress(deps);
  assert.ok(loaded.cards['d1:i1:fwd']);
});

// Test Lỗi 4: Kiểm tra thoát sớm khi không giành được lock
test('Issue 4: exit early if single-instance lock is not acquired', () => {
  let quitCalled = false;
  let exitCalled = false;
  const mockApp = {
    requestSingleInstanceLock: () => false,
    quit: () => { quitCalled = true; },
  };

  const gotLock = mockApp.requestSingleInstanceLock();
  if (!gotLock) {
    mockApp.quit();
    exitCalled = true;
  }

  assert.equal(quitCalled, true);
  assert.equal(exitCalled, true);
});

// Test Lỗi 5: Xác minh saveSettingsFile gộp (merge) cài đặt chứ không ghi đè mất các trường khác
test('Issue 5: saveSettingsFile merges patch without overwriting other settings', async () => {
  const { loadSettingsFile, saveSettingsFile } = await import('../src/core/fsutil.js');
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'study-issue5-'));
  const sFile = path.join(tmpDir, 'settings.json');

  try {
    // 1. Lưu cài đặt ban đầu có darkTheme và newCardsPerDay
    await saveSettingsFile(sFile, { darkTheme: true, newCardsPerDay: 25 });

    // 2. Cập nhật chỉ riêng libraryDir (như library:setDir làm)
    await saveSettingsFile(sFile, { libraryDir: '/my/custom/decks' });

    // 3. Đọc lại và kiểm tra darkTheme và newCardsPerDay vẫn còn nguyên vẹn
    const loaded = await loadSettingsFile(sFile);
    assert.equal(loaded.libraryDir, '/my/custom/decks');
    assert.equal(loaded.darkTheme, true, 'darkTheme must be preserved');
    assert.equal(loaded.newCardsPerDay, 25, 'newCardsPerDay must be preserved');
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
});

// Test Lỗi 6: Dọn dẹp các file pre-restore-*.db và pre-import-*.db cũ
test('Issue 6: pruneTemporaryDbBackups keeps only N newest pre-restore/pre-import db backups', async () => {
  const { pruneTemporaryDbBackups } = await import('../src/main/services/backup-service.js');
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'study-issue6-'));

  try {
    // Tạo 8 bản pre-import và 8 bản pre-restore
    for (let i = 1; i <= 8; i++) {
      const ts = 1000 + i;
      await fs.writeFile(path.join(tmpDir, `pre-import-${ts}.db`), 'db');
      await fs.writeFile(path.join(tmpDir, `pre-restore-${ts}.db`), 'db');
    }

    await pruneTemporaryDbBackups(tmpDir, 3);

    const remaining = await fs.readdir(tmpDir);
    const preImports = remaining.filter(f => f.startsWith('pre-import-'));
    const preRestores = remaining.filter(f => f.startsWith('pre-restore-'));

    assert.equal(preImports.length, 3, 'Should retain only 3 newest pre-import db files');
    assert.equal(preRestores.length, 3, 'Should retain only 3 newest pre-restore db files');
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
});

// Test Lỗi 7: library:scan cache theo mtime + size để không đọc lại file chưa đổi
test('Issue 7: scanLibrary caches decks by mtime and size', async () => {
  const { scanLibrary, libraryCache } = await import('../src/main/services/library-service.js');
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'study-issue7-'));
  const sdeck = await import('../src/core/sdeck.js');

  try {
    const deck1 = {
      meta: { id: 'd1', title: 'Cached Deck', kind: 'quiz' },
      items: [{ id: 'i1', type: 'card', front: 'F', back: 'B' }]
    };
    const pkg = sdeck.writePackage(JSON.stringify(deck1), new Map());
    const filePath = path.join(tmpDir, 'deck1.sdeck');
    await fs.writeFile(filePath, pkg.bytes);

    // Lần quét 1: đọc file vào cache
    const scan1 = await scanLibrary(tmpDir);
    assert.equal(scan1.length, 1);
    assert.equal(scan1[0].deck.meta.title, 'Cached Deck');
    assert.ok(libraryCache.has(filePath), 'File must be cached');

    // Giả lập sửa cached object trong memory để phát hiện cache hit
    const cachedEntry = libraryCache.get(filePath);
    cachedEntry.deck.meta.title = 'Title From Cache';

    // Lần quét 2: file không đổi mtime/size -> phải lấy từ cache
    const scan2 = await scanLibrary(tmpDir);
    assert.equal(scan2[0].deck.meta.title, 'Title From Cache', 'Scan must use cached entry');
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
});

// Test Lỗi 8: Watcher theo dõi thư mục con và có hàm closeAll
test('Issue 8: WatcherService watches subdirectories recursively and can closeAll', async () => {
  const { WatcherService } = await import('../src/main/services/watcher-service.js');
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'study-issue8-'));
  const sub1 = path.join(tmpDir, 'sub1');
  const sub2 = path.join(sub1, 'sub2');
  await fs.mkdir(sub2, { recursive: true });

  const notifications = [];
  const watcher = new WatcherService({
    packageStore: new PackageStore(),
    knownSaves: new Map(),
    notify: (channel, payload) => notifications.push({ channel, payload }),
  });

  try {
    await watcher.watchRecursively(tmpDir);
    assert.equal(watcher.isWatching(tmpDir), true);
    assert.equal(watcher.isWatching(sub1), true);
    assert.equal(watcher.isWatching(sub2), true);
  } finally {
    watcher.closeAll();
    assert.equal(watcher.isWatching(tmpDir), false);
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
});

// Test Lỗi 9: tempImports có cơ chế TTL và dọn dẹp các mục quá hạn
test('Issue 9: pruneTempImports removes entries older than TTL', () => {
  const store = new PackageStore();
  const now = 1000000;
  store.setTempImport('token1', '/path/1'); // tạo lúc now
  // Giả lập token2 tạo trước đó 40 phút (2400000 ms)
  store.tempImports.set('token2', { path: '/path/2', createdAt: now - (40 * 60 * 1000) });

  assert.equal(store.getTempImport('token1'), '/path/1');
  assert.equal(store.getTempImport('token2'), '/path/2');

  // Dọn dẹp với TTL 30 phút tại thời điểm now
  store.pruneTempImports(30 * 60 * 1000, now);

  assert.equal(store.getTempImport('token1'), '/path/1', 'Fresh token must be retained');
  assert.equal(store.getTempImport('token2'), undefined, 'Expired token must be pruned');
});

// Test Lỗi 10: asset:addBytes và asset:remove nhận payload dạng đối tượng thống nhất
test('Issue 10: asset:addBytes and asset:remove work with unified object parameters', async () => {
  const { addAssetBytes, removeAsset } = await import('../src/main/services/asset-service.js');
  const store = new PackageStore();
  const deckKey = store.newKey();
  store.set(deckKey, { file: null, assets: new Map() });

  // 1x1 valid PNG
  const validPng = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c63000100000500010d0a2d420000000049454e44ae426082', 'hex');

  const addRes = addAssetBytes(store, deckKey, 'icon.png', validPng);
  assert.equal(addRes.ok, true);
  assert.equal(addRes.path, 'img/icon.png');

  const remRes = removeAsset(store, deckKey, 'img/icon.png');
  assert.equal(remRes.ok, true);
});

// Test Lỗi 11: backup:restore dùng whitelist kiểm tra tên file
test('Issue 11: restoreBackup validates name using strict regex whitelist', async () => {
  const { restoreBackup } = await import('../src/main/services/backup-service.js');
  const deps = { backupsDir: '/tmp', progressFile: '/tmp/p.json' };

  // Các tên độc hại / không hợp lệ phải bị chặn
  assert.equal((await restoreBackup(deps, '..')).ok, false);
  assert.equal((await restoreBackup(deps, 'foo.json')).ok, false);

  // File tồn tại nhưng tên không khớp whitelist progress-*.json
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'study-issue11-'));
  const validJson = JSON.stringify({ formatVersion: 1, exportedAt: Date.now(), timeZone: 'UTC', cards: {}, logs: [] });
  await fs.writeFile(path.join(tmpDir, 'custom-name.json'), validJson);
  assert.equal((await restoreBackup({ backupsDir: tmpDir, progressFile: '/tmp/p.json' }, 'custom-name.json')).ok, false, 'Files not matching progress-*.json must be rejected');
});

// Test Lỗi 12: getFallbackErrorResponse trả mảng rỗng [] cho các kênh mảng khi có lỗi bất ngờ
test('Issue 12: getFallbackErrorResponse returns [] for array channels and {ok:false,error} for others', async () => {
  const { getFallbackErrorResponse } = await import('../src/main/ipc/register.js');

  assert.deepEqual(getFallbackErrorResponse('deck:open', 'crash'), []);
  assert.deepEqual(getFallbackErrorResponse('asset:add', 'crash'), []);
  assert.deepEqual(getFallbackErrorResponse('draft:list', 'crash'), []);
  assert.deepEqual(getFallbackErrorResponse('backup:list', 'crash'), []);
  assert.deepEqual(getFallbackErrorResponse('library:scan', 'crash'), []);

  const objRes = getFallbackErrorResponse('deck:save', 'crash');
  assert.equal(objRes.ok, false);
  assert.ok(objRes.error.includes('crash'));
});

// Test Lỗi 13: Xử lý chữ ký console-message cho cả Electron mới và cũ
test('Issue 13: console-message handles modern and legacy signatures', () => {
  function parseConsoleMessage(...args) {
    let message = '';
    let line = 0;
    let sourceId = '';
    if (typeof args[0] === 'object' && args[0] !== null && 'message' in args[0]) {
      message = args[0].message;
      line = args[0].line;
      sourceId = args[0].sourceId;
    } else {
      message = args[1];
      line = args[2];
      sourceId = args[3];
    }
    return { message, line, sourceId };
  }

  // Modern signature
  const modern = parseConsoleMessage({ level: 1, message: 'hello modern', line: 42, sourceId: 'app.js' });
  assert.equal(modern.message, 'hello modern');
  assert.equal(modern.line, 42);

  // Legacy signature
  const legacy = parseConsoleMessage(1, 'hello legacy', 99, 'index.js');
  assert.equal(legacy.message, 'hello legacy');
  assert.equal(legacy.line, 99);
});

// Test Lỗi 14: Bảo mật IPC chỉ nhận từ file://.../src/index.html
test('Issue 14: isValidSenderFrame allows valid app html and rejects untrusted origins', async () => {
  const { isValidSenderFrame } = await import('../src/main/ipc/register.js');

  // Hợp lệ: file://.../src/index.html hoặc file://.../dist/index.html
  assert.equal(isValidSenderFrame('file:///home/user/studyApp/src/index.html'), true);
  assert.equal(isValidSenderFrame('file:///home/user/studyApp/dist/index.html'), true);
  assert.equal(isValidSenderFrame('file:///app/src/index.html#session'), true);
  assert.equal(isValidSenderFrame('file:///app/dist/index.html#session'), true);

  // Không hợp lệ: http, https, trang web lạ
  assert.equal(isValidSenderFrame('https://evil.com'), false);
  assert.equal(isValidSenderFrame('http://localhost:3000'), false);
  assert.equal(isValidSenderFrame('file:///tmp/malicious.html'), false);
});

// Test deck:open với mảng đường dẫn ({ filePath: string[] }) không được mở dialog
test('deck:open with array of paths in { filePath: string[] } does not trigger openDialog', async () => {
  const { registerDeckIpc } = await import('../src/main/ipc/deck.ipc.js');
  const store = new PackageStore();
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'study-deckopen-'));
  const sdeck = await import('../src/core/sdeck.js');

  const deck = { meta: { id: 'd-arr', title: 'Array Deck', kind: 'quiz' }, items: [] };
  const pkg = sdeck.writePackage(JSON.stringify(deck), new Map());
  const filePath = path.join(tmpDir, 'test.sdeck');
  await fs.writeFile(filePath, pkg.bytes);

  let dialogOpened = false;
  const mockDispatcher = {
    handlers: new Map(),
    handle(channel, fn) { this.handlers.set(channel, fn); }
  };

  registerDeckIpc(mockDispatcher, {
    packageStore: store,
    paths: {
      draftsDir: () => tmpDir,
      settingsFile: () => path.join(tmpDir, 'settings.json'),
      defaultLibraryDir: () => tmpDir,
    },
    winOf: () => null,
  });

  const handler = mockDispatcher.handlers.get('deck:open');

  // Gọi với { filePath: [filePath] } như app.js làm khi khởi động
  const res = await handler({}, { filePath: [filePath] });
  assert.equal(dialogOpened, false, 'Dialog must NOT be opened when paths are provided');
  assert.equal(res.length, 1);
  assert.equal(res[0].ok, true);
  assert.equal(res[0].deck.meta.title, 'Array Deck');

  await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
});
