import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DAY,
  MINUTE,
  newCard,
  schedule,
  isDue,
  cardKey,
  setLearnSteps,
  getLearnSteps,
  recordReview,
  ratingFromGrade,
} from '../src/core/srs.js';

const NOW = 1_700_000_000_000;

test('srs: new → learning → review (theo learning steps)', () => {
  setLearnSteps([1, 10]);
  let c = newCard();
  assert.equal(c.state, 'new');
  assert.equal(isDue(c, NOW), false);

  // Bước 1: Good (3) từ new (step 0 -> step 1, due sau 10 phút)
  c = schedule(c, 3, NOW);
  assert.equal(c.state, 'learning');
  assert.equal(c.step, 1);
  assert.equal(c.due, NOW + 10 * MINUTE);
  assert.equal(isDue(c, NOW + 5 * MINUTE), false);
  assert.equal(isDue(c, NOW + 10 * MINUTE), true);

  // Bước 2: Good (3) từ step 1 -> tốt nghiệp sang review, interval = 1 ngày
  const t2 = NOW + 10 * MINUTE;
  c = schedule(c, 3, t2);
  assert.equal(c.state, 'review');
  assert.equal(c.interval, 1);
  assert.equal(c.due, t2 + 1 * DAY);

  // Kiểm tra custom learning steps từ settings (không hard-code)
  let cCustom = newCard();
  cCustom = schedule(cCustom, 1, NOW, { learnSteps: [5, 15, 30] });
  assert.equal(cCustom.state, 'learning');
  assert.equal(cCustom.step, 0);
  assert.equal(cCustom.due, NOW + 5 * MINUTE);

  cCustom = schedule(cCustom, 3, NOW, { learnSteps: [5, 15, 30] });
  assert.equal(cCustom.state, 'learning');
  assert.equal(cCustom.step, 1);
  assert.equal(cCustom.due, NOW + 15 * MINUTE);

  cCustom = schedule(cCustom, 3, NOW, { learnSteps: [5, 15, 30] });
  assert.equal(cCustom.state, 'learning');
  assert.equal(cCustom.step, 2);
  assert.equal(cCustom.due, NOW + 30 * MINUTE);

  cCustom = schedule(cCustom, 3, NOW, { learnSteps: [5, 15, 30] });
  assert.equal(cCustom.state, 'review');
  assert.equal(cCustom.interval, 1);
});

test('srs: Again giảm ease, tăng lapses và đưa thẻ review về relearning', () => {
  const reviewCard = {
    state: 'review',
    step: 0,
    ease: 2.5,
    interval: 10,
    due: NOW,
    reps: 3,
    lapses: 0,
  };

  const lapsed = schedule(reviewCard, 1, NOW, { learnSteps: [1, 10] });
  assert.equal(lapsed.state, 'relearning');
  assert.equal(lapsed.step, 0);
  assert.equal(lapsed.lapses, 1);
  assert.ok(Math.abs(lapsed.ease - 2.3) < 1e-9);
  assert.equal(lapsed.interval, 5); // 10 * 0.5 = 5
  assert.equal(lapsed.due, NOW + 1 * MINUTE);
});

test('srs: relearning tốt nghiệp giữ interval đã giảm lúc lapse (tối thiểu 1 ngày)', () => {
  // Thẻ đang có interval 20 ngày, trả lời sai (Again) -> giảm còn 10 ngày, vào relearning
  let c = {
    state: 'review',
    step: 0,
    ease: 2.5,
    interval: 20,
    due: NOW,
    reps: 4,
    lapses: 0,
  };

  c = schedule(c, 1, NOW, { learnSteps: [1, 10] });
  assert.equal(c.state, 'relearning');
  assert.equal(c.interval, 10);

  // Qua bước relearning 1 (step 0 -> step 1)
  c = schedule(c, 3, NOW + 1 * MINUTE, { learnSteps: [1, 10] });
  assert.equal(c.state, 'relearning');
  assert.equal(c.step, 1);
  assert.equal(c.interval, 10);

  // Tốt nghiệp relearning (step 1 -> review): PHẢI giữ interval = 10, không bị reset về 1
  const gradTime = NOW + 11 * MINUTE;
  c = schedule(c, 3, gradTime, { learnSteps: [1, 10] });
  assert.equal(c.state, 'review');
  assert.equal(c.interval, 10);
  assert.equal(c.due, gradTime + 10 * DAY);

  // Trường hợp interval trước khi lapse là 1 -> giảm vẫn tối thiểu 1 ngày
  let cSmall = {
    state: 'review',
    step: 0,
    ease: 2.5,
    interval: 1,
    due: NOW,
    reps: 1,
    lapses: 0,
  };
  cSmall = schedule(cSmall, 1, NOW, { learnSteps: [1] });
  assert.equal(cSmall.state, 'relearning');
  assert.equal(cSmall.interval, 1);
  cSmall = schedule(cSmall, 3, NOW + MINUTE, { learnSteps: [1] });
  assert.equal(cSmall.state, 'review');
  assert.equal(cSmall.interval, 1);
});

