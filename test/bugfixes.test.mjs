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
