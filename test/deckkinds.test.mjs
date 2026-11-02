// Kiểm thử phân loại bộ thẻ (core/deckkinds.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  KINDS,
  inferKind,
  kindOf,
  allowedTypes,
  defaultTypeFor,
  modesFor,
  mismatchedItems,
  formatMismatchWarning,
  kindLabel,
  checkModeAvailability,
} from '../src/core/deckkinds.js';

test('KINDS: đủ 3 loại bộ thẻ chuẩn và thông số đúng', () => {
  assert.deepEqual(Object.keys(KINDS), ['qa', 'quiz', 'vocab']);
  assert.deepEqual(KINDS.qa.allowedTypes, ['card']);
  assert.equal(KINDS.qa.defaultType, 'card');
  assert.equal(KINDS.qa.available, true);

  assert.deepEqual(KINDS.quiz.allowedTypes, ['single', 'multi', 'fill', 'command']);
  assert.equal(KINDS.quiz.defaultType, 'single');
  assert.equal(KINDS.quiz.available, true);

  assert.deepEqual(KINDS.vocab.allowedTypes, ['vocab']);
  assert.equal(KINDS.vocab.defaultType, 'vocab');
  assert.equal(KINDS.vocab.available, true);
  assert.equal(KINDS.vocab.comingSoon, null);
});

test('inferKind: toàn card -> qa; có vocab -> vocab; còn lại/trống -> quiz', () => {
  assert.equal(inferKind([{ type: 'card' }, { type: 'card' }]), 'qa');
  assert.equal(inferKind([{ front: 'A', back: 'B' }]), 'qa');
  assert.equal(inferKind([{ type: 'vocab', term: 'hi', definition: 'chào' }, { type: 'card' }]), 'vocab');
  assert.equal(inferKind([{ term: 'hello', definition: 'xin chào' }]), 'vocab');
  assert.equal(inferKind([{ type: 'single' }, { type: 'card' }]), 'quiz');
  assert.equal(inferKind([{ type: 'fill' }]), 'quiz');
  assert.equal(inferKind([]), 'quiz');
  assert.equal(inferKind(null), 'quiz');
});

test('kindOf: dùng meta.kind hợp lệ, hoặc tự suy ra khi thiếu/lạ', () => {
  assert.equal(kindOf({ meta: { kind: 'qa' }, items: [{ type: 'single' }] }), 'qa');
  assert.equal(kindOf({ meta: { kind: 'quiz' }, items: [{ type: 'card' }] }), 'quiz');
  assert.equal(kindOf({ meta: { kind: 'vocab' }, items: [] }), 'vocab');

  // Thiếu hoặc lạ -> suy ra từ items
  assert.equal(kindOf({ meta: {}, items: [{ type: 'card' }] }), 'qa');
  assert.equal(kindOf({ meta: { kind: 'unknown' }, items: [{ type: 'card' }] }), 'qa');
  assert.equal(kindOf({ meta: { kind: 'weird' }, items: [{ type: 'vocab' }] }), 'vocab');
  assert.equal(kindOf({ meta: {}, items: [] }), 'quiz');
});

test('allowedTypes, defaultTypeFor, modesFor theo loại bộ thẻ', () => {
  assert.deepEqual(allowedTypes('qa'), ['card']);
  assert.deepEqual(allowedTypes('quiz'), ['single', 'multi', 'fill', 'command']);
  assert.deepEqual(allowedTypes('vocab'), ['vocab']);
  assert.deepEqual(allowedTypes('invalid'), ['single', 'multi', 'fill', 'command']);

  assert.equal(defaultTypeFor('qa'), 'card');
  assert.equal(defaultTypeFor('quiz'), 'single');
  assert.equal(defaultTypeFor('vocab'), 'vocab');

  const qaModes = modesFor('qa');
  assert.deepEqual(qaModes.map(m => m.id), ['srs', 'all']);

  const quizModes = modesFor('quiz');
  assert.deepEqual(quizModes.map(m => m.id), ['srs', 'practice']);

  const vocabModes = modesFor('vocab');
  assert.deepEqual(vocabModes.map(m => m.id), ['srs', 'flashcards', 'mc', 'write', 'cloze', 'listen']);
});

test('deckkinds: checkModeAvailability kiểm tra điều kiện từng chế độ', () => {
  const items = [
    { id: '1', term: 'apple', definition: 'quả táo', example: 'I eat an apple.' },
  ];
  // mc cần >= 2 từ
  const mcRes1 = checkModeAvailability('mc', items);
  assert.equal(mcRes1.available, false);
  assert.match(mcRes1.reason, /ít nhất 2 từ/);

  // Thêm từ thứ 2 -> mc ok
  items.push({ id: '2', term: 'banana', definition: 'quả chuối' });
  const mcRes2 = checkModeAvailability('mc', items);
  assert.equal(mcRes2.available, true);

  // cloze: từ 1 có example chứa apple -> ok
  const clozeRes = checkModeAvailability('cloze', items);
  assert.equal(clozeRes.available, true);

  // cloze khi không có từ nào có example hợp lệ
  const clozeFail = checkModeAvailability('cloze', [{ id: '1', term: 'cat', definition: 'mèo' }]);
  assert.equal(clozeFail.available, false);
  assert.match(clozeFail.reason, /câu ví dụ/);

  // listen khi không có giọng
  const listenFail = checkModeAvailability('listen', items, { hasVoice: false });
  assert.equal(listenFail.available, false);
  assert.match(listenFail.reason, /giọng đọc/);

  const listenOk = checkModeAvailability('listen', items, { hasVoice: true });
  assert.equal(listenOk.available, true);
});

test('mismatchedItems và formatMismatchWarning phát hiện mục lệch loại', () => {
  const deck = {
    meta: { kind: 'quiz' },
    items: [
      { id: '1', type: 'single' },
      { id: '2', type: 'card' },
      { id: '3', type: 'card' },
    ],
  };
  const mis = mismatchedItems(deck);
  assert.equal(mis.length, 2);
  assert.deepEqual(mis.map(x => x.id), ['2', '3']);

  const msg = formatMismatchWarning(deck);
  assert.match(msg, /2 mục dạng Thẻ/);
  assert.match(msg, /Đề luyện thi/);
  assert.equal(kindLabel('qa'), 'Thẻ ghi nhớ');
});
