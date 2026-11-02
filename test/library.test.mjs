// test/library.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { inferGroup, sanitizeDraftId, isSelfSaveEvent } from '../src/core/library.js';

test('library: inferGroup suy ra đúng nhóm từ đường dẫn tương đối', () => {
  assert.equal(inferGroup('LPIC/101/linux.sdeck'), 'LPIC/101');
  assert.equal(inferGroup('English/IELTS/vocab.sdeck'), 'English/IELTS');
  assert.equal(inferGroup('basics.sdeck'), '');
  assert.equal(inferGroup('Folder/deck.sdeck'), 'Folder');
  assert.equal(inferGroup('A/B/C/deck.sdeck'), 'A/B/C');
});

test('library: sanitizeDraftId làm sạch metaId chỉ chứa ký tự an toàn', () => {
  assert.equal(sanitizeDraftId('deck-123_abc.v1'), 'deck-123_abc.v1');
  assert.equal(sanitizeDraftId('deck/with:spaces & *bad* chars!'), 'deck_with_spaces____bad__chars_');
  assert.equal(sanitizeDraftId(''), 'draft');
  assert.equal(sanitizeDraftId(null), 'draft');
});

test('library: isSelfSaveEvent nhận biết đúng sự kiện ghi của chính app', () => {
  const map = new Map();
  const file = '/home/user/StudyDecks/test.sdeck';
  const now = Date.now();
  map.set(file, now);

  // Trong ngưỡng 1500ms -> là self-save
  assert.equal(isSelfSaveEvent(file, now + 300, map), true);
  assert.equal(isSelfSaveEvent(file, now - 200, map), true);

  // Ngoài ngưỡng -> là thay đổi từ bên ngoài (Syncthing, người dùng sửa...)
  assert.equal(isSelfSaveEvent(file, now + 3000, map), false);
  assert.equal(isSelfSaveEvent('/home/user/other.sdeck', now, map), false);
});

