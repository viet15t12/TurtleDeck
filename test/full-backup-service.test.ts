// test/full-backup-service.test.ts — Unit tests cho sao lưu và khôi phục toàn bộ hệ thống
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { DatabaseManager } from '../src/main/db/index.js';
import { createFullBackup, restoreFullBackup } from '../src/main/services/backup-service.js';
import * as sdeck from '../src/core/sdeck.js';

test('FullBackupService: createFullBackup và restoreFullBackup hoạt động hoàn hảo', async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'turtle-full-backup-test-'));
  const libDir = path.join(tmpDir, 'library');
  const backupsDir = path.join(tmpDir, 'backups');
  const progressFile = path.join(tmpDir, 'progress.json');
  const settingsFile = path.join(tmpDir, 'settings.json');
  await fs.mkdir(libDir, { recursive: true });
  await fs.mkdir(backupsDir, { recursive: true });

  const dbManager = DatabaseManager.createInMemory();

  // 1. Tạo thư mục trong DB và trên đĩa
  const folderMath = dbManager.folder.createFolder('ToanHoc', null);
  const folderAlgebra = dbManager.folder.createFolder('DaiSo', folderMath.id);
  const algebraDiskDir = path.join(libDir, 'ToanHoc', 'DaiSo');
  await fs.mkdir(algebraDiskDir, { recursive: true });

  // 2. Tạo một file bộ thẻ mẫu trong DaiSo
  const sampleDeck = {
    meta: { id: 'deck-test-1', title: 'Đại số 10', kind: 'qa' as const, created: Date.now() },
    items: [
      { id: 'item-1', type: 'card' as const, front: 'Phương trình bậc 2', back: 'ax^2 + bx + c = 0' }
    ]
  };
  const packRes = (sdeck as any).writePackage(JSON.stringify(sampleDeck), new Map());
  assert.equal(packRes.ok, true);
  const sdeckPath = path.join(algebraDiskDir, 'dai-so-10.sdeck');
  await fs.writeFile(sdeckPath, packRes.bytes);

  // Đăng ký deck vào DB
  dbManager.deck.syncDeck(sampleDeck, sdeckPath);
  dbManager.deckLocation.addLocation(sampleDeck.meta.id, folderAlgebra.id, sdeckPath, false);

  // Ghi progress & settings
  await fs.writeFile(progressFile, JSON.stringify({ reviewCount: 42 }));
  await fs.writeFile(settingsFile, JSON.stringify({ theme: 'dark', libraryDir: libDir }));

  // 3. Thực hiện createFullBackup
  const backupRes = await createFullBackup({
    backupsDir,
    progressFile,
    settingsFile,
    dbManager,
    libraryDir: libDir,
  });

  assert.equal(backupRes.ok, true);
  assert.ok(backupRes.filePath);
  assert.equal(backupRes.decksCount, 1);
  assert.equal(backupRes.foldersCount, 2);

  // Kiểm tra file sao lưu tồn tại
  const backupStat = await fs.stat(backupRes.filePath);
  assert.ok(backupStat.size > 0);

  // 4. Giả lập xoá sạch toàn bộ thư mục và DB (như khi cài lại OS)
  await fs.rm(libDir, { recursive: true, force: true });
  await fs.mkdir(libDir, { recursive: true });
  const freshDbManager = DatabaseManager.createInMemory();
  assert.equal(freshDbManager.folder.getFolderTree().length, 0);

  // 5. Thực hiện restoreFullBackup
  const restoreRes = await restoreFullBackup({
    backupsDir,
    progressFile,
    settingsFile,
    dbManager: freshDbManager,
    libraryDir: libDir,
    srcPath: backupRes.filePath,
  });

  assert.equal(restoreRes.ok, true);
  assert.equal(restoreRes.decksCount, 1);
  assert.equal(restoreRes.foldersCount, 2);

  // 6. Kiểm tra cấu trúc thư mục được phục hồi
  const tree = freshDbManager.folder.getFolderTree();
  assert.equal(tree.length, 1);
  assert.equal(tree[0].name, 'ToanHoc');
  assert.equal(tree[0].children?.length, 1);
  assert.equal(tree[0].children[0].name, 'DaiSo');

  // Kiểm tra file .sdeck đã được giải nén ra đĩa đúng vị trí
  const restoredFile = path.join(libDir, 'ToanHoc', 'DaiSo', 'dai-so-10.sdeck');
  const restoredStat = await fs.stat(restoredFile);
  assert.ok(restoredStat.size > 0);

  // Dọn dẹp thư mục tạm
  await fs.rm(tmpDir, { recursive: true, force: true });
});
