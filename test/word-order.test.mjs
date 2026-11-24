// test/word-order.test.mjs — Kiểm thử đơn vị & tích hợp cho dạng bài Sắp xếp từ (word-order)

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  shuffleWordBank,
  buildPlacedText,
  gradeWordOrder,
  generateWordOrderFromExample,
} from '../src/core/word-order.js';
import { validateItem, hasError } from '../src/core/validate.js';
import { buildQuestion, buildSessionQuestions } from '../src/core/builder.js';
import { parseImport } from '../src/core/parser.js';
import { newItem, changeType } from '../src/core/deckmodel.js';
import { gradeAnswer, canSubmit } from '../src/views/session/submit.js';
import { createExam, gradeExam } from '../src/core/exam.js';
import { allowedTypes } from '../src/core/deckkinds.js';

test('shuffleWordBank: gán id duy nhất, giữ nguyên từ trùng và khác thứ tự đáp án gốc', () => {
  const answer = ['The', 'cat', 'sat', 'on', 'the', 'mat.'];
  const distractors = ['mat', 'dog'];
  const bank = shuffleWordBank(answer, distractors);

  assert.equal(bank.length, answer.length + distractors.length);
  const ids = new Set(bank.map(t => t.id));
  assert.equal(ids.size, bank.length, 'Mỗi thẻ phải có id duy nhất');

  const texts = bank.map(t => t.text).sort();
  assert.deepEqual(texts, [...answer, ...distractors].sort());

  // Kể cả khi dùng rand trả về 0.99 (có thể giữ nguyên thứ tự), hàm vẫn phải đảm bảo khác đáp án gốc
  const bankWorstCase = shuffleWordBank(answer, [], () => 0.999);
  assert.notEqual(bankWorstCase.map(t => t.text).join(' '), answer.join(' '));
});

test('buildPlacedText & gradeWordOrder: chấm đúng theo chuỗi ghép, hỗ trợ từ trùng & alt_answers', () => {
  const bank = [
    { id: 't0', text: 'the' },
    { id: 't1', text: 'boy' },
    { id: 't2', text: 'saw' },
    { id: 't3', text: 'the' },
    { id: 't4', text: 'dog.' },
    { id: 't5', text: 'cats.' },
  ];
  const answer = ['the', 'boy', 'saw', 'the', 'dog.'];

  // Hoán đổi 2 thẻ 'the' (t3 và t0) vẫn phải đúng vì chấm theo chuỗi ghép
  const placedSwappedThe = ['t3', 't1', 't2', 't0', 't4'];
  const userText = buildPlacedText(bank, placedSwappedThe);
  assert.equal(userText, 'the boy saw the dog.');
  assert.equal(gradeWordOrder(userText, answer).ok, true);

  // Chọn nhầm distractor
  const wrongText = buildPlacedText(bank, ['t0', 't1', 't2', 't3', 't5']);
  assert.equal(gradeWordOrder(wrongText, answer).ok, false);

  // Đáp án thay thế (alt_answers)
  const alt = [['I', 'gave', 'him', 'the', 'book.']];
  assert.equal(
    gradeWordOrder('I gave him the book.', ['I', 'gave', 'the', 'book', 'to', 'him.'], alt).ok,
    true
  );

  // Không phân biệt hoa/thường khi caseSensitive: false
  assert.equal(
    gradeWordOrder('he bought bread.', ['He', 'bought', 'bread.'], [], { caseSensitive: false }).ok,
    true
  );
  assert.equal(
    gradeWordOrder('he bought bread.', ['He', 'bought', 'bread.'], [], { caseSensitive: true }).ok,
    false
  );
});

test('generateWordOrderFromExample: sinh câu word-order từ câu ví dụ', () => {
  const item = generateWordOrderFromExample('He bought four loaves of bread.', {
    id: 'wo_gen_1',
    prompt_vi: 'Anh ấy đã mua bốn ổ bánh mì.',
    forms: ['breads.', 'loaf', 'bought'],
    distractorCount: 2,
  });
  assert.equal(item.type, 'word-order');
  assert.deepEqual(item.answer, ['He', 'bought', 'four', 'loaves', 'of', 'bread.']);
  assert.equal(item.distractors.length, 2);
  assert.ok(!item.distractors.includes('bought'), 'Không lấy từ đã có trong answer làm distractor');
});

