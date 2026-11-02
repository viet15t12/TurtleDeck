import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createExam,
  getExamRemainingSeconds,
  gradeExam,
  applyExamWrongToSRS,
} from '../src/core/exam.js';

test('exam: hết giờ tự nộp, điểm đúng với đáp án đã chọn, câu sai đưa vào SRS', () => {
  const now = 1000000;
  const deck = {
    meta: { id: 'lpic-test', title: 'LPIC Exam Test' },
    items: [
      {
        id: 'q1',
        type: 'single',
        question: 'Lệnh nào dùng để liệt kê thư mục?',
        choices: ['ls', 'cd', 'pwd', 'mkdir'],
        answer: [0],
        topic: 'Command',
      },
      {
        id: 'q2',
        type: 'multi',
        question: 'Chọn các file cấu hình:',
        choices: ['/etc/passwd', '/bin/ls', '/etc/hosts', '/dev/null'],
        answer: [0, 2],
        topic: 'Config',
      },
      {
        id: 'q3',
        type: 'fill',
        question: 'Gõ lệnh xem đường dẫn thư mục hiện tại:',
        answers: ['pwd'],
        match: 'normalized',
        topic: 'Command',
      },
      {
        id: 'q4',
        type: 'single',
        question: 'Thư mục nào chứa file device?',
        choices: ['/etc', '/dev', '/bin'],
        answer: [1],
        topic: 'System',
      },
    ],
  };

  // 1. Tạo bài thi thử với durationMinutes: 10 phút = 600 giây
  const exam = createExam({
    deck,
    count: 4,
    durationMinutes: 10,
    shuffle: false,
    now,
  });

  assert.equal(exam.questions.length, 4);
  assert.equal(exam.durationSeconds, 600);

  // 2. Kiểm tra đồng hồ đếm ngược và hết giờ
  const tMid = getExamRemainingSeconds(exam, now + 200 * 1000);
  assert.equal(tMid.elapsedSeconds, 200);
  assert.equal(tMid.remainingSeconds, 400);
  assert.equal(tMid.isExpired, false);

  // Khi thời gian vượt quá 600s: hết giờ (isExpired: true)
  const tEnd = getExamRemainingSeconds(exam, now + 650 * 1000);
  assert.equal(tEnd.remainingSeconds, 0);
  assert.equal(tEnd.isExpired, true);

  // 3. Người dùng làm bài: chọn đúng q1, q2, nhưng sai q3 và q4
  exam.answers = {
    0: [0],       // q1: đúng (ls)
    1: [0, 2],    // q2: đúng (/etc/passwd, /etc/hosts)
    2: 'whereami',// q3: sai (đáp án là pwd)
    3: [0],       // q4: sai (chọn /etc, đáp án là /dev)
  };

  // Chấm điểm
  const graded = gradeExam(exam, { now: now + 650 * 1000 });
  assert.equal(graded.total, 4);
  assert.equal(graded.correctCount, 2);
  assert.equal(graded.wrongCount, 2);
  assert.equal(graded.score, 50); // 2/4 = 50%
  assert.equal(graded.passed, false); // < 70% -> trượt
  assert.equal(graded.isExpired, true); // Hết giờ tự nộp

  // Danh sách kết quả chi tiết
  assert.equal(graded.results[0].isCorrect, true);
  assert.equal(graded.results[1].isCorrect, true);
  assert.equal(graded.results[2].isCorrect, false);
  assert.equal(graded.results[3].isCorrect, false);

  // Hai câu sai là q3 và q4
  assert.deepEqual(graded.wrongItems.map(it => it.id), ['q3', 'q4']);

  // 4. Đưa câu sai vào SRS
  let progress = { cards: {}, log: [] };
  const srsRes = applyExamWrongToSRS(graded, progress, { deckId: 'lpic-test', now });
  progress = srsRes.progress;

  assert.equal(srsRes.scheduledCount, 2);
  assert.ok(progress.cards['lpic-test:q3:fwd']);
  assert.ok(progress.cards['lpic-test:q4:fwd']);
  // Đưa vào learning trong SRS
  assert.equal(progress.cards['lpic-test:q3:fwd'].state, 'learning');
  assert.equal(progress.cards['lpic-test:q4:fwd'].state, 'learning');
  assert.equal(progress.log.length, 2);
  assert.equal(progress.log[0].r, 1); // rating 1 (Again)
});
