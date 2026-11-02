import { test } from 'node:test';
import assert from 'node:assert/strict';
import { POS_OPTIONS } from '../src/views/editor/form/constants.js';
import {
  mapIssueFieldToPath,
  normalizeIssueGroup,
  computeVisibleIssues,
} from '../src/views/editor/form/validation.js';
import { createFormPane, POS_OPTIONS as RE_POS } from '../src/views/editor/form.js';

test('form constants: POS_OPTIONS đầy đủ 12 từ loại', () => {
  assert.equal(POS_OPTIONS.length, 12);
  assert.equal(POS_OPTIONS[0].value, '');
  assert.equal(POS_OPTIONS[1].value, 'noun');
  assert.equal(RE_POS, POS_OPTIONS);
});

test('form validation: mapIssueFieldToPath ánh xạ chính xác các trường lỗi', () => {
  // Trắc nghiệm
  const mcItem = { id: 'q-1', type: 'single', choices: [{ text: 'A' }, { text: 'B' }] };
  assert.equal(mapIssueFieldToPath('choices[2]', mcItem), 'choices.2');
  assert.equal(mapIssueFieldToPath('choices', mcItem), 'choices.0');
  assert.equal(mapIssueFieldToPath('answer', mcItem), 'choices.0');
  assert.equal(mapIssueFieldToPath('answers', mcItem), 'choices.0');
  assert.equal(mapIssueFieldToPath('question', mcItem), 'question');

  // Điền / Lệnh
  const fillItem = { id: 'q-2', type: 'fill', question: 'Q', answer: ['ans'] };
  assert.equal(mapIssueFieldToPath('answer[0]', fillItem), 'answers.0');
  assert.equal(mapIssueFieldToPath('answer', fillItem), 'answers.0');

  // Thẻ (card)
  const cardItem = { id: 'c-1', type: 'card', front: 'Front', back: 'Back' };
  assert.equal(mapIssueFieldToPath(null, cardItem), 'front');
  assert.equal(mapIssueFieldToPath('question', cardItem), 'front');

  // Từ vựng (vocab)
  const vocabItem = { id: 'v-1', type: 'vocab', term: 'apple', definition: 'quả táo' };
  assert.equal(mapIssueFieldToPath(null, vocabItem), 'term');
  assert.equal(mapIssueFieldToPath('question', vocabItem), 'term');
});

test('form validation: normalizeIssueGroup gom nhóm trường', () => {
  assert.equal(normalizeIssueGroup('answer[0]'), 'answer');
  assert.equal(normalizeIssueGroup('answer[2]'), 'answer');
  assert.equal(normalizeIssueGroup('term'), 'term');
  assert.equal(normalizeIssueGroup('definition'), 'definition');
  assert.equal(normalizeIssueGroup('example'), 'example');
  assert.equal(normalizeIssueGroup('question'), 'question');
  assert.equal(normalizeIssueGroup(''), 'question');
});

test('form validation: computeVisibleIssues lọc lỗi theo trạng thái touched', () => {
  const blankItem = { id: 'q-new', type: 'single', question: '', choices: [] };
  const getAssets = () => [];
  const untouchedState = {
    getItem: () => blankItem,
    getAssets,
    isItemTouched: () => false,
    getTouchedFields: () => new Set(),
  };

  // Mục mới tinh chưa chạm vào -> ẩn toàn bộ lỗi
  const res1 = computeVisibleIssues(untouchedState);
  assert.equal(res1.headerIssues.length, 0);
  assert.equal(res1.visibleByGroup.size, 0);

  // Đã chạm vào toàn mục (itemTouched = true)
  const res2 = computeVisibleIssues({
    ...untouchedState,
    isItemTouched: () => true,
  });
  assert.ok(res2.headerIssues.length > 0);
  assert.ok(res2.visibleByGroup.has('question') || res2.visibleByGroup.has('choices'));

  // Chỉ chạm vào ô câu hỏi (touchedFields có 'question')
  const res3 = computeVisibleIssues({
    ...untouchedState,
    getTouchedFields: () => new Set(['question']),
  });
  assert.ok(res3.visibleByGroup.has('question'));
});

test('form factory: createFormPane được re-export tương thích ngược', () => {
  assert.equal(typeof createFormPane, 'function');
});

