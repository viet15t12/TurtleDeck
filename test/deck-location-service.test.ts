// test/deck-location-service.test.ts — Unit tests cho DeckLocationService
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { DatabaseManager } from '../src/main/db/index.js';
import { DeckLocationService } from '../src/main/services/deck-location-service.js';
import * as sdeck from '../src/core/sdeck.js';

test('DeckLocationService: move deck, link deck, unlink deck và sync from file system', async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'studyapp-deck-loc-test-'));
  const libDir = path.join(tmpDir, 'library');
  await fs.mkdir(libDir, { recursive: true });

  const manager = DatabaseManager.createInMemory();
  const folderRepo = manager.folder;
  const locationRepo = manager.deckLocation;
  const deckRepo = manager.deck;

  // Tạo file bộ thẻ mẫu trong libDir
  const deckData = {
    meta: { id: 'test-deck-1', title: 'Test Deck' },
    items: [{ id: 'item-1', type: 'vocab', term: 'hello', definition: 'xin chao' }],
  };
  const pkgRes = (sdeck as any).writePackage(JSON.stringify(deckData));
  const initialFilePath = path.join(libDir, 'test-deck-1.sdeck');
  await fs.writeFile(initialFilePath, Buffer.from(pkgRes.bytes));

  // Ghi nhận deck vào database
  deckRepo.syncDeck(deckData as any, initialFilePath);
  locationRepo.addLocation('test-deck-1', null, initialFilePath, false);

  const service = new DeckLocationService(locationRepo, null, {
    folderRepo,
    deckRepo,
    libraryDir: () => libDir,
  });

  // 1. Tạo thư mục đích trong DB và trên đĩa
  const folderA = folderRepo.createFolder('English', null);
  await fs.mkdir(path.join(libDir, 'English'), { recursive: true });

  // 2. Di chuyển deck vào thư mục 'English'
  const moveRes = await service.moveDeck('test-deck-1', folderA.id);
  assert.equal(moveRes.ok, true);

  const targetPath = path.join(libDir, 'English', 'test-deck-1.sdeck');
  assert.equal(fsSync.existsSync(targetPath), true, 'File phải được di chuyển vào English/');
  assert.equal(fsSync.existsSync(initialFilePath), false, 'File gốc ở root phải không còn');

  const locsAfterMove = service.getLocationsByDeck('test-deck-1');
  assert.equal(locsAfterMove.length, 1);
  assert.equal(locsAfterMove[0].folderId, folderA.id);
  assert.equal(locsAfterMove[0].filePath, targetPath);

  // 3. Tạo symlink liên kết deck vào một thư mục khác 'Grammar'
  const folderB = folderRepo.createFolder('Grammar', null);
  await fs.mkdir(path.join(libDir, 'Grammar'), { recursive: true });

  const linkRes = await service.linkDeck('test-deck-1', folderB.id);
  assert.equal(linkRes.ok, true);

  const symlinkPath = path.join(libDir, 'Grammar', 'test-deck-1.sdeck');
  assert.equal(fsSync.existsSync(symlinkPath), true, 'Symlink phải tồn tại trong Grammar/');
  const lst = await fs.lstat(symlinkPath);
  assert.equal(lst.isSymbolicLink(), true, 'Phải là symbolic link');

  const locsAfterLink = service.getLocationsByDeck('test-deck-1');
  assert.equal(locsAfterLink.length, 2);
  const linkLoc = locsAfterLink.find(l => l.isLink);
  assert.ok(linkLoc);
  assert.equal(linkLoc.folderId, folderB.id);
  assert.equal(linkLoc.isLink, true);
  assert.equal(linkLoc.linkTarget, targetPath);

  // 4. Xoá liên kết (unlink)
  const unlinkRes = await service.removeLocation(linkLoc.id, true);
  assert.equal(unlinkRes.ok, true);
  assert.equal(fsSync.existsSync(symlinkPath), false, 'Symlink trên đĩa phải bị xoá');
  assert.equal(fsSync.existsSync(targetPath), true, 'File gốc trong English/ vẫn còn nguyên');
  assert.equal(service.getLocationsByDeck('test-deck-1').length, 1);

  // 5. Đồng bộ từ filesystem (syncFromFileSystem)
  // Tạo một deck mới trực tiếp trên filesystem bên trong Grammar
  const deckData2 = {
    meta: { id: 'test-deck-2', title: 'Grammar Deck' },
    items: [{ id: 'item-2', type: 'vocab', term: 'world', definition: 'the gioi' }],
  };
  const pkgRes2 = (sdeck as any).writePackage(JSON.stringify(deckData2));
  const file2Path = path.join(libDir, 'Grammar', 'grammar-basics.sdeck');
  await fs.writeFile(file2Path, Buffer.from(pkgRes2.bytes));

  const syncRes = await service.syncFromFileSystem(libDir);
  assert.equal(syncRes.ok, true);

  const locsDeck2 = service.getLocationsByDeck('test-deck-2');
  assert.equal(locsDeck2.length, 1);
  assert.equal(locsDeck2[0].folderId, folderB.id);
  assert.equal(locsDeck2[0].filePath, file2Path);

  // Dọn thư mục tạm
  await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
});
