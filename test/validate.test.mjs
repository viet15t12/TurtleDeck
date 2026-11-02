import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateItem, validateDeck, hasError, itemType, parseNumber } from '../src/core/validate.js';

const fields = issues => issues.filter(i => i.level === 'error').map(i => i.field);
const ok = (item, opts) => assert.deepEqual(validateItem(item, opts), [], JSON.stringify(validateItem(item, opts)));
const errs = (item, ...expected) => {
  const got = fields(validateItem(item));
  for (const f of expected) assert.ok(got.includes(f), `thiếu lỗi ở "${f}", có: ${JSON.stringify(validateItem(item))}`);
};

const single = { id: 'a', type: 'single', question: 'Q?', choices: ['x', 'y', 'z'], answer: [1] };

test('item hợp lệ của mọi dạng', () => {
  ok(single);
  ok({ id: 'b', type: 'multi', question: 'Q?', choices: ['x', { text: 'y' }, { image: 'img/z.png' }], answer: [0, 2] });
  ok({ id: 'c', type: 'fill', question: 'Q ___', answer: ['abc'] });
  ok({ id: 'd', type: 'command', question: 'Q', answer: ['rpm -qa', 'rpm --query --all'], match: 'normalized', tags: ['rpm'], topic: '102.4' });
  ok({ id: 'e', type: 'card', front: 'F', back: 'B', image: 'img/a.png' });
  ok({ id: 'f', term: 'mitigate', definition: 'giảm nhẹ', forms: ['mitigated'] });
  ok({ id: 'g', type: 'fill', question: 'Q', answer: ['^ab+c$'], match: 'regex' });
  ok({ id: 'h', type: 'fill', question: 'Q', answer: ['1/3', '0,5', '1e-3'], match: 'number', tolerance: 0.001 });
});

test('thiếu id / id sai kiểu', () => {
  errs({ ...single, id: undefined }, 'id');
  errs({ ...single, id: '' }, 'id');
  errs({ ...single, id: 12 }, 'id');
});

test('thiếu type / type lạ', () => {
  errs({ id: 'x', question: 'Q' }, 'type');
  errs({ id: 'x', type: 'essay', question: 'Q' }, 'type');
  assert.equal(itemType({ id: 'x', question: 'Q' }, 'vocab'), 'vocab');
});

test('single/multi: thiếu câu hỏi, lựa chọn, đáp án ngoài choices…', () => {
  errs({ ...single, question: '  ' }, 'question');
  errs({ ...single, choices: undefined }, 'choices');
  errs({ ...single, choices: ['x'], answer: [0] }, 'choices');
  errs({ ...single, answer: [3] }, 'answer');
  errs({ ...single, answer: [-1] }, 'answer');
  errs({ ...single, answer: ['1'] }, 'answer');
  errs({ ...single, answer: 1 }, 'answer');
  errs({ ...single, answer: [] }, 'answer');
  errs({ ...single, answer: [0, 1] }, 'answer');                       // single có 2 đáp án
  errs({ ...single, type: 'multi', answer: [1, 1] }, 'answer');         // lặp
  errs({ ...single, choices: ['x', '', 'z'] }, 'choices[1]');           // rỗng
  errs({ ...single, choices: ['x', 'y', ' x '] }, 'choices[2]');        // trùng
  errs({ ...single, choices: ['x', { text: 'a', image: 'img/1.png' }, { text: 'a', image: 'img/1.png' }] }, 'choices[2]');
  ok({ ...single, choices: ['x', { text: 'a', image: 'img/1.png' }, { text: 'a', image: 'img/2.png' }] });
  errs({ ...single, choices: ['x', 5, 'z'] }, 'choices[1]');
});

