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
