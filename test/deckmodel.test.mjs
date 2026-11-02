import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  newDeck, newItemId, newItem, addItem, removeItems, duplicateItem,
  moveItem, updateItem, changeType, imageRefs, collectImageRefs,
  unusedAssets, createHistory, newItemLike, setCorrect, splitPastedChoices,
  normalizeOnLeave, isBlankNewItem, stripAccents,
} from '../src/core/deckmodel.js';

test('deckmodel: newDeck tạo bộ thẻ hợp lệ', () => {
  const d1 = newDeck();
  assert.equal(d1.meta.title, 'Bộ thẻ mới');
  assert.equal(d1.meta.kind, 'quiz');
  assert.equal(d1.meta.lang, 'vi');
  assert.equal(d1.meta.format, 'studydeck');
  assert.equal(d1.meta.formatVersion, 1);
  assert.ok(typeof d1.meta.id === 'string' && d1.meta.id.length > 5);
  assert.deepEqual(d1.items, []);

  const d2 = newDeck({ title: 'Hóa 10', kind: 'qa', lang: 'en', id: 'custom-id' });
  assert.equal(d2.meta.title, 'Hóa 10');
  assert.equal(d2.meta.kind, 'qa');
  assert.equal(d2.meta.lang, 'en');
  assert.equal(d2.meta.id, 'custom-id');
});

test('deckmodel: newItemId sinh id duy nhất không trùng', () => {
  const d = {
    items: [
      { id: 'q-001' },
      { id: 'q-002' },
      { id: 'q-004' },
    ],
  };
  const id1 = newItemId(d);
  assert.equal(id1, 'q-003');
  const id2 = newItemId({ items: [{ id: 'q-001' }, { id: 'q-002' }, { id: 'q-003' }] });
  assert.equal(id2, 'q-004');
});

test('deckmodel: newItem tạo mẫu cho mọi dạng và theo loại bộ thẻ (kind)', () => {
  const s = newItem('single', '1');
  assert.equal(s.type, 'single');
  assert.equal(s.choices.length, 2);
  assert.deepEqual(s.answer, [0]);

  const m = newItem('multi', '2');
  assert.equal(m.type, 'multi');
  assert.deepEqual(m.answer, [0]);

  const f = newItem('fill', '3');
  assert.equal(f.type, 'fill');
  assert.deepEqual(f.answer, ['']);

  const c = newItem('card', '4');
  assert.equal(c.type, 'card');
  assert.equal(c.front, '');
  assert.equal(c.back, '');

  // Tạo mục theo loại bộ thẻ ('qa' -> 'card', 'quiz' -> 'single', 'vocab' -> 'vocab') hoặc đối tượng deck
  assert.equal(newItem('qa', '5').type, 'card');
  assert.equal(newItem('quiz', '6').type, 'single');
  assert.equal(newItem('vocab', '7').type, 'vocab');
  const qaDeck = newDeck({ title: 'Bộ thẻ nhớ', kind: 'qa', description: 'Mô tả' });
  assert.equal(qaDeck.meta.description, 'Mô tả');
  assert.equal(newItem(qaDeck, '8').type, 'card');
  // newItemLike trong bộ qa luôn tạo 'card' kể cả khi mục mẫu lệch loại
  assert.equal(newItemLike(qaDeck, { id: 'q-001', type: 'single' }).type, 'card');
});

