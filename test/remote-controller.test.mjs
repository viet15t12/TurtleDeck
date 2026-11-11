// test/remote-controller.test.mjs — Kiểm thử tính năng QR Code SVG và Remote Controller logic
import test from 'node:test';
import assert from 'node:assert/strict';
import { generateQrSvg, createQrMatrix } from '../src/views/session/qr-svg.js';
import { handleRemoteAction } from '../src/views/session/remote-controller.js';

test('qr-svg: createQrMatrix generates valid 2D square matrix with finder patterns', () => {
  const matrix = createQrMatrix('http://192.168.1.5:8765');
  assert.ok(Array.isArray(matrix), 'Matrix must be an array');
  const size = matrix.length;
  assert.ok(size >= 21, 'QR matrix size must be at least 21x21');
  assert.strictEqual(matrix[0].length, size, 'Matrix must be square');

  // Kiểm tra Finder pattern ở góc trên trái (vị trí 0,0 đến 6,6)
  assert.strictEqual(matrix[0][0], true);
  assert.strictEqual(matrix[0][6], true);
  assert.strictEqual(matrix[6][0], true);
  assert.strictEqual(matrix[6][6], true);
  assert.strictEqual(matrix[1][1], false);
  assert.strictEqual(matrix[3][3], true);
});

test('qr-svg: generateQrSvg produces valid SVG string with correct attributes', () => {
  const svg = generateQrSvg('http://192.168.1.100:8765', 200);
  assert.ok(svg.startsWith('<svg'), 'Must start with <svg tag');
  assert.ok(svg.includes('viewBox="0 0 200 200"'), 'Must have correct viewBox');
  assert.ok(svg.includes('width="200"'), 'Must specify width');
  assert.ok(svg.includes('height="200"'), 'Must specify height');
  assert.ok(svg.includes('<rect'), 'Must contain rect elements');
  assert.ok(svg.includes('fill="#000000"'), 'Modules must be solid black #000000');
  assert.ok(!svg.includes('fill="currentColor"'), 'Must not use currentColor to avoid dark mode white-on-white');
  assert.ok(svg.endsWith('</svg>'), 'Must close svg tag');
});

test('remote-controller: handleRemoteAction SELECT_CHOICE triggers option selection and submit', () => {
  let submittedCalled = false;
  let renderCalled = false;

  const mockSession = {
    index: 0,
    submitted: false,
    cardFlipped: false,
    userAnswer: null,
    questions: [
      {
        id: 'q1',
        kind: 'single',
        prompt: '1 + 1 = ?',
        choices: [
          { id: 'c1', text: '1' },
          { id: 'c2', text: '2' },
          { id: 'c3', text: '3' },
          { id: 'c4', text: '4' },
        ],
        answers: '2',
      },
    ],
  };

  const mockCtx = {
    session: mockSession,
    submitCurrent: () => {
      submittedCalled = true;
      mockSession.submitted = true;
    },
    render: () => {
      renderCalled = true;
    },
    nextQuestion: () => {},
  };

  // Người dùng bấm nút B (lựa chọn thứ 2: '2')
  handleRemoteAction({ action: 'SELECT_CHOICE', payload: { optionId: 'B' } }, mockCtx);

  assert.strictEqual(mockSession.userAnswer, '2', 'User answer should be set to 2');
  assert.ok(submittedCalled, 'Single choice should auto-submit');
});

test('remote-controller: handleRemoteAction FLIP and RATE_SRS for flashcards', () => {
  let ratedValue = null;
  let nextCalled = false;

  const mockSession = {
    index: 0,
    submitted: false,
    cardFlipped: false,
    questions: [
      {
        id: 'c1',
        kind: 'card',
        front: 'Hello',
        back: 'Xin chào',
      },
    ],
  };

  const mockCtx = {
    session: mockSession,
    render: () => {},
    submitCurrent: (rating) => {
      ratedValue = rating;
      mockSession.submitted = true;
    },
    nextQuestion: () => {
      nextCalled = true;
    },
  };

  // 1. Thao tác LẬT THẺ
  handleRemoteAction({ action: 'FLIP' }, mockCtx);
  assert.strictEqual(mockSession.cardFlipped, true, 'Card should be flipped');

  // 2. Thao tác ĐÁNH GIÁ SRS (Tốt = 3)
  handleRemoteAction({ action: 'RATE_SRS', payload: { rating: 3 } }, mockCtx);
  assert.strictEqual(ratedValue, 3, 'Rating should be 3');
  assert.ok(nextCalled, 'Should move to next question');
});
