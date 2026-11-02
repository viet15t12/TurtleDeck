// test/simulate.js — Mô phỏng 60 ngày học SRS với tỉ lệ đúng 85%, in số thẻ due mỗi ngày.
// Chạy độc lập bằng `node test/simulate.js` hoặc qua `node --test`.
const test = require('node:test');
const assert = require('node:assert/strict');

// PRNG tất định (Mulberry32) để kết quả mô phỏng ổn định, tái lập được
function makeRng(seed = 42) {
  let s = seed >>> 0;
  return function rand() {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

async function runSimulation({
  days = 60,
  totalCards = 200,
  newPerDay = 10,
  accuracy = 0.85,
  verbose = true,
} = {}) {
  const { DAY, MINUTE, newCard, schedule } = await import('../src/core/srs.js');
  const rand = makeRng(20261102);

  const cards = Array.from({ length: totalCards }, (_, i) => ({
    id: `card-${i + 1}`,
    ...newCard(),
  }));

  const startEpoch = Date.parse('2026-01-01T09:00:00+07:00');
  const stats = [];

  if (verbose) {
    console.log(`=== Mô phỏng SRS ${days} ngày (tổng ${totalCards} thẻ, ${newPerDay} thẻ mới/ngày, tỉ lệ đúng ${Math.round(accuracy * 100)}%) ===`);
  }

  for (let dayIdx = 0; dayIdx < days; dayIdx++) {
    const dayNow = startEpoch + dayIdx * DAY;

    // 1. Thẻ đến hạn hôm nay (due review + learning/relearning)
    const dueCards = cards.filter(c => c.state !== 'new' && c.due <= dayNow);
    const dueCount = dueCards.length;

    // 2. Lấy tối đa newPerDay thẻ mới
    const newCardsToday = cards.filter(c => c.state === 'new').slice(0, newPerDay);
    const newCount = newCardsToday.length;

    // 3. Ôn các thẻ due trong ngày
    for (const c of dueCards) {
      const isCorrect = rand() < accuracy;
      const rating = isCorrect ? (rand() < 0.15 ? 4 : 3) : 1;
      let updated = schedule(c, rating, dayNow);

      // Nếu rơi vào learning/relearning trong phiên, hoàn thành các bước ngắn trong cùng phiên hôm đó
      let stepTime = dayNow + 5 * MINUTE;
      while (updated.state === 'learning' || updated.state === 'relearning') {
        const stepOk = rand() < accuracy;
        updated = schedule(updated, stepOk ? 3 : 1, stepTime);
        stepTime += 10 * MINUTE;
      }
      Object.assign(c, updated);
    }

    // 4. Học các thẻ mới trong ngày (đi qua learning steps trong phiên)
    for (const c of newCardsToday) {
      let stepTime = dayNow;
      let updated = c;
      while (updated.state !== 'review') {
        const stepOk = rand() < accuracy;
        updated = schedule(updated, stepOk ? 3 : 1, stepTime);
        stepTime += 10 * MINUTE;
      }
      Object.assign(c, updated);
    }

    const activeReviews = cards.filter(c => c.state === 'review');
    const avgInterval = activeReviews.length
      ? activeReviews.reduce((sum, c) => sum + c.interval, 0) / activeReviews.length
      : 0;

    const row = {
      day: dayIdx + 1,
      due: dueCount,
      newStudied: newCount,
      activeCards: activeReviews.length,
      avgInterval: Number(avgInterval.toFixed(1)),
    };
    stats.push(row);

    if (verbose) {
      console.log(
        `Ngày ${String(row.day).padStart(2, '0')}: due = ${String(row.due).padStart(3, ' ')} | ` +
        `mới = ${String(row.newStudied).padStart(2, ' ')} | ` +
        `đã học = ${String(row.activeCards).padStart(3, ' ')} | ` +
        `interval TB = ${row.avgInterval.toFixed(1)} ngày`
      );
    }
  }

  return stats;
}

test('simulate.js: mô phỏng 60 ngày với tỉ lệ đúng 85% — interval tăng hợp lý, không nổ số thẻ due', async () => {
  const stats = await runSimulation({ days: 60, totalCards: 200, newPerDay: 10, accuracy: 0.85, verbose: true });
  assert.equal(stats.length, 60);

  // Interval trung bình ở ngày 60 phải tăng đáng kể so với tuần đầu tiên
  const day7Avg = stats[6].avgInterval;
  const day30Avg = stats[29].avgInterval;
  const day60Avg = stats[59].avgInterval;
  assert.ok(day30Avg > day7Avg, `Interval TB ngày 30 (${day30Avg}) phải lớn hơn ngày 7 (${day7Avg})`);
  assert.ok(day60Avg > day30Avg, `Interval TB ngày 60 (${day60Avg}) phải lớn hơn ngày 30 (${day30Avg})`);
  assert.ok(day60Avg >= 15, `Interval TB ngày 60 (${day60Avg}) phải tăng hợp lý (>= 15 ngày)`);

  // Số thẻ due mỗi ngày không bị "nổ" (luôn trong ngưỡng hợp lý, không vượt quá 60 thẻ/ngày với bộ 200 thẻ)
  const maxDue = Math.max(...stats.map(s => s.due));
  assert.ok(maxDue <= 60, `Số thẻ due cao nhất trong ngày (${maxDue}) không được nổ vượt ngưỡng 60`);
});

