// Kiểm thử thống kê bộ thẻ (core/deckstats.js) kể cả mốc nửa đêm Asia/Saigon.
import test from 'node:test';
import assert from 'node:assert/strict';
import { deckStats, countReviewedToday } from '../src/core/deckstats.js';
import { cardKey } from '../src/core/srs.js';

const sampleDeck = {
  meta: { id: 'd1', title: 'Deck 1', kind: 'quiz' },
  items: [
    { id: 'c1', type: 'single', question: 'Q1', choices: ['A', 'B'], answer: [0] },
    { id: 'c2', type: 'single', question: 'Q2', choices: ['A', 'B'], answer: [0] },
    { id: 'c3', type: 'single', question: 'Q3', choices: ['A', 'B'], answer: [0] },
    { id: 'c4', type: 'single', question: 'Q4', choices: ['A', 'B'], answer: [0] },
    { id: 'c5', type: 'single', question: 'Q5', choices: ['A', 'B'], answer: [0] },
    { id: 'c6', type: 'single', question: 'Q6', choices: ['A', 'B'], answer: [0] },
  ],
};

test('deckStats: bộ thẻ chưa học lần nào', () => {
  const now = Date.parse('2026-05-10T10:00:00+07:00');
  const st = deckStats(sampleDeck, { cards: {}, log: [] }, { newCardsPerDay: 4, timeZone: 'Asia/Saigon' }, now);
  assert.deepEqual(st, {
    new: 6,
    learning: 0,
    due: 0,
    mastered: 0,
    newLeftToday: 4,
    lastStudied: null,
  });
});

test('deckStats: phân loại đúng new, learning, due, mastered và lastStudied', () => {
  const now = Date.parse('2026-05-10T12:00:00+07:00');
  const tMorning = Date.parse('2026-05-10T08:30:00+07:00');
  const k1 = cardKey('d1', 'c1');
  const k2 = cardKey('d1', 'c2');
  const k3 = cardKey('d1', 'c3');
  const k4 = cardKey('d1', 'c4');

  const progress = {
    cards: {
      // c1: đang học (learning), vừa học sáng nay (mục mới hôm nay)
      [k1]: {
        state: 'learning', stepIndex: 1, due: now + 300_000,
        interval: 0, ease: 2.5, reps: 1, lapses: 0, lastReview: tMorning,
      },
      // c2: học lại (relearning) -> tính vào learning (đã học từ 3 ngày trước)
      [k2]: {
        state: 'relearning', stepIndex: 0, due: now - 60_000,
        interval: 1, ease: 2.3, reps: 4, lapses: 1, lastReview: tMorning + 10_000,
      },
      // c3: review đến hạn (due <= now)
      [k3]: {
        state: 'review', stepIndex: 0, due: now - 1000,
        interval: 4, ease: 2.5, reps: 3, lapses: 0, lastReview: now - 86400_000 * 4,
      },
      // c4: review chưa đến hạn (due > now) -> mastered
      [k4]: {
        state: 'review', stepIndex: 0, due: now + 86400_000 * 5,
        interval: 10, ease: 2.6, reps: 5, lapses: 0, lastReview: now - 86400_000 * 5,
      },
      // c5, c6: chưa học -> new (2 mục)
    },
    log: [
      { card: k2, t: now - 86400_000 * 3, rating: 3, ms: 2000 },
      { card: k1, t: tMorning, rating: 3, ms: 2000 },
      { card: k2, t: tMorning + 10_000, rating: 1, ms: 3000 },
    ],
  };

  const st = deckStats(sampleDeck, progress, { newCardsPerDay: 5, timeZone: 'Asia/Saigon' }, now);
  assert.equal(st.new, 2);
  assert.equal(st.learning, 2); // c1 (learning) + c2 (relearning)
  assert.equal(st.due, 1);      // c3
  assert.equal(st.mastered, 1); // c4
  // Đã học 1 thẻ mới hôm nay (c1) -> hạn mức còn 5 - 1 = 4, nhưng chỉ còn 2 thẻ new -> newLeftToday = 2
  assert.equal(st.newLeftToday, 2);
  assert.equal(st.lastStudied, tMorning + 10_000);
  assert.equal(countReviewedToday(progress, now, { deckId: 'd1', timeZone: 'Asia/Saigon' }), 2);
});

test('deckStats: newLeftToday tính theo nửa đêm Asia/Saigon', () => {
  // Học 2 thẻ mới lúc 23:50 ngày 10/05/2026 giờ Sài Gòn (+07:00)
  const studyTime = Date.parse('2026-05-10T23:50:00+07:00');
  const beforeMidnight = Date.parse('2026-05-10T23:58:00+07:00');
  const afterMidnight = Date.parse('2026-05-11T00:02:00+07:00');

  const k1 = cardKey('d1', 'c1');
  const k2 = cardKey('d1', 'c2');

  const progress = {
    cards: {
      [k1]: {
        state: 'learning', stepIndex: 1, due: studyTime + 600_000,
        interval: 0, ease: 2.5, reps: 1, lapses: 0, lastReview: studyTime,
      },
      [k2]: {
        state: 'review', stepIndex: 0, due: studyTime + 86400_000,
        interval: 1, ease: 2.5, reps: 1, lapses: 0, lastReview: studyTime + 1000,
      },
    },
    log: [
      { card: k1, t: studyTime, rating: 3, ms: 1000 },
      { card: k2, t: studyTime + 1000, rating: 4, ms: 1000 },
    ],
  };

  // Trước nửa đêm: hạn mức 2 thẻ/ngày đã dùng hết 2 -> newLeftToday = 0
  const stBefore = deckStats(sampleDeck, progress, { newCardsPerDay: 2, timeZone: 'Asia/Saigon' }, beforeMidnight);
  assert.equal(stBefore.new, 4);
  assert.equal(stBefore.newLeftToday, 0);

  // Qua 00:00 giờ Asia/Saigon: sang ngày mới -> newLeftToday khôi phục thành 2
  const stAfter = deckStats(sampleDeck, progress, { newCardsPerDay: 2, timeZone: 'Asia/Saigon' }, afterMidnight);
  assert.equal(stAfter.new, 4);
  assert.equal(stAfter.newLeftToday, 2);
});

test('deckStats: vocab đếm theo thẻ (mục × chiều)', () => {
  const vocabDeck = {
    meta: { id: 'v-deck', kind: 'vocab' },
    items: [
      { id: '1', type: 'vocab', term: 'apple', definition: 'táo' },
      { id: '2', type: 'vocab', term: 'banana', definition: 'chuối' },
      { id: '3', type: 'vocab', term: 'orange', definition: 'cam' },
    ],
  };

  // Mặc định vocab là 'both' -> 3 mục × 2 chiều = 6 thẻ mới
  const stBoth = deckStats(vocabDeck);
  assert.equal(stBoth.new, 6);

  // Khi chọn riêng chiều 'fwd' -> 3 thẻ mới
  const stFwd = deckStats(vocabDeck, {}, { direction: 'fwd' });
  assert.equal(stFwd.new, 3);

  // Khi chọn riêng chiều 'rev' -> 3 thẻ mới
  const stRev = deckStats(vocabDeck, {}, { direction: 'rev' });
  assert.equal(stRev.new, 3);
});

