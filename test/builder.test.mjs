import assert from 'node:assert/strict';
import test from 'node:test';
import { buildQuestion, buildSessionQuestions, shuffle } from '../src/core/builder.js';

test('buildQuestion: đưa các dạng single, multi, fill, command, card về cấu trúc thống nhất', () => {
  // 1. single
  const singleItem = {
    id: 's-1',
    type: 'single',
    question: '1 + 1 = ?',
    choices: ['1', '2', '3'],
    answer: [1],
    explanation: '1 + 1 = 2',
    topic: 'toan',
  };
  const qSingle = buildQuestion(singleItem);
  assert.equal(qSingle.id, 's-1');
  assert.equal(qSingle.kind, 'single');
  assert.equal(qSingle.prompt, '1 + 1 = ?');
  assert.deepEqual(qSingle.choices, ['1', '2', '3']);
  assert.deepEqual(qSingle.answers, [1]);
  assert.equal(qSingle.explanation, '1 + 1 = 2');
  assert.equal(qSingle.topic, 'toan');

  // 2. multi
  const multiItem = {
    id: 'm-1',
    type: 'multi',
    question: 'Chọn số chẵn',
    choices: ['1', '2', '4'],
    answer: [1, 2],
    explanation: '2 và 4 là số chẵn',
  };
  const qMulti = buildQuestion(multiItem);
  assert.equal(qMulti.id, 'm-1');
  assert.equal(qMulti.kind, 'multi');
  assert.equal(qMulti.prompt, 'Chọn số chẵn');
  assert.deepEqual(qMulti.choices, ['1', '2', '4']);
  assert.deepEqual(qMulti.answers, [1, 2]);

  // 3. fill
  const fillItem = {
    id: 'f-1',
    type: 'fill',
    question: 'PID 1 là ___',
    answer: ['systemd', 'init'],
    match: 'normalized',
    tolerance: 0.001,
    explanation: 'systemd là tiến trình đầu tiên',
  };
  const qFill = buildQuestion(fillItem);
  assert.equal(qFill.id, 'f-1');
  assert.equal(qFill.kind, 'fill');
  assert.equal(qFill.prompt, 'PID 1 là ___');
  assert.deepEqual(qFill.answers, ['systemd', 'init']);
  assert.equal(qFill.match, 'normalized');
  assert.equal(qFill.tolerance, 0.001);

  // 4. command
  const cmdItem = {
    id: 'c-1',
    type: 'command',
    question: 'Liệt kê PCI',
    answer: ['lspci'],
    match: 'exact',
    explanation: 'Lệnh lspci',
  };
  const qCmd = buildQuestion(cmdItem);
  assert.equal(qCmd.id, 'c-1');
  assert.equal(qCmd.kind, 'command');
  assert.equal(qCmd.prompt, 'Liệt kê PCI');
  assert.deepEqual(qCmd.answers, ['lspci']);
  assert.equal(qCmd.match, 'exact');

  // 5. card
  const cardItem = {
    id: 'k-1',
    type: 'card',
    front: 'inode là gì?',
    back: 'Metadata của file',
    image: 'img/a.svg',
    answerImage: 'img/b.svg',
    explanation: 'Chi tiết về inode',
  };
  const qCard = buildQuestion(cardItem);
  assert.equal(qCard.id, 'k-1');
  assert.equal(qCard.kind, 'card');
  assert.equal(qCard.prompt, 'inode là gì?');
  assert.equal(qCard.front, 'inode là gì?');
  assert.equal(qCard.back, 'Metadata của file');
  assert.deepEqual(qCard.answers, ['Metadata của file']);
  assert.equal(qCard.image, 'img/a.svg');
  assert.equal(qCard.answerImage, 'img/b.svg');

  // 6. vocab fallback sang card
  const vocabItem = {
    id: 'v-1',
    term: 'mitigate',
    definition: 'giảm nhẹ',
    phonetic: '/ˈmɪtɪɡeɪt/',
    example: 'Trees help mitigate pollution.',
  };
  const qVocab = buildQuestion(vocabItem);
  assert.equal(qVocab.id, 'v-1');
  assert.equal(qVocab.kind, 'card');
  assert.match(qVocab.prompt, /mitigate/);
  assert.match(qVocab.prompt, /\/ˈmɪtɪɡeɪt\//);
  assert.deepEqual(qVocab.answers, ['giảm nhẹ']);
  assert.match(qVocab.explanation, /Trees help mitigate pollution/);
});

test('buildQuestion: trả null khi item không hợp lệ', () => {
  assert.equal(buildQuestion(null), null);
  assert.equal(buildQuestion({}), null);
  assert.equal(buildQuestion({ type: 'unknown_type' }), null);
});

test('buildSessionQuestions: chọn số câu, thứ tự và lọc câu hỏi', () => {
  const items = [
    { id: '1', type: 'single', question: 'Q1', choices: ['A', 'B'], answer: [0] },
    { id: '2', type: 'single', question: 'Q2', choices: ['A', 'B'], answer: [1] },
    { id: '3', type: 'fill', question: 'Q3', answer: ['ans3'] },
    { id: '4', type: 'command', question: 'Q4', answer: ['cmd4'] },
    { id: '5', type: 'card', front: 'Front5', back: 'Back5' },
  ];

  // Lấy tất cả theo thứ tự
  const all = buildSessionQuestions(items);
  assert.equal(all.length, 5);
  assert.deepEqual(all.map(q => q.id), ['1', '2', '3', '4', '5']);

  // Giới hạn số câu (count: 3)
  const sliced = buildSessionQuestions(items, { count: 3 });
  assert.equal(sliced.length, 3);
  assert.deepEqual(sliced.map(q => q.id), ['1', '2', '3']);

  // Lọc theo itemIds (phục vụ học lại câu sai)
  const retryList = buildSessionQuestions(items, { itemIds: ['2', '4'] });
  assert.equal(retryList.length, 2);
  assert.deepEqual(retryList.map(q => q.id), ['2', '4']);

  // Shuffle giữ nguyên tập hợp các câu hỏi
  const shuffled = buildSessionQuestions(items, { shuffle: true });
  assert.equal(shuffled.length, 5);
  assert.deepEqual(new Set(shuffled.map(q => q.id)), new Set(['1', '2', '3', '4', '5']));
});

