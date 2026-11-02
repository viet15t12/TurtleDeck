import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildQuestion,
  buildSessionQuestions,
  shuffle,
  buildMC,
  buildWrite,
  buildCloze,
  buildListen,
  buildFlashcard,
} from '../src/core/builder.js';

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

test('buildMC: tạo câu trắc nghiệm vocab với 1 đáp án đúng, không trùng, đủ 4 lựa chọn, ưu tiên pos/tag', () => {
  const items = [
    { id: '1', term: 'mitigate', definition: 'giảm nhẹ', pos: 'verb', tags: ['env'] },
    { id: '2', term: 'deteriorate', definition: 'xấu đi', pos: 'verb', tags: ['env'] },
    { id: '3', term: 'enhance', definition: 'nâng cao', pos: 'verb', tags: ['edu'] },
    { id: '4', term: 'advocate', definition: 'ủng hộ', pos: 'verb', tags: ['society'] },
    { id: '5', term: 'abundant', definition: 'phong phú', pos: 'adjective', tags: ['nature'] },
  ];

  // 1. Đủ 4 lựa chọn khi deck >= 4 từ
  const mcFwd = buildMC(items[0], items, 'fwd');
  assert.ok(mcFwd);
  assert.equal(mcFwd.kind, 'single');
  assert.equal(mcFwd.prompt, 'mitigate');
  assert.equal(mcFwd.choices.length, 4);
  assert.equal(new Set(mcFwd.choices).size, 4);
  assert.equal(mcFwd.answers.length, 1);
  assert.equal(mcFwd.choices[mcFwd.answers[0]], 'giảm nhẹ');

  // Ưu tiên cùng pos: vì có 3 verb khác trong items, cả 3 distractor phải là verb (xấu đi, nâng cao, ủng hộ)
  assert.ok(mcFwd.choices.includes('xấu đi'));
  assert.ok(mcFwd.choices.includes('nâng cao'));
  assert.ok(mcFwd.choices.includes('ủng hộ'));

  // 2. Chiều rev (VI -> EN)
  const mcRev = buildMC(items[0], items, 'rev');
  assert.ok(mcRev);
  assert.equal(mcRev.prompt, 'giảm nhẹ');
  assert.equal(mcRev.choices[mcRev.answers[0]], 'mitigate');

  // 3. Deck nhỏ hơn 4 từ: tự giảm lựa chọn
  const smallDeck = [items[0], items[1], items[2]];
  const mcSmall = buildMC(items[0], smallDeck, 'fwd');
  assert.equal(mcSmall.choices.length, 3);

  const twoDeck = [items[0], items[1]];
  const mcTwo = buildMC(items[0], twoDeck, 'fwd');
  assert.equal(mcTwo.choices.length, 2);

  // 4. < 2 từ -> trả null
  const oneDeck = [items[0]];
  assert.equal(buildMC(items[0], oneDeck, 'fwd'), null);
});

test('buildWrite: gõ từ 2 chiều (rev: term, fwd: definition đầy đủ và từng phần qua dấu ;)', () => {
  const item = {
    id: 'w-1',
    term: 'advocate',
    definition: 'ủng hộ; biện hộ; người ủng hộ',
    pos: 'verb',
  };

  // rev: VI -> EN
  const wRev = buildWrite(item, 'rev');
  assert.equal(wRev.prompt, 'ủng hộ; biện hộ; người ủng hộ');
  assert.deepEqual(wRev.answers, ['advocate']);
  assert.equal(wRev.direction, 'rev');

  // fwd: EN -> VI
  const wFwd = buildWrite(item, 'fwd');
  assert.equal(wFwd.prompt, 'advocate');
  assert.ok(wFwd.answers.includes('ủng hộ; biện hộ; người ủng hộ'));
  assert.ok(wFwd.answers.includes('ủng hộ'));
  assert.ok(wFwd.answers.includes('biện hộ'));
  assert.ok(wFwd.answers.includes('người ủng hộ'));
  assert.equal(wFwd.direction, 'fwd');
});

