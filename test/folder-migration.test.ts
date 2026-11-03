// test/folder-migration.test.ts — Integration tests cho migrateToFolders và bảo toàn tiến độ SRS
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { DatabaseManager } from '../src/main/db/index.js';
import { migrateToFolders } from '../src/main/db/migration-folders.js';
import * as sdeck from '../src/core/sdeck.js';

test('FolderMigration: migrate từ flat structure sang tree và bảo toàn tiến độ SRS', async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'studyapp-folder-mig-test-'));
  const libDir = path.join(tmpDir, 'library');

  // Chuẩn bị cấu trúc thư mục trên ổ đĩa
  await fs.mkdir(path.join(libDir, 'LPIC', '101'), { recursive: true });
  await fs.mkdir(path.join(libDir, 'Languages', 'Japanese'), { recursive: true });

  // 1. Tạo 3 bộ thẻ .sdeck
  const deckRootData = {
    meta: { id: 'deck-root', title: 'Root General Deck' },
    items: [{ id: 'item-r1', type: 'vocab', term: 'root', definition: 'goc' }],
  };
  const deckLpicData = {
    meta: { id: 'deck-lpic', title: 'LPIC 101 Exam' },
    items: [{ id: 'item-l1', type: 'single', prompt: 'Command for listing files?', choices: ['ls', 'cd'], answer: 0 }],
  };
  const deckJapData = {
    meta: { id: 'deck-jap', title: 'N5 Vocab' },
    items: [{ id: 'item-j1', type: 'vocab', term: 'neko', definition: 'con meo' }],
  };

  const rootFile = path.join(libDir, 'root-deck.sdeck');
  const lpicFile = path.join(libDir, 'LPIC', '101', 'lpic101.sdeck');
  const japFile = path.join(libDir, 'Languages', 'Japanese', 'n5.sdeck');

  await fs.writeFile(rootFile, Buffer.from((sdeck as any).writePackage(JSON.stringify(deckRootData)).bytes));
  await fs.writeFile(lpicFile, Buffer.from((sdeck as any).writePackage(JSON.stringify(deckLpicData)).bytes));
  await fs.writeFile(japFile, Buffer.from((sdeck as any).writePackage(JSON.stringify(deckJapData)).bytes));

  // 2. Khởi tạo Database SQLite và nạp tiến độ SRS cho các thẻ
  const manager = DatabaseManager.createInMemory();
  const db = manager.db;
  const srsRepo = manager.srs;
  const deckRepo = manager.deck;

  // Sync decks vào bảng decks
  deckRepo.syncDeck(deckRootData as any, rootFile);
  deckRepo.syncDeck(deckLpicData as any, lpicFile);
  deckRepo.syncDeck(deckJapData as any, japFile);

  // Ghi tiến độ SRS
  const now = Date.now();
  srsRepo.recordReview(
    {
      deckId: 'deck-lpic',
      itemId: 'item-l1',
      direction: 'fwd',
      state: 'learning',
      step: 1,
      ease: 2.5,
      interval: 1,
      due: now + 600000,
      reps: 1,
      lapses: 0,
      updatedAt: now,
    },
    {
      deckId: 'deck-lpic',
      itemId: 'item-l1',
      direction: 'fwd',
      rating: 3,
      reviewTime: now,
      elapsedMs: 2500,
      isNew: 1,
    }
  );

  srsRepo.recordReview(
    {
      deckId: 'deck-jap',
      itemId: 'item-j1',
      direction: 'fwd',
      state: 'review',
      step: 0,
      ease: 2.6,
      interval: 4,
      due: now + 86400000 * 4,
      reps: 2,
      lapses: 0,
      updatedAt: now,
    },
    {
      deckId: 'deck-jap',
      itemId: 'item-j1',
      direction: 'fwd',
      rating: 4,
      reviewTime: now,
      elapsedMs: 1500,
      isNew: 0,
    }
  );

  // Đánh dấu sao và ghi chú item_meta
  srsRepo.setStarred('deck-lpic', 'item-l1', true);
  srsRepo.setNote('deck-lpic', 'item-l1', 'Câu hỏi hay gặp trong đề thi');

  // Kiểm tra trước khi migration
  assert.equal(srsRepo.getSummary('deck-lpic', now).learningCount, 1);
  const cardBefore = srsRepo.getCard('deck-lpic', 'item-l1', 'fwd');
  assert.ok(cardBefore);
  assert.equal(cardBefore.reps, 1);

  // 3. Thực hiện migrateToFolders
  const migRes = migrateToFolders(db, libDir);
  assert.equal(migRes.ok, true);
  assert.ok(migRes.foldersCreated >= 3, 'Phải tạo các folder LPIC, LPIC/101, Languages, Languages/Japanese');
  assert.ok(migRes.locationsCreated >= 3, 'Phải tạo vị trí deck_locations cho cả 3 deck');

  // 4. Kiểm tra cấu trúc thư mục sau migration
  const folderRepo = manager.folder;
  const lpicFolder = folderRepo.getFolderByPath('LPIC');
  assert.ok(lpicFolder);
  assert.equal(lpicFolder.depth, 0);

  const lpic101Folder = folderRepo.getFolderByPath('LPIC/101');
  assert.ok(lpic101Folder);
  assert.equal(lpic101Folder.depth, 1);
  assert.equal(lpic101Folder.parentId, lpicFolder.id);

  // 5. Kiểm tra vị trí của các deck
  const locationRepo = manager.deckLocation;

  // Deck ở root
  const rootLocs = locationRepo.getLocationsByDeck('deck-root');
  assert.equal(rootLocs.length, 1);
  assert.equal(rootLocs[0].folderId, null);
  assert.equal(rootLocs[0].filePath, rootFile);

  // Deck ở LPIC/101
  const lpicLocs = locationRepo.getLocationsByDeck('deck-lpic');
  assert.equal(lpicLocs.length, 1);
  assert.equal(lpicLocs[0].folderId, lpic101Folder.id);
  assert.equal(lpicLocs[0].filePath, lpicFile);

  // 6. KIỂM TRA BẢO TOÀN TIẾN ĐỘ SRS
  const cardAfter = srsRepo.getCard('deck-lpic', 'item-l1', 'fwd');
  assert.ok(cardAfter, 'Thẻ SRS của deck-lpic vẫn phải tồn tại nguyên vẹn');
  assert.equal(cardAfter.reps, 1);
  assert.equal(cardAfter.ease, cardBefore.ease);
  assert.equal(cardAfter.due, cardBefore.due);

  const summaryAfter = srsRepo.getSummary('deck-lpic', now);
  assert.equal(summaryAfter.learningCount, 1);

  const metaAfter = srsRepo.getMeta('deck-lpic', 'item-l1');
  assert.ok(metaAfter);
  assert.equal(metaAfter.starred, true);
  assert.equal(metaAfter.note, 'Câu hỏi hay gặp trong đề thi');

  // Dọn thư mục tạm
  await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
});
