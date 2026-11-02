import assert from 'node:assert/strict';
import test from 'node:test';
import { DAY, MINUTE } from '../src/core/srs.js';
import {
  localDayKey,
  countNewStudiedToday,
  deckDueCounts,
  planSession,
  reinsertWrong,
} from '../src/core/planner.js';

function makeValidItem(id, question = `Câu hỏi ${id}`) {
  return {
    id,
    type: 'single',
    question,
    choices: ['Đáp án A', 'Đáp án B'],
    answer: [0],
  };
}

test('planner: chọn câu theo đúng thứ tự due (quá hạn lâu nhất trước) → learning → new', () => {
  const now = Date.parse('2026-11-02T10:00:00+07:00');
  const deck = {
    meta: { id: 'lpic-101', title: 'LPIC 101', kind: 'quiz' },
    items: [
      makeValidItem('new-1'),
      makeValidItem('due-recent'),
      makeValidItem('learn-2'),
      makeValidItem('due-oldest'),
      makeValidItem('not-due-future'),
      makeValidItem('learn-1'),
      makeValidItem('new-2'),
    ],
  };

  const progress = {
    version: 1,
    cards: {
      'lpic-101:due-recent:fwd': { state: 'review', step: 0, ease: 2.5, interval: 3, due: now - 1 * DAY, reps: 2, lapses: 0 },
      'lpic-101:due-oldest:fwd': { state: 'review', step: 0, ease: 2.5, interval: 5, due: now - 4 * DAY, reps: 3, lapses: 0 },
      'lpic-101:not-due-future:fwd': { state: 'review', step: 0, ease: 2.5, interval: 7, due: now + 2 * DAY, reps: 4, lapses: 0 },
      'lpic-101:learn-2:fwd': { state: 'learning', step: 1, ease: 2.5, interval: 0, due: now + 5 * MINUTE, reps: 0, lapses: 0 },
      'lpic-101:learn-1:fwd': { state: 'relearning', step: 0, ease: 2.3, interval: 2, due: now - 2 * MINUTE, reps: 2, lapses: 1 },
    },
    meta: {},
    log: [],
  };

  const planned = planSession(deck, progress, now, { newCardsPerDay: 10 });
  assert.deepEqual(
    planned.map(q => q.id),
    ['due-oldest', 'due-recent', 'learn-1', 'learn-2', 'new-1', 'new-2']
  );
  assert.deepEqual(
    planned.map(q => q.category),
    ['due', 'due', 'learning', 'learning', 'new', 'new']
  );
});

test('planner: giới hạn N thẻ mới/ngày (tính từ log trong ngày)', () => {
  const now = Date.parse('2026-11-02T15:00:00+07:00');
  const morning = Date.parse('2026-11-02T08:30:00+07:00');

  const deck = {
    meta: { id: 'eng-01', title: 'English', kind: 'quiz' },
    items: [
      makeValidItem('q1'),
      makeValidItem('q2'),
      makeValidItem('q3'),
      makeValidItem('q4'),
      makeValidItem('q5'),
    ],
  };

  // Sáng nay đã học 2 thẻ mới (q1 được ôn 2 bước trong cùng sáng nay vẫn tính là 1 thẻ mới)
  const progress = {
    version: 1,
    cards: {
      'eng-01:q1:fwd': { state: 'review', step: 2, ease: 2.5, interval: 1, due: now + DAY, reps: 0, lapses: 0 },
      'eng-01:q2:fwd': { state: 'review', step: 2, ease: 2.5, interval: 1, due: now + DAY, reps: 0, lapses: 0 },
    },
    log: [
      { t: morning, card: 'eng-01:q1:fwd', rating: 3, ms: 2000 },
      { t: morning + 60000, card: 'eng-01:q1:fwd', rating: 3, ms: 1800 },
      { t: morning + 120000, card: 'eng-01:q2:fwd', rating: 4, ms: 1500 },
    ],
  };

  assert.equal(countNewStudiedToday(progress.log, now, { deckId: 'eng-01', cards: progress.cards }), 2);

  // Giới hạn 3 thẻ mới/ngày -> hôm nay chỉ lấy thêm tối đa 3 - 2 = 1 thẻ mới (q3)
  const planned = planSession(deck, progress, now, { newCardsPerDay: 3 });
  assert.deepEqual(planned.map(q => q.id), ['q3']);

  // Nếu giới hạn 2 thẻ mới/ngày -> hôm nay đã đủ hạn mức, không lấy thêm thẻ mới nào
  const plannedFull = planSession(deck, progress, now, { newCardsPerDay: 2 });
  assert.deepEqual(plannedFull.map(q => q.id), []);
});