test('deckmodel: addItem, removeItems, duplicateItem, moveItem, updateItem', () => {
  let d = newDeck({ title: 'Test' });
  const it1 = { id: '1', type: 'card', front: 'A', back: 'B' };
  const it2 = { id: '2', type: 'card', front: 'C', back: 'D' };
  const it3 = { id: '3', type: 'card', front: 'E', back: 'F' };

  // addItem
  d = addItem(d, it1);
  d = addItem(d, it2);
  assert.equal(d.items.length, 2);
  d = addItem(d, it3, 1); // chèn vào giữa
  assert.deepEqual(d.items.map(i => i.id), ['1', '3', '2']);

  // updateItem
  d = updateItem(d, '3', { front: 'Updated E' });
  assert.equal(d.items[1].front, 'Updated E');
  d = updateItem(d, '3', it => ({ ...it, back: 'Updated F' }));
  assert.equal(d.items[1].back, 'Updated F');

  // moveItem
  d = moveItem(d, 0, 2); // chuyển 1 từ đầu về cuối
  assert.deepEqual(d.items.map(i => i.id), ['3', '2', '1']);

  // duplicateItem
  d = duplicateItem(d, '2');
  assert.equal(d.items.length, 4);
  assert.equal(d.items[1].id, '2');
  assert.notEqual(d.items[2].id, '2'); // id mới
  assert.equal(d.items[2].front, 'C');
  assert.equal(d.items[2].back, 'D');

  // removeItems
  d = removeItems(d, ['3', '1']);
  assert.equal(d.items.length, 2);
  assert.equal(d.items[0].id, '2');
});

test('deckmodel: changeType chuyển đổi giữa các dạng giữ tối đa dữ liệu', () => {
  const singleItem = {
    id: 's1', type: 'single', question: 'Thủ đô VN?',
    choices: ['Hà Nội', 'HCM', 'Đà Nẵng'], answer: [0],
    explanation: 'Hà Nội là thủ đô', topic: 'dia-ly', tags: ['vn'],
    image: 'img/map.png',
  };

  // single -> multi
  const multiItem = changeType(singleItem, 'multi');
  assert.equal(multiItem.type, 'multi');
  assert.equal(multiItem.question, 'Thủ đô VN?');
  assert.deepEqual(multiItem.answer, [0]);
  assert.equal(multiItem.topic, 'dia-ly');
  assert.equal(multiItem.image, 'img/map.png');

  // single -> fill
  const fillItem = changeType(singleItem, 'fill');
  assert.equal(fillItem.type, 'fill');
  assert.equal(fillItem.question, 'Thủ đô VN?');
  assert.deepEqual(fillItem.answer, ['Hà Nội']);

  // fill -> card
  const cardItem = changeType(fillItem, 'card');
  assert.equal(cardItem.type, 'card');
  assert.equal(cardItem.front, 'Thủ đô VN?');
  assert.equal(cardItem.back, 'Hà Nội');

  // card -> single
  const backToSingle = changeType(cardItem, 'single');
  assert.equal(backToSingle.type, 'single');
  assert.equal(backToSingle.question, 'Thủ đô VN?');
  assert.equal(backToSingle.choices[0], 'Hà Nội');
  assert.deepEqual(backToSingle.answer, [0]);
});

test('deckmodel: unusedAssets phát hiện ảnh không được tham chiếu', () => {
  const d = {
    items: [
      { id: '1', type: 'card', front: '![a](img/used1.png)', back: 'B', image: 'img/used2.png' },
    ],
  };
  const assets = new Map([
    ['img/used1.png', new Uint8Array(10)],
    ['img/used2.png', new Uint8Array(10)],
    ['img/unused.png', new Uint8Array(10)],
  ]);
  const unused = unusedAssets(d, assets);
  assert.deepEqual(unused, ['img/unused.png']);
});

test('deckmodel: createHistory undo, redo và gộp các lần gõ liên tiếp < 500ms', () => {
  const initial = newDeck({ title: 'Gốc' });
  const h = createHistory(initial, 10);

  assert.equal(h.canUndo(), false);
  assert.equal(h.canRedo(), false);

  // Thao tác có cấu trúc (không phải gõ văn bản)
  const step1 = addItem(initial, { id: '1', type: 'card', front: '', back: '' });
  h.push(step1);
  assert.equal(h.canUndo(), true);
  assert.equal(h.canRedo(), false);

  // Người dùng gõ 'H', rồi 'He', rồi 'Hello' trong vòng 200ms
  const t0 = 1000;
  const t1 = updateItem(step1, '1', { front: 'H' });
  h.push(t1, { isTyping: true, now: t0 });

  const t2 = updateItem(step1, '1', { front: 'He' });
  h.push(t2, { isTyping: true, now: t0 + 100 }); // < 500ms -> gộp

  const t3 = updateItem(step1, '1', { front: 'Hello' });
  h.push(t3, { isTyping: true, now: t0 + 300 }); // < 500ms -> gộp

  // Thử undo: phải quay về step1 (không quay về 'He' hay 'H' vì đã gộp)
  const undone = h.undo();
  assert.equal(undone.items[0].front, '');

  // Thử redo: quay lại 'Hello'
  const redone = h.redo();
  assert.equal(redone.items[0].front, 'Hello');

  // Gõ tiếp sau 600ms (> 500ms): bước gõ mới được tạo
  const t4 = updateItem(redone, '1', { front: 'Hello World' });
  h.push(t4, { isTyping: true, now: t0 + 1000 });

  // Undo 1 lần: về 'Hello'
  assert.equal(h.undo().items[0].front, 'Hello');
  // Undo lần 2: về ''
  assert.equal(h.undo().items[0].front, '');
  // Undo lần 3: về initial (chưa có item)
  assert.equal(h.undo().items.length, 0);
  assert.equal(h.canUndo(), false);
});