test('validateItem: kiểm tra hợp lệ và báo lỗi cho word-order', () => {
  const valid = {
    id: 'q001',
    type: 'word-order',
    prompt_vi: 'Anh ấy đã mua bốn ổ bánh mì.',
    answer: ['He', 'bought', 'four', 'loaves', 'of', 'bread.'],
    distractors: ['breads.', 'loaf'],
  };
  assert.equal(hasError(validateItem(valid, { deckKind: 'quiz' })), false);

  const missingAns = { id: 'q002', type: 'word-order', answer: [] };
  assert.equal(hasError(validateItem(missingAns, { deckKind: 'quiz' })), true);

  const badDistractor = { id: 'q003', type: 'word-order', answer: ['Hello.'], distractors: [''] };
  assert.equal(hasError(validateItem(badDistractor, { deckKind: 'quiz' })), true);

  assert.ok(allowedTypes('quiz').includes('word-order'));
});

test('parseImport: phân tích Markdown quiz dạng word-order', () => {
  const md = `
## Q wo_1 | word-order | topic=Ngữ pháp | tags=nouns
Anh ấy đã mua bốn ổ bánh mì.
answer: He | bought | four | loaves | of | bread.
distractors: breads. | loaf
> Danh từ không đếm được.
`;
  const res = parseImport(md, { format: 'md-quiz' });
  assert.equal(res.items.length, 1);
  const it = res.items[0];
  assert.equal(it.type, 'word-order');
  assert.equal(it.prompt_vi, 'Anh ấy đã mua bốn ổ bánh mì.');
  assert.deepEqual(it.answer, ['He', 'bought', 'four', 'loaves', 'of', 'bread.']);
  assert.deepEqual(it.distractors, ['breads.', 'loaf']);
  assert.equal(it.explanation, 'Danh từ không đếm được.');
});

test('builder, submit, exam & deckmodel tích hợp word-order', () => {
  const raw = newItem('word-order', 'wo_1');
  assert.equal(raw.type, 'word-order');

  const item = {
    id: 'wo_1',
    type: 'word-order',
    prompt_vi: 'Anh ấy đã mua bốn ổ bánh mì.',
    answer: ['He', 'bought', 'four', 'loaves', 'of', 'bread.'],
    distractors: ['breads.', 'loaf'],
  };

  const questions = buildSessionQuestions([item], { deckKind: 'quiz' });
  assert.equal(questions.length, 1);
  const q = questions[0];
  assert.equal(q.kind, 'word-order');
  assert.equal(q.bank.length, 8);

  assert.equal(canSubmit(q, []), false);

  // Tìm đúng dãy id tương ứng với answerTokens
  const used = new Set();
  const correctIds = q.answerTokens.map(tok => {
    const found = q.bank.find(b => b.text === tok && !used.has(b.id));
    used.add(found.id);
    return found.id;
  });

  assert.equal(canSubmit(q, correctIds), true);
  const { grade } = gradeAnswer(q, correctIds);
  assert.equal(grade.ok, true);

  // Exam mode grading
  const exam = createExam({ deck: { meta: { id: 'd1', title: 'Test' }, items: [item] }, shuffle: false });
  exam.answers[0] = correctIds;
  const examRes = gradeExam(exam);
  assert.equal(examRes.correctCount, 1);

  // Chuyển đổi từ fill sang word-order
  const converted = changeType({ id: 'f1', type: 'fill', question: 'Xin chào', answer: ['Hello world!'] }, 'word-order');
  assert.equal(converted.type, 'word-order');
  assert.equal(converted.prompt_vi, 'Xin chào');
  assert.deepEqual(converted.answer, ['Hello', 'world!']);
});