test('srs: Easy tăng interval và tăng ease; ease không bao giờ dưới 1.3', () => {
  // Easy từ new -> tốt nghiệp ngay với interval = 4 ngày
  const fromNew = schedule(newCard(), 4, NOW);
  assert.equal(fromNew.state, 'review');
  assert.equal(fromNew.interval, 4);
  assert.equal(fromNew.due, NOW + 4 * DAY);

  // Easy khi đang ở review -> tăng interval theo ease * 1.3 và cộng 0.15 vào ease
  const rev = { state: 'review', step: 0, ease: 2.5, interval: 10, due: NOW, reps: 2, lapses: 0 };
  const afterEasy = schedule(rev, 4, NOW);
  assert.equal(afterEasy.state, 'review');
  assert.ok(afterEasy.interval > Math.round(10 * 2.5)); // 10 * 2.5 * 1.3 = 33 > 25
  assert.equal(afterEasy.interval, 33);
  assert.ok(Math.abs(afterEasy.ease - 2.65) < 1e-9);
  assert.equal(afterEasy.reps, 3);

  // Ease không giảm xuống dưới 1.3 dù bấm Again hoặc Hard liên tiếp nhiều lần
  let c = { state: 'review', step: 0, ease: 1.4, interval: 10, due: NOW, reps: 5, lapses: 0 };
  for (let i = 0; i < 10; i++) {
    c.state = 'review';
    c = schedule(c, 1, NOW); // Again trừ 0.2
    assert.ok(c.ease >= 1.3, `ease (${c.ease}) không được nhỏ hơn 1.3`);
  }
  assert.equal(c.ease, 1.3);

  for (let i = 0; i < 10; i++) {
    c.state = 'review';
    c = schedule(c, 2, NOW); // Hard trừ 0.15
    assert.ok(c.ease >= 1.3, `ease (${c.ease}) không được nhỏ hơn 1.3`);
  }
  assert.equal(c.ease, 1.3);
});

test('srs: cardKey, ratingFromGrade và recordReview (kể cả Học thử persist:false)', () => {
  assert.equal(cardKey('lpic-101', 'q-01'), 'lpic-101:q-01:fwd');
  assert.equal(cardKey('vocab-01', 'w-01', 'vi-en'), 'vocab-01:w-01:vi-en');

  // Đúng / gần đúng -> Good (3), sai -> Again (1)
  assert.equal(ratingFromGrade({ ok: true, near: false }), 3);
  assert.equal(ratingFromGrade({ ok: true, near: true }), 3);
  assert.equal(ratingFromGrade({ ok: false, near: false }), 1);
  assert.equal(ratingFromGrade({ ok: true, near: false }, 4), 4);

  const initialProgress = { version: 1, cards: {}, meta: {}, log: [] };

  // Học thử (persist: false) KHÔNG tạo thêm mục nào trong cards hay log
  const trialRes = recordReview(initialProgress, {
    deckId: 'lpic-101',
    itemId: 'q-01',
    rating: 3,
    ms: 2500,
    now: NOW,
    persist: false,
  });
  assert.equal(trialRes.persisted, false);
  assert.deepEqual(trialRes.progress.cards, {});
  assert.deepEqual(trialRes.progress.log, []);

  // Học thật (persist: true) cập nhật cards và thêm 1 dòng vào log {t, card, rating, ms}
  const realRes = recordReview(initialProgress, {
    deckId: 'lpic-101',
    itemId: 'q-01',
    rating: 3,
    ms: 3200,
    now: NOW,
    persist: true,
  });
  assert.equal(realRes.persisted, true);
  assert.ok(realRes.progress.cards['lpic-101:q-01:fwd']);
  assert.equal(realRes.progress.cards['lpic-101:q-01:fwd'].state, 'learning');
  assert.equal(realRes.progress.log.length, 1);
  assert.deepEqual(realRes.progress.log[0], {
    t: NOW,
    card: 'lpic-101:q-01:fwd',
    rating: 3,
    ms: 3200,
  });
});

test('srs: clearProgress đặt lại toàn bộ hoặc theo bộ thẻ cụ thể', async () => {
  const { clearProgress } = await import('../src/core/srs.js');
  const sampleProgress = {
    version: 1,
    cards: {
      'deck-a:i1:fwd': { state: 'review', interval: 5 },
      'deck-a:i2:fwd': { state: 'learning', interval: 1 },
      'deck-b:i1:fwd': { state: 'review', interval: 10 },
    },
    meta: {
      'deck-a': { lastStudied: 1000 },
      'deck-b': { lastStudied: 2000 },
    },
    log: [
      { t: 1000, card: 'deck-a:i1:fwd', rating: 3 },
      { t: 2000, card: 'deck-b:i1:fwd', rating: 4 },
      { t: 3000, card: 'deck-a:i2:fwd', rating: 1 },
    ],
  };

  // Xoá riêng deck-a
  const clearedA = clearProgress(sampleProgress, 'deck-a');
  assert.equal(Object.keys(clearedA.cards).length, 1);
  assert.ok(clearedA.cards['deck-b:i1:fwd']);
  assert.equal(clearedA.meta['deck-a'], undefined);
  assert.ok(clearedA.meta['deck-b']);
  assert.equal(clearedA.log.length, 1);
  assert.equal(clearedA.log[0].card, 'deck-b:i1:fwd');

  // Xoá tất cả ('all' hoặc null)
  const clearedAll = clearProgress(sampleProgress, 'all');
  assert.deepEqual(clearedAll.cards, {});
  assert.deepEqual(clearedAll.meta, {});
  assert.deepEqual(clearedAll.log, []);

  const clearedNull = clearProgress(sampleProgress, null);
  assert.deepEqual(clearedNull.cards, {});
  assert.deepEqual(clearedNull.meta, {});
  assert.deepEqual(clearedNull.log, []);
});


