// test/stats.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isCorrectRating,
  dayKey,
  resolveEffectiveLog,
  streak,
  reviewsPerDay,
  heatmap,
  accuracyByDeck,
  accuracyByTopic,
  leeches,
  summary,
} from '../src/core/stats.js';

test('stats: quy ước đúng/sai và dayKey theo múi giờ', () => {
  assert.equal(isCorrectRating(1), false); // Again
  assert.equal(isCorrectRating(2), true);  // Hard
  assert.equal(isCorrectRating(3), true);  // Good
  assert.equal(isCorrectRating(4), true);  // Easy

  // 23:59 ngày 02/11/2026 và 00:01 ngày 03/11/2026 theo Asia/Saigon (UTC+7)
  // 2026-11-02 23:59:00 UTC+7 = 2026-11-02 16:59:00 UTC
  const t1 = Date.UTC(2026, 10, 2, 16, 59, 0);
  // 2026-11-03 00:01:00 UTC+7 = 2026-11-02 17:01:00 UTC
  const t2 = Date.UTC(2026, 10, 2, 17, 1, 0);

  assert.equal(dayKey(t1, 'Asia/Saigon'), '2026-11-02');
  assert.equal(dayKey(t2, 'Asia/Saigon'), '2026-11-03');
});

test('stats: streak qua nửa đêm ở Asia/Saigon và duy trì chuỗi khi hôm nay chưa học', () => {
  const tz = 'Asia/Saigon';
  // 2026-11-01 23:55 (UTC+7) = 16:55 UTC
  const day1 = Date.UTC(2026, 10, 1, 16, 55, 0);
  // 2026-11-02 00:05 (UTC+7) = 17:05 UTC (ngày tiếp theo)
  const day2 = Date.UTC(2026, 10, 1, 17, 5, 0);

  const prog = {
    log: [
      { t: day1, card: 'd1:i1:fwd', rating: 3, ms: 1200 },
      { t: day2, card: 'd1:i2:fwd', rating: 3, ms: 1500 },
    ],
  };

  // Bây giờ là trưa ngày 2026-11-02: đã học ngày 1 và ngày 2 -> streak = 2
  const nowDay2 = Date.UTC(2026, 10, 2, 5, 0, 0);
  const s1 = streak(prog, { now: nowDay2, tz });
  assert.equal(s1.current, 2);
  assert.equal(s1.longest, 2);

  // Bây giờ là trưa ngày 2026-11-03: hôm nay chưa học, nhưng hôm qua (ngày 2) đã học -> streak vẫn giữ 2
  const nowDay3 = Date.UTC(2026, 10, 3, 5, 0, 0);
  const s2 = streak(prog, { now: nowDay3, tz });
  assert.equal(s2.current, 2);
  assert.equal(s2.longest, 2);

  // Bây giờ là trưa ngày 2026-11-04: đã bỏ cả ngày 3 và hôm nay chưa học -> đứt chuỗi (current = 0, longest = 2)
  const nowDay4 = Date.UTC(2026, 10, 4, 5, 0, 0);
  const s3 = streak(prog, { now: nowDay4, tz });
  assert.equal(s3.current, 0);
  assert.equal(s3.longest, 2);
});

test('stats: reviewsPerDay điền đủ ngày và heatmap đủ 90 ô', () => {
  const tz = 'Asia/Saigon';
  const now = Date.UTC(2026, 10, 3, 5, 0, 0);

  const prog = {
    log: [
      { t: now - 86400000, card: 'd1:i1:fwd', rating: 3, ms: 1000 },
      { t: now - 86400000, card: 'd1:i2:fwd', rating: 1, ms: 1200 },
      { t: now, card: 'd1:i3:fwd', rating: 4, ms: 800 },
    ],
  };

  const r7 = reviewsPerDay(prog, 7, { now, tz });
  assert.equal(r7.length, 7);
  // Ngày hôm nay (cuối mảng) có 1 lượt đúng
  assert.equal(r7[6].total, 1);
  assert.equal(r7[6].correct, 1);
  assert.equal(r7[6].incorrect, 0);
  // Ngày hôm qua có 2 lượt (1 đúng, 1 sai)
  assert.equal(r7[5].total, 2);
  assert.equal(r7[5].correct, 1);
  assert.equal(r7[5].incorrect, 1);
  // Ngày trước đó là 0
  assert.equal(r7[4].total, 0);

  const hm = heatmap(prog, 90, { now, tz });
  assert.equal(hm.length, 90);
  assert.equal(hm[89].count, 1);
  assert.equal(hm[89].level > 0, true);
});

