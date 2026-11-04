import test from 'node:test';
import assert from 'node:assert/strict';
import { createKeyHandler } from '../src/views/session/keyboard.js';
import { createSessionState, resetForQuestion } from '../src/views/session/session-state.js';

test('keyboard: ev.repeat bị bỏ qua hoàn toàn', () => {
  let submittedCount = 0;
  const session = createSessionState([
    { id: 'q1', kind: 'card', front: 'A', back: 'B' }
  ]);
  const ctx = {
    session,
    render: () => {},
    submitCurrent: () => { submittedCount++; },
    nextQuestion: () => {},
    requestExit: () => {},
    actions: {},
    settings: {},
  };

  const handler = createKeyHandler(ctx);
  const ev = { key: 'Enter', repeat: true, preventDefault: () => {} };
  handler(ev);

  assert.equal(session.cardFlipped, false, 'Không được lật thẻ khi ev.repeat là true');
  assert.equal(submittedCount, 0, 'Không được nộp bài khi ev.repeat là true');
});

test('keyboard: câu hỏi mới chuyển < 150ms không bị tự động lật thẻ hoặc nộp bài', () => {
  let submittedCount = 0;
  const session = createSessionState([
    { id: 'q1', kind: 'card', front: 'Card 1', back: 'Back 1' },
    { id: 'q2', kind: 'card', front: 'Card 2', back: 'Back 2' }
  ]);
  session.submitted = true;

  const ctx = {
    session,
    render: () => {},
    submitCurrent: () => { submittedCount++; },
    nextQuestion: () => {
      session.index++;
      resetForQuestion(session, session.questions[session.index]);
    },
    requestExit: () => {},
    actions: {},
    settings: {},
  };

  const handler = createKeyHandler(ctx);

  // Nhấn Enter để chuyển câu từ q1 sang q2
  let prevented = false;
  handler({ key: 'Enter', preventDefault: () => { prevented = true; } });

  assert.equal(session.index, 1, 'Đã chuyển sang câu 2');
  assert.equal(session.submitted, false, 'Câu 2 chưa nộp');
  assert.equal(session.cardFlipped, false, 'Câu 2 chưa lật');

  // Ngay lập tức (trong 150ms), một sự kiện Enter khác (hoặc do double bubble trước đây) gửi tới
  let prevented2 = false;
  handler({ key: 'Enter', preventDefault: () => { prevented2 = true; } });

  assert.equal(session.cardFlipped, false, 'Thẻ câu 2 KHÔNG được tự động lật trong cooldown');
  assert.equal(submittedCount, 0, 'Không được submit');
});

test('keyboard: không nộp bài trắng dạng text (fill/command/listen) khi nhấn Enter', () => {
  let submittedCount = 0;
  const session = createSessionState([
    { id: 'q1', kind: 'fill', prompt: 'Prompt', answers: ['abc'] }
  ]);
  // Giả lập câu hỏi đã xuất hiện đủ lâu (> 200ms)
  session.questionStartedAt = Date.now() - 300;
  session.userAnswer = '   '; // trắng

  const ctx = {
    session,
    render: () => {},
    submitCurrent: () => { submittedCount++; },
    nextQuestion: () => {},
    requestExit: () => {},
    actions: {},
    settings: {},
  };

  const handler = createKeyHandler(ctx);
  handler({ key: 'Enter', preventDefault: () => {} });

  assert.equal(submittedCount, 0, 'Không được submit bài trắng khi userAnswer chỉ có khoảng trắng');

  // Khi đã gõ đáp án hợp lệ
  session.userAnswer = 'abc';
  handler({ key: 'Enter', preventDefault: () => {} });
  assert.equal(submittedCount, 1, 'Được submit khi có đáp án');
});

test('keyboard: không nộp bài trắng dạng multi khi chưa chọn đáp án', () => {
  let submittedCount = 0;
  const session = createSessionState([
    { id: 'q1', kind: 'multi', prompt: 'Prompt', choices: ['A', 'B', 'C'], answers: [0, 1] }
  ]);
  session.questionStartedAt = Date.now() - 300;
  session.userAnswer = [];

  const ctx = {
    session,
    render: () => {},
    submitCurrent: () => { submittedCount++; },
    nextQuestion: () => {},
    requestExit: () => {},
    actions: {},
    settings: {},
  };

  const handler = createKeyHandler(ctx);
  handler({ key: 'Enter', preventDefault: () => {} });

  assert.equal(submittedCount, 0, 'Không được submit khi chưa chọn lựa chọn nào trong multi');

  // Khi đã chọn 1 lựa chọn
  session.userAnswer = [0];
  handler({ key: 'Enter', preventDefault: () => {} });
  assert.equal(submittedCount, 1, 'Được submit khi đã chọn ít nhất 1 đáp án');
});