test('deckmodel: createHistory lưu và khôi phục vị trí con trỏ (cursor)', () => {
  const d0 = { items: [{ id: '1', type: 'card', front: 'ab', back: '' }] };
  const h = createHistory(d0);
  const d1 = { items: [{ id: '1', type: 'card', front: 'abc', back: '' }] };
  h.push(d1, {
    beforeCursor: { itemId: '1', path: 'front', selStart: 2, selEnd: 2 },
    cursor: { itemId: '1', path: 'front', selStart: 3, selEnd: 3 },
  });
  assert.deepEqual(h.cursor(), { itemId: '1', path: 'front', selStart: 3, selEnd: 3 });

  h.undo();
  assert.deepEqual(h.cursor(), { itemId: '1', path: 'front', selStart: 2, selEnd: 2 });

  h.redo();
  assert.deepEqual(h.cursor(), { itemId: '1', path: 'front', selStart: 3, selEnd: 3 });
});

test('deckmodel: newItemLike, setCorrect, splitPastedChoices, normalizeOnLeave, isBlankNewItem', () => {
  const deck = {
    meta: { kind: 'quiz' },
    items: [{ id: 'q-001', type: 'multi', topic: '101.1', tags: ['linux', 'boot'] }],
  };
  const next = newItemLike(deck, deck.items[0]);
  assert.equal(next.id, 'q-002');
  assert.equal(next.type, 'single');
  assert.equal(next.choices.length, 4);
  assert.equal(next.topic, '101.1');
  assert.deepEqual(next.tags, ['linux', 'boot']);
  assert.equal(isBlankNewItem(next), true);

  // setCorrect tự đổi single <-> multi
  const c1 = setCorrect(next, 2, true);
  assert.equal(c1.type, 'multi');
  assert.deepEqual(c1.answer, [0, 2]);
  const c2 = setCorrect(c1, 0, false);
  assert.equal(c2.type, 'single');
  assert.deepEqual(c2.answer, [2]);

  // splitPastedChoices
  const pasted = splitPastedChoices('A. Lựa chọn một\n* B) Lựa chọn hai\n[x] 3. Lựa chọn ba\n- Lựa chọn bốn');
  assert.deepEqual(pasted, [
    { text: 'Lựa chọn một', correct: false },
    { text: 'Lựa chọn hai', correct: true },
    { text: 'Lựa chọn ba', correct: true },
    { text: 'Lựa chọn bốn', correct: false },
  ]);

  // normalizeOnLeave bỏ lựa chọn trống cuối (giữ tối thiểu 2)
  const raw = {
    id: 'q-003',
    type: 'single',
    question: '  Câu hỏi?  ',
    choices: [' Đáp án A ', ' Đáp án B ', '   ', ''],
    answer: [0],
  };
  const norm = normalizeOnLeave(raw);
  assert.equal(norm.question, 'Câu hỏi?');
  assert.deepEqual(norm.choices, ['Đáp án A', 'Đáp án B']);
  assert.equal(stripAccents('Giải tích 1 — Đường thẳng'), 'giai tich 1 — duong thang');
});