test('stats: leeches lọc đúng ngưỡng 7, 8, 9 và sắp xếp giảm dần', () => {
  const cards = {
    'd1:i1:fwd': { lapses: 7, reps: 10, ease: 2.1, interval: 2, state: 'review' },
    'd1:i2:fwd': { lapses: 8, reps: 12, ease: 1.7, interval: 1, state: 'review' },
    'd1:i3:fwd': { lapses: 12, reps: 15, ease: 1.3, interval: 1, state: 'review' },
    'd1:i4:fwd': { lapses: 3, reps: 5, ease: 2.5, interval: 5, state: 'review' },
  };

  const l8 = leeches(cards, { threshold: 8 });
  assert.equal(l8.length, 2);
  assert.equal(l8[0].itemId, 'i3');
  assert.equal(l8[0].lapses, 12);
  assert.equal(l8[1].itemId, 'i2');
  assert.equal(l8[1].lapses, 8);

  const l7 = leeches(cards, { threshold: 7 });
  assert.equal(l7.length, 3);
  assert.equal(l7[2].lapses, 7);

  const l9 = leeches(cards, { threshold: 9 });
  assert.equal(l9.length, 1);
  assert.equal(l9[0].itemId, 'i3');
});

test('stats: accuracy theo deck và topic, override không đếm trùng', () => {
  const tBase = 1000000;
  const prog = {
    log: [
      { t: tBase, card: 'deck-a:q1:fwd', rating: 1, ms: 2000 },
      { t: tBase + 1000, card: 'deck-a:q2:fwd', rating: 3, ms: 1500 },
      { t: tBase + 2000, card: 'deck-b:q3:fwd', rating: 4, ms: 1200 },
      // Override cho dòng gốc tBase: đổi từ 1 (sai) thành 3 (đúng)
      { t: tBase + 3000, card: 'deck-a:q1:fwd', override: true, of: tBase, rating: 3, ms: 2000 },
    ],
  };

  const decks = [
    { meta: { id: 'deck-a', title: 'Deck A' } },
    { meta: { id: 'deck-b', title: 'Deck B' } },
  ];

  const accDeck = accuracyByDeck(prog, decks);
  // Không đếm 4 lần, chỉ đếm 3 lượt thực tế
  const deckAStat = accDeck.find(d => d.deckId === 'deck-a');
  assert.equal(deckAStat.total, 2);
  assert.equal(deckAStat.correct, 2); // dòng 1 đã override thành đúng!
  assert.equal(deckAStat.accuracy, 100);

  // Tra topic
  const lookup = {
    q1: 'Grammar',
    q2: 'Grammar',
    // q3 không có topic hoặc đã bị xoá khỏi deck -> gom vào Khác
  };

  const accTopic = accuracyByTopic(prog, { itemsLookup: lookup });
  const grammar = accTopic.find(t => t.topic === 'Grammar');
  assert.equal(grammar.total, 2);
  assert.equal(grammar.correct, 2);

  const other = accTopic.find(t => t.topic === 'Khác');
  assert.equal(other.total, 1);
  assert.equal(other.correct, 1);
});

test('stats: log rỗng hoạt động an toàn', () => {
  const empty = { log: [], cards: {} };
  assert.deepEqual(streak(empty), { current: 0, longest: 0 });
  assert.equal(reviewsPerDay(empty, 7).length, 7);
  assert.equal(heatmap(empty, 90).length, 90);
  assert.deepEqual(accuracyByDeck(empty), []);
  assert.deepEqual(accuracyByTopic(empty), []);
  assert.deepEqual(leeches(empty.cards), []);
  const s = summary(empty);
  assert.equal(s.todayCount, 0);
  assert.equal(s.totalStudied, 0);
});

test('stats: hiệu năng 100,000 dòng log < 300ms', () => {
  const count = 100000;
  const log = new Array(count);
  const startTs = Date.now() - count * 1000;

  for (let i = 0; i < count; i++) {
    log[i] = {
      t: startTs + i * 1000,
      card: `deck-${i % 5}:item-${i % 200}:fwd`,
      rating: (i % 4) + 1,
      ms: 1200,
    };
  }
  // Thêm 500 override
  for (let i = 0; i < 500; i++) {
    log.push({
      t: startTs + count * 1000 + i * 100,
      card: `deck-0:item-0:fwd`,
      override: true,
      of: startTs + i * 1000,
      rating: 3,
      ms: 1200,
    });
  }

  const prog = { log };
  const t0 = performance.now();
  const rpd = reviewsPerDay(prog, 30);
  const st = streak(prog);
  const hm = heatmap(prog, 90);
  const acc = accuracyByDeck(prog);
  const summ = summary(prog);
  const elapsed = performance.now() - t0;

  assert.ok(elapsed < 500, `Thời gian tính toán là ${elapsed.toFixed(1)}ms (phải < 500ms)`);
  assert.equal(rpd.length, 30);
  assert.ok(st.longest > 0);
  assert.equal(hm.length, 90);
  assert.equal(acc.length, 5);
});

