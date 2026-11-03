// test/folder-service.test.ts — Unit tests cho FolderService và FolderRepository
import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseManager } from '../src/main/db/index.js';
import { FolderService } from '../src/main/services/folder-service.js';

test('FolderService: create, rename, move, delete folder', async () => {
  const manager = DatabaseManager.createInMemory();
  const folderRepo = manager.folder;
  const events: any[] = [];
  const service = new FolderService(folderRepo, {
    notify: (channel, payload) => events.push({ channel, payload }),
  });

  // 1. Tạo thư mục cấp gốc
  const resRoot = await service.createFolder('LPIC', null);
  assert.equal(resRoot.ok, true);
  assert.ok(resRoot.folder);
  assert.equal(resRoot.folder.name, 'LPIC');
  assert.equal(resRoot.folder.depth, 0);
  assert.equal(resRoot.folder.path, 'LPIC');

  // 2. Tạo thư mục con
  const resSub = await service.createFolder('101', resRoot.folder.id);
  assert.equal(resSub.ok, true);
  assert.ok(resSub.folder);
  assert.equal(resSub.folder.name, '101');
  assert.equal(resSub.folder.depth, 1);
  assert.equal(resSub.folder.path, 'LPIC/101');

  // Tạo thư mục cấp 2
  const resSub2 = await service.createFolder('Topic 1', resSub.folder.id);
  assert.equal(resSub2.ok, true);
  assert.equal(resSub2.folder?.depth, 2);
  assert.equal(resSub2.folder?.path, 'LPIC/101/Topic 1');

  // 3. Đổi tên thư mục cha '101' -> '101-v5'
  const renameRes = await service.renameFolder(resSub.folder.id, '101-v5');
  assert.equal(renameRes.ok, true);

  const updatedSub = folderRepo.getFolderById(resSub.folder.id);
  assert.equal(updatedSub?.name, '101-v5');
  assert.equal(updatedSub?.path, 'LPIC/101-v5');

  // Kiểm tra đường dẫn thư mục con cháu tự động cập nhật
  const updatedSub2 = folderRepo.getFolderById(resSub2.folder!.id);
  assert.equal(updatedSub2?.path, 'LPIC/101-v5/Topic 1');

  // 4. Di chuyển thư mục 'Topic 1' lên thẳng cấp gốc
  const moveRes = await service.moveFolder(resSub2.folder!.id, null);
  assert.equal(moveRes.ok, true);

  const movedTopic = folderRepo.getFolderById(resSub2.folder!.id);
  assert.equal(movedTopic?.depth, 0);
  assert.equal(movedTopic?.parentId, null);
  assert.equal(movedTopic?.path, 'Topic 1');

  // 5. Cây thư mục getFolderTree
  const tree = service.getFolderTree();
  assert.equal(tree.length, 2); // 'LPIC' và 'Topic 1' ở root
  const lpicNode = tree.find(n => n.name === 'LPIC');
  assert.equal(lpicNode?.children?.length, 1);
  assert.equal(lpicNode?.children?.[0].name, '101-v5');

  // 6. Xoá thư mục
  const delRes = await service.deleteFolder(resRoot.folder.id);
  assert.equal(delRes.ok, true);
  assert.equal(folderRepo.getFolderById(resRoot.folder.id), null);
  // Con cháu '101-v5' cũng bị xoá cascade
  assert.equal(folderRepo.getFolderById(resSub.folder.id), null);
});

test('FolderService: validate depth <= 10 (depth 0 to 9)', async () => {
  const manager = DatabaseManager.createInMemory();
  const folderRepo = manager.folder;
  const service = new FolderService(folderRepo);

  // Tạo chuỗi 10 cấp thư mục (cấp 0 đến cấp 9)
  let parentId: string | null = null;
  for (let i = 0; i < 10; i++) {
    const res = await service.createFolder(`Level-${i}`, parentId);
    assert.equal(res.ok, true, `Tạo cấp ${i} phải thành công`);
    assert.equal(res.folder?.depth, i);
    parentId = res.folder!.id;
  }

  // Cố gắng tạo cấp thứ 11 (depth = 10) phải bị chặn
  const res11 = await service.createFolder('Level-10-TooDeep', parentId);
  assert.equal(res11.ok, false);
  assert.match(res11.error!, /10 cấp/);

  // Thử di chuyển khiến độ sâu vượt quá 9
  const root2 = (await service.createFolder('Branch-B', null)).folder!;
  const subB1 = (await service.createFolder('B-Sub1', root2.id)).folder!;
  const subB2 = (await service.createFolder('B-Sub2', subB1.id)).folder!;

  // Thử di chuyển root2 vào một thư mục có depth = 8 -> subB2 sẽ thành depth = 8 + 1 + 2 = 11 > 9
  const deepFolder = folderRepo.getFolderByPath('Level-0/Level-1/Level-2/Level-3/Level-4/Level-5/Level-6/Level-7/Level-8');
  assert.ok(deepFolder);
  const moveTooDeep = await service.moveFolder(root2.id, deepFolder.id);
  assert.equal(moveTooDeep.ok, false);
  assert.match(moveTooDeep.error!, /10 cấp/);
});

test('FolderService: ngăn chặn di chuyển tạo vòng lặp (circular dependency)', async () => {
  const manager = DatabaseManager.createInMemory();
  const folderRepo = manager.folder;
  const service = new FolderService(folderRepo);

  const root = (await service.createFolder('Folder-A', null)).folder!;
  const child = (await service.createFolder('Folder-B', root.id)).folder!;
  const grandchild = (await service.createFolder('Folder-C', child.id)).folder!;

  // 1. Di chuyển vào chính nó
  const moveSelf = await service.moveFolder(root.id, root.id);
  assert.equal(moveSelf.ok, false);
  assert.match(moveSelf.error!, /chính nó/);

  // 2. Di chuyển thư mục cha vào thư mục con cháu
  const moveIntoChild = await service.moveFolder(root.id, grandchild.id);
  assert.equal(moveIntoChild.ok, false);
  assert.match(moveIntoChild.error!, /con cháu/);
});

test('FolderService: cascade delete dọn sạch deck_locations', async () => {
  const manager = DatabaseManager.createInMemory();
  const folderRepo = manager.folder;
  const locationRepo = manager.deckLocation;
  const service = new FolderService(folderRepo);

  const folder = (await service.createFolder('Study', null)).folder!;
  const sub = (await service.createFolder('Linux', folder.id)).folder!;

  // Gắn deck locations vào folder và sub
  locationRepo.addLocation('deck-1', folder.id, '/path/to/deck1.sdeck', false);
  locationRepo.addLocation('deck-2', sub.id, '/path/to/deck2.sdeck', true, '/path/to/deck1.sdeck');

  assert.equal(locationRepo.getLocationsByFolder(folder.id).length, 1);
  assert.equal(locationRepo.getLocationsByFolder(sub.id).length, 1);

  // Xoá folder gốc
  await service.deleteFolder(folder.id);

  // Tất cả deck_locations trong folder và sub đều phải được dọn
  assert.equal(locationRepo.getLocationsByFolder(folder.id).length, 0);
  assert.equal(locationRepo.getLocationsByFolder(sub.id).length, 0);
});