test('fill/command: đáp án, match, regex, number, tolerance', () => {
  const f = { id: 'f', type: 'fill', question: 'Q' };
  errs(f, 'answer');
  errs({ ...f, answer: [] }, 'answer');
  errs({ ...f, answer: 'abc' }, 'answer');
  errs({ ...f, answer: [''] }, 'answer[0]');
  errs({ ...f, answer: ['ok', 3] }, 'answer[1]');
  errs({ ...f, answer: ['x'], match: 'fuzzy' }, 'match');
  errs({ ...f, answer: ['(abc'], match: 'regex' }, 'answer[0]');
  errs({ ...f, answer: ['một'], match: 'number' }, 'answer[0]');
  errs({ ...f, answer: ['1'], match: 'number', tolerance: -1 }, 'tolerance');
  errs({ ...f, answer: ['1'], match: 'number', tolerance: '0.1' }, 'tolerance');
  errs({ id: 'c', type: 'command', answer: ['ls'] }, 'question');
});

test('card / vocab thiếu trường', () => {
  errs({ id: 'c', type: 'card', front: 'F' }, 'back');
  errs({ id: 'c', type: 'card', back: 'B' }, 'front');
  errs({ id: 'v', term: 'x' }, 'definition');
  errs({ id: 'v', definition: 'x', term: '' }, 'term');
});

test('trường chung sai kiểu', () => {
  errs({ ...single, tags: 'a,b' }, 'tags');
  errs({ ...single, tags: ['a', 1] }, 'tags');
  errs({ ...single, topic: 101 }, 'topic');
  errs({ ...single, explanation: { md: 'x' } }, 'explanation');
});

test('item không phải object', () => {
  for (const v of [null, 'x', 3, []]) assert.equal(hasError(validateItem(v)), true);
});

test('parseNumber', () => {
  assert.equal(parseNumber('0,5'), 0.5);
  assert.ok(Math.abs(parseNumber('1/3') - 1 / 3) < 1e-12);
  assert.equal(parseNumber('1e-3'), 0.001);
  assert.equal(parseNumber('-2.5'), -2.5);
  assert.ok(Number.isNaN(parseNumber('')));
  assert.ok(Number.isNaN(parseNumber('abc')));
});

test('validateDeck: lỗi cấp bộ thẻ', () => {
  assert.match(validateDeck(null).errors[0], /không phải đối tượng/);
  assert.match(validateDeck([]).errors[0], /không phải đối tượng/);
  assert.ok(validateDeck({ items: [] }).errors.some(e => /meta/.test(e)));
  assert.ok(validateDeck({ meta: { title: 'x' }, items: [] }).errors.some(e => /meta\.id/.test(e)));
  assert.ok(validateDeck({ meta: { id: 'x' } }).errors.some(e => /items/.test(e)));
  assert.ok(validateDeck({ meta: { id: 'x' }, items: {} }).errors.some(e => /items/.test(e)));
  assert.ok(validateDeck({ meta: { id: 'x', formatVersion: 2 }, items: [] }).errors.some(e => /mới hơn/.test(e)));
  assert.ok(validateDeck({ meta: { id: 'x', format: 'anki' }, items: [] }).errors.length);
  assert.deepEqual(validateDeck({ meta: { id: 'x', title: 'T', formatVersion: 1, format: 'studydeck' }, items: [single] }).errors, []);
});

test('validateDeck: id trùng', () => {
  const v = validateDeck({ meta: { id: 'x', title: 'T' }, items: [single, { ...single, question: 'khác' }, { ...single, id: 'b' }, single] });
  assert.equal(v.errors.length, 1);
  assert.match(v.errors[0], /Trùng id "a".*1, 2, 4/);
});

test('validateDeck: cảnh báo không chặn (thiếu tiêu đề, kind lạ, deck rỗng) và lỗi theo từng item', () => {
  const v = validateDeck({ meta: { id: 'x', kind: 'abc' }, items: [single, { id: 'z', type: 'card' }] });
  assert.deepEqual(v.errors, []);
  assert.equal(v.warnings.length, 2);
  assert.equal(v.items.length, 2);
  assert.equal(hasError(v.items[0].issues), false);
  assert.equal(hasError(v.items[1].issues), true);
  assert.equal(v.items[1].id, 'z');
  assert.ok(validateDeck({ meta: { id: 'x', title: 'T' }, items: [] }).warnings.some(w => /chưa có mục/.test(w)));
});