test('planner: qua nửa đêm Asia/Saigon reset bộ đếm thẻ mới trong ngày', () => {
  const prevTZ = process.env.TZ;
  process.env.TZ = 'Asia/Saigon';
  try {
    // 23:55 ngày 02/11/2026 giờ Asia/Saigon (tức 16:55 UTC ngày 02/11)
    const beforeMidnight = Date.parse('2026-11-02T23:55:00+07:00');
    // 00:05 ngày 03/11/2026 giờ Asia/Saigon (tức 17:05 UTC ngày 02/11 — vẫn cùng ngày UTC!)
    const afterMidnight = Date.parse('2026-11-03T00:05:00+07:00');

    assert.equal(localDayKey(beforeMidnight, 'Asia/Saigon'), '2026-11-02');
    assert.equal(localDayKey(afterMidnight, 'Asia/Saigon'), '2026-11-03');

    const deck = {
      meta: { id: 'saigon-deck', title: 'Saigon Deck', kind: 'quiz' },
      items: [
        makeValidItem('c1'),
        makeValidItem('c2'),
        makeValidItem('c3'),
      ],
    };

    const progress = {
      version: 1,
      cards: {
        'saigon-deck:c1:fwd': { state: 'review', step: 2, ease: 2.5, interval: 1, due: beforeMidnight + DAY, reps: 0, lapses: 0 },
      },
      log: [
        { t: beforeMidnight - 60000, card: 'saigon-deck:c1:fwd', rating: 4, ms: 2000 },
      ],
    };

    // Trước nửa đêm (23:55): hạn mức 1 thẻ mới/ngày đã hết (đã học c1 lúc 23:54)
    const sessionBefore = planSession(deck, progress, beforeMidnight, {
      newCardsPerDay: 1,
      timeZone: 'Asia/Saigon',
    });
    assert.equal(sessionBefore.length, 0);

    // Sau nửa đêm Asia/Saigon (00:05): sang ngày mới 2026-11-03, hạn mức 1 thẻ mới/ngày được mở lại -> chọn c2
    const sessionAfter = planSession(deck, progress, afterMidnight, {
      newCardsPerDay: 1,
      timeZone: 'Asia/Saigon',
    });
    assert.deepEqual(sessionAfter.map(q => q.id), ['c2']);
  } finally {
    if (prevTZ === undefined) delete process.env.TZ;
    else process.env.TZ = prevTZ;
  }
});

test('planner: câu sai quay lại sau 3–7 câu khác trong cùng phiên', () => {
  for (const r of [0, 0.25, 0.5, 0.75, 0.999]) {
    const queue = Array.from({ length: 10 }, (_, i) => ({ id: `q-${i + 1}` }));
    const currentIndex = 0; // q-1 trả lời sai
    reinsertWrong(queue, currentIndex, { rand: () => r });

    // Tìm vị trí xuất hiện lại của q-1
    const retryIndex = queue.findIndex((item, idx) => idx > currentIndex && item.id === 'q-1');
    assert.ok(retryIndex !== -1, 'Câu sai phải được chèn lại vào hàng đợi');

    const intervening = retryIndex - currentIndex - 1;
    const distance = retryIndex - currentIndex;
    assert.ok(intervening >= 3 && intervening <= 7, `Số câu xen giữa (${intervening}) phải nằm trong 3..7`);
    assert.ok(distance >= 3 && distance <= 7, `Khoảng cách vị trí (${distance}) phải nằm trong 3..7`);
    assert.equal(queue[retryIndex].retry, true);
  }
});

test('planner: bỏ qua item đã xoá khỏi deck (giữ nguyên tiến độ) và bỏ qua item không hợp lệ', () => {
  const now = 1_700_000_000_000;
  const deck = {
    meta: { id: 'd-clean', title: 'Deck', kind: 'quiz' },
    items: [
      makeValidItem('valid-1'),
      // Item không hợp lệ: thiếu đáp án đúng (validateItem có error)
      { id: 'invalid-item', type: 'single', question: 'Câu lỗi', choices: ['A', 'B'], answer: [] },
      // Item không hợp lệ: câu hỏi rỗng
      { id: 'invalid-empty', type: 'fill', question: '   ', answer: ['ok'] },
    ],
  };

  const progress = {
    version: 1,
    cards: {
      // Thẻ của item đã bị xoá khỏi deck nhưng đang quá hạn
      'd-clean:deleted-item:fwd': { state: 'review', step: 0, ease: 2.5, interval: 2, due: now - DAY, reps: 3, lapses: 0 },
      // Thẻ của item lỗi
      'd-clean:invalid-item:fwd': { state: 'review', step: 0, ease: 2.5, interval: 2, due: now - DAY, reps: 1, lapses: 0 },
    },
    meta: {},
    log: [],
  };

  const counts = deckDueCounts(deck, progress, now);
  assert.equal(counts.total, 1);
  assert.equal(counts.dueToday, 0);
  assert.equal(counts.newToday, 1);

  const planned = planSession(deck, progress, now);
  assert.deepEqual(planned.map(q => q.id), ['valid-1']);

  // Tiến độ của item đã xoá vẫn còn nguyên trong progress.cards
  assert.ok(progress.cards['d-clean:deleted-item:fwd']);
  assert.equal(progress.cards['d-clean:deleted-item:fwd'].reps, 3);
});

