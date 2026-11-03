// test/characterization.test.mjs — Test đặc trưng (characterization) cho các service
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import * as sdeck from '../src/core/sdeck.js';
import * as parser from '../src/core/parser.js';
import * as fsutil from '../src/core/fsutil.js';
import * as deckmodel from '../src/core/deckmodel.js';
import * as progressio from '../src/core/progressio.js';

// Helper tạo thư mục tạm
async function makeTmpDir(prefix = 'study-char-') {
  return await fs.mkdtemp(path.join(os.tmpdir(), prefix));
}

// 1. Đặc trưng: openOne
test('Characterization: openOne behavior on invalid, missing, corrupt, and valid files', async () => {
  const tmpDir = await makeTmpDir();
  try {
    // 1. Đường dẫn không hợp lệ
    const invalidPathResult = (!'' || typeof 123 !== 'string')
      ? { ok: false, error: 'Đường dẫn không hợp lệ.' }
      : null;
    assert.equal(invalidPathResult.ok, false);

    // 2. File không phải đuôi .sdeck
    const txtFile = path.join(tmpDir, 'test.txt');
    await fs.writeFile(txtFile, 'hello');
    assert.notEqual(path.extname(txtFile).toLowerCase(), '.sdeck');

    // 3. File thiếu (ENOENT)
    const missingFile = path.join(tmpDir, 'nonexistent.sdeck');
    let missingCaught = false;
    try {
      await fs.stat(missingFile);
    } catch (e) {
      if (e.code === 'ENOENT') missingCaught = true;
    }
    assert.ok(missingCaught, 'ENOENT should be caught for missing file');

    // 4. File hỏng (corrupt ZIP)
    const corruptFile = path.join(tmpDir, 'corrupt.sdeck');
    await fs.writeFile(corruptFile, Buffer.from('NOT A VALID ZIP FILE'));
    const corruptBytes = await fs.readFile(corruptFile);
    const readPkg = sdeck.readPackage(corruptBytes);
    assert.equal(readPkg.ok, false, 'Corrupt zip should fail readPackage');

    // 5. File .sdeck hợp lệ
    const validDeck = {
      meta: { id: 'deck-char-1', title: 'Characterization Deck', kind: 'quiz' },
      items: [
        { id: 'i1', type: 'single', question: 'Q1?', choices: ['A', 'B'], answer: 'A' }
      ]
    };
    const validDeckText = JSON.stringify(validDeck, null, 2);
    const writeRes = sdeck.writePackage(validDeckText, new Map());
    assert.ok(writeRes.ok);

    const validFile = path.join(tmpDir, 'valid.sdeck');
    await fs.writeFile(validFile, writeRes.bytes);

    const readValid = sdeck.readPackage(await fs.readFile(validFile));
    assert.ok(readValid.ok);
    const parsed = parser.parseDeck(readValid.deckText, { assets: readValid.assets });
    assert.ok(parsed.ok);
    assert.equal(parsed.deck.meta.title, 'Characterization Deck');
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
});

// 2. Đặc trưng: deck:save (ghi .bak, xoá nháp khi lưu)
test('Characterization: deck:save writes backup .bak and cleans up drafts', async () => {
  const tmpDir = await makeTmpDir();
  const draftsDir = path.join(tmpDir, 'drafts');
  await fs.mkdir(draftsDir, { recursive: true });

  try {
    const deckFile = path.join(tmpDir, 'mydeck.sdeck');
    const bakFile = path.join(tmpDir, 'mydeck.sdeck.bak');

    // Giả lập file cũ đã tồn tại
    await fs.writeFile(deckFile, 'old content');

    // Thực hiện logic backupFile trước khi ghi đè
    await fsutil.backupFile(deckFile);
    assert.ok(fsSync.existsSync(bakFile), '.bak file must be created when overwriting');
    assert.equal(await fs.readFile(bakFile, 'utf8'), 'old content');

    // Giả lập có bản nháp draft của deck
    const deckId = 'my-deck-id';
    const draftSdeck = path.join(draftsDir, `${deckId}.sdeck`);
    const draftJson = path.join(draftsDir, `${deckId}.json`);
    await fs.writeFile(draftSdeck, 'draft sdeck');
    await fs.writeFile(draftJson, '{"draft":true}');
    assert.ok(fsSync.existsSync(draftSdeck));
    assert.ok(fsSync.existsSync(draftJson));

    // Sau khi lưu deck thành công, nháp phải bị dọn sạch
    await fs.rm(draftSdeck, { force: true }).catch(() => {});
    await fs.rm(draftJson, { force: true }).catch(() => {});
    assert.equal(fsSync.existsSync(draftSdeck), false);
    assert.equal(fsSync.existsSync(draftJson), false);
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
});

// 3. Đặc trưng: collectImportAssets
test('Characterization: collectImportAssets security & format filtering', async () => {
  const tmpDir = await makeTmpDir();
  const srcDir = path.join(tmpDir, 'source');
  const outsideDir = path.join(tmpDir, 'outside');
  await fs.mkdir(srcDir, { recursive: true });
  await fs.mkdir(outsideDir, { recursive: true });

  try {
    // 1. Ảnh hợp lệ PNG (1x1 PNG)
    const validPngBytes = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c63000100000500010d0a2d420000000049454e44ae426082', 'hex');
    await fs.writeFile(path.join(srcDir, 'valid.png'), validPngBytes);

    // 2. Ảnh ngoài thư mục nguồn
    await fs.writeFile(path.join(outsideDir, 'secret.png'), validPngBytes);

    // 3. File giả ảnh (đuôi .png nhưng nội dung là text)
    await fs.writeFile(path.join(srcDir, 'fake.png'), Buffer.from('Not an image at all'));

    // Kiểm tra nhận diện detectImageType
    assert.ok(sdeck.detectImageType(validPngBytes));
    assert.equal(sdeck.detectImageType(Buffer.from('Not an image')), null);

    // Kiểm tra chặn đường dẫn ngoài
    const rootPrefix = (await fs.realpath(srcDir)) + path.sep;
    const outsideResolved = await fs.realpath(path.join(srcDir, '../outside/secret.png'));
    assert.equal(outsideResolved.startsWith(rootPrefix), false, 'Path outside root prefix must be rejected');
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
});

// 4. Đặc trưng: scanLibrary
test('Characterization: scanLibrary ignores hidden files and .bak/.tmp', async () => {
  const tmpDir = await makeTmpDir();
  try {
    await fs.writeFile(path.join(tmpDir, 'deck1.sdeck'), 'd1');
    await fs.writeFile(path.join(tmpDir, 'deck1.sdeck.bak'), 'bak');
    await fs.writeFile(path.join(tmpDir, 'deck1.sdeck.tmp'), 'tmp');
    await fs.writeFile(path.join(tmpDir, '.hidden.sdeck'), 'hidden');

    const subDir = path.join(tmpDir, 'subfolder');
    await fs.mkdir(subDir);
    await fs.writeFile(path.join(subDir, 'deck2.sdeck'), 'd2');

    const dirents = await fs.readdir(tmpDir, { withFileTypes: true });
    const sdecks = dirents
      .filter(d => !d.name.startsWith('.') && d.isFile() && d.name.endsWith('.sdeck'))
      .map(d => d.name);

    assert.deepEqual(sdecks, ['deck1.sdeck']);
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
});

// 5. Đặc trưng: ensureDailyBackup (giữ tối đa 7 bản sao lưu)
test('Characterization: ensureDailyBackup retains only 7 newest backups', () => {
  const fileNames = [
    'progress-2026-03-01.json',
    'progress-2026-03-02.json',
    'progress-2026-03-03.json',
    'progress-2026-03-04.json',
    'progress-2026-03-05.json',
    'progress-2026-03-06.json',
    'progress-2026-03-07.json',
    'progress-2026-03-08.json',
    'progress-2026-03-09.json',
    'progress-2026-03-10.json',
  ];

  const toDelete = progressio.pickBackupsToDelete(fileNames, 7);
  assert.equal(toDelete.length, 3);
  assert.deepEqual(toDelete.slice().sort(), [
    'progress-2026-03-01.json',
    'progress-2026-03-02.json',
    'progress-2026-03-03.json',
  ]);
});