test('buildCloze: tạo câu cloze khớp term, forms, term nhiều từ, bỏ qua LaTeX/ảnh', () => {
  // 1. Khớp forms: mitigated
  const item1 = {
    id: 'c-1',
    term: 'mitigate',
    definition: 'giảm nhẹ',
    pos: 'verb',
    forms: ['mitigates', 'mitigated', 'mitigating'],
    example: 'The risks were mitigated effectively by the team.',
  };
  const q1 = buildCloze(item1);
  assert.ok(q1);
  assert.equal(q1.prompt, 'The risks were _____ effectively by the team.');
  assert.deepEqual(q1.answers, ['mitigated']);
  assert.equal(q1.hint, 'giảm nhẹ (verb)');

  // 2. Term nhiều từ chịu khoảng trắng linh hoạt
  const itemMulti = {
    id: 'c-2',
    term: 'take into account',
    definition: 'tính đến, xem xét',
    example: 'We must take  into   account the weather.',
  };
  const qMulti = buildCloze(itemMulti);
  assert.ok(qMulti);
  assert.equal(qMulti.prompt, 'We must _____ the weather.');
  assert.equal(qMulti.answers[0], 'take  into   account');

  // 3. Không khớp bên trong $...$ hoặc ![...](...)
  const itemLatex = {
    id: 'c-3',
    term: 'set',
    definition: 'tập hợp',
    example: 'A set $S = \\{x \\mid x \\in \\text{set}\\}$ is defined here.',
  };
  const qLatex = buildCloze(itemLatex);
  assert.ok(qLatex);
  // Chỉ từ "set" ngoài công thức bị thay, từ "set" bên trong $...$ không bị thay
  assert.equal(qLatex.prompt, 'A _____ $S = \\{x \\mid x \\in \\text{set}\\}$ is defined here.');

  // 4. Không có example hoặc không khớp -> trả null
  assert.equal(buildCloze({ id: 'c-4', term: 'apple', definition: 'táo' }), null);
  assert.equal(buildCloze({ id: 'c-5', term: 'apple', definition: 'táo', example: 'I like oranges.' }), null);
});

test('buildListen: sinh câu nghe-gõ không lộ term trong prompt, speak chuẩn', () => {
  const item = {
    id: 'l-1',
    term: 'sustainable',
    phonetic: '/səˈsteɪnəbl/',
    definition: 'bền vững',
    example: 'Sustainable cities.',
  };
  const q = buildListen(item);
  assert.ok(q);
  assert.equal(q.kind, 'listen');
  assert.equal(q.prompt, ''); // Không lộ term
  assert.equal(q.speak, 'sustainable');
  assert.deepEqual(q.answers, ['sustainable']);
  assert.equal(q.phonetic, '/səˈsteɪnəbl/');
  assert.equal(q.definition, 'bền vững');
});

test('buildFlashcard: hỗ trợ 2 chiều fwd và rev kèm đầy đủ trường', () => {
  const item = {
    id: 'fc-1',
    term: 'scarcity',
    phonetic: '/ˈskeəsəti/',
    pos: 'noun',
    definition: 'sự khan hiếm',
    example: 'Water scarcity is severe.',
    image: 'img/water.png',
  };

  const fwd = buildFlashcard(item, 'fwd');
  assert.equal(fwd.kind, 'card');
  assert.equal(fwd.front, 'scarcity /ˈskeəsəti/');
  assert.equal(fwd.back, 'sự khan hiếm');
  assert.equal(fwd.image, 'img/water.png');

  const rev = buildFlashcard(item, 'rev');
  assert.equal(rev.front, 'sự khan hiếm');
  assert.equal(rev.back, 'scarcity /ˈskeəsəti/');
  assert.equal(rev.answerImage, 'img/water.png');
});


