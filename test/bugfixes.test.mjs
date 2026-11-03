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
