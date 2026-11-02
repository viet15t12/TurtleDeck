// test/progressio.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  exportProgress,
  validateProgress,
  mergeProgress,
  backupFileName,
  pickBackupsToDelete,
  applyCardOverride,
} from '../src/core/progressio.js';
import { RATING, newCard } from '../src/core/srs.js';

test('progressio: exportProgress và validateProgress các trường hợp hợp lệ / lỗi', () => {
  const sampleProg = {
    version: 1,
    cards: {
      'deck1:item1:fwd': { state: 'review', reps: 3, lapses: 0, ease: 2.5, interval: 6, due: 123456789 },
    },
    meta: {
      'deck1:item1': { starred: true, note: 'Ghi chú mẫu' },
    },
    log: [
      { t: 1000000, card: 'deck1:item1:fwd', rating: 3, ms: 1200 },
    ],
  };

  const exported = exportProgress(sampleProg);
  assert.equal(exported.app, 'study-app');
  assert.equal(exported.formatVersion, 1);

  // Validate bản export
  const validRes = validateProgress(exported);
  assert.equal(validRes.ok, true);
  assert.equal(Object.keys(validRes.progress.cards).length, 1);
  assert.equal(validRes.progress.meta['deck1:item1'].starred, true);

  // Ca hỏng: không phải object
  assert.equal(validateProgress(null).ok, false);
  assert.equal(validateProgress('invalid').ok, false);
  assert.equal(validateProgress([]).ok, false);

  // Ca hỏng: formatVersion tương lai
  assert.equal(validateProgress({ formatVersion: 99, progress: sampleProg }).ok, false);

  // Ca hỏng: cards sai kiểu
  assert.equal(validateProgress({ progress: { cards: 'not-an-object' } }).ok, false);

  // Ca hỏng: card ease ngoài biên
  assert.equal(validateProgress({
    progress: {
      cards: { 'd:i:fwd': { ease: 0.5 } },
    },
  }).ok, false);

  // Ca hỏng: log sai kiểu
  assert.equal(validateProgress({ progress: { log: 'not-an-array' } }).ok, false);

  // Ca hỏng: dòng log thiếu trường
  assert.equal(validateProgress({
    progress: {
      log: [{ t: -1, card: '' }],
    },
  }).ok, false);

  // Ca hỏng: note quá dài
  assert.equal(validateProgress({
    progress: {
      meta: { 'd:i': { note: 'a'.repeat(2500) } },
    },
  }).ok, false);
});

test('progressio: mergeProgress gộp thẻ (ưu tiên reps cao hơn), meta (OR sao, giữ note local), log khử trùng', () => {
  const local = {
    cards: {
      // local có reps = 5 > imported reps = 3 -> giữ local
      'd1:q1:fwd': { state: 'review', reps: 5, lapses: 0, ease: 2.5, interval: 10, due: 2000 },
      // local có reps = 2 < imported reps = 4 -> lấy imported
      'd1:q2:fwd': { state: 'learning', reps: 2, lapses: 1, ease: 2.3, interval: 1, due: 2500 },
      // local có reps = 3 == imported reps = 3 -> hoà thì lấy imported
      'd1:q3:fwd': { state: 'review', reps: 3, lapses: 0, ease: 2.4, interval: 6, due: 3000, tag: 'local' },
    },
    meta: {
      'd1:q1': { starred: false, note: 'Ghi chú cục bộ của q1' },
      'd1:q2': { starred: true, note: '' },
    },
    log: [
      { t: 1000, card: 'd1:q1:fwd', rating: 3, ms: 1000 },
      { t: 2000, card: 'd1:q2:fwd', rating: 1, ms: 2000 },
    ],
  };

  const imported = {
    cards: {
      'd1:q1:fwd': { state: 'review', reps: 3, lapses: 1, ease: 2.1, interval: 4, due: 2100 },
      'd1:q2:fwd': { state: 'review', reps: 4, lapses: 0, ease: 2.6, interval: 8, due: 2600 },
      'd1:q3:fwd': { state: 'review', reps: 3, lapses: 0, ease: 2.5, interval: 7, due: 3100, tag: 'imported' },
      'd1:q4:fwd': { state: 'new', reps: 0, lapses: 0, ease: 2.5, interval: 0, due: 0 },
    },
    meta: {
      'd1:q1': { starred: true, note: 'Ghi chú nhập của q1' },
      'd1:q2': { starred: false, note: 'Ghi chú nhập của q2' },
      'd1:q4': { starred: true, note: 'Ghi chú mới của q4' },
    },
    log: [
      // trùng dòng 1000
      { t: 1000, card: 'd1:q1:fwd', rating: 3, ms: 1000 },
      // dòng mới
      { t: 1500, card: 'd1:q4:fwd', rating: 4, ms: 800 },
    ],
  };

  const merged = mergeProgress(local, imported);

  // Cards
  assert.equal(merged.cards['d1:q1:fwd'].reps, 5); // giữ local
  assert.equal(merged.cards['d1:q2:fwd'].reps, 4); // lấy imported
  assert.equal(merged.cards['d1:q3:fwd'].tag, 'imported'); // hoà lấy imported
  assert.equal(merged.cards['d1:q4:fwd'].state, 'new'); // mới từ imported

  // Meta
  // q1: local starred=false, imp starred=true -> merged true. note local có -> giữ note local
  assert.equal(merged.meta['d1:q1'].starred, true);
  assert.equal(merged.meta['d1:q1'].note, 'Ghi chú cục bộ của q1');

  // q2: local starred=true, imp starred=false -> merged true. local note rỗng -> lấy imp note
  assert.equal(merged.meta['d1:q2'].starred, true);
  assert.equal(merged.meta['d1:q2'].note, 'Ghi chú nhập của q2');

  // q4:
  assert.equal(merged.meta['d1:q4'].starred, true);
  assert.equal(merged.meta['d1:q4'].note, 'Ghi chú mới của q4');

  // Log: 1000, 1500, 2000
  assert.equal(merged.log.length, 3);
  assert.equal(merged.log[0].t, 1000);
  assert.equal(merged.log[1].t, 1500);
  assert.equal(merged.log[2].t, 2000);
});

test('progressio: pickBackupsToDelete chỉ giữ 7 bản mới nhất và lọc đúng mẫu tên file', () => {
  const files = [
    'progress-2026-10-25.json',
    'progress-2026-10-26.json',
    'progress-2026-10-27.json',
    'progress-2026-10-28.json',
    'progress-2026-10-29.json',
    'progress-2026-10-30.json',
    'progress-2026-10-31.json',
    'progress-2026-11-01.json',
    'progress-2026-11-02.json',
    'other-file.json',
    'progress-manual.json',
  ];

  const toDel = pickBackupsToDelete(files, 7);
  // Có 9 file backup đúng chuẩn ngày, giữ 7 file mới nhất (từ 10-27 đến 11-02) -> xoá 2 file cũ nhất: 10-25 và 10-26
  assert.equal(toDel.length, 2);
  assert.ok(toDel.includes('progress-2026-10-25.json'));
  assert.ok(toDel.includes('progress-2026-10-26.json'));
  assert.ok(!toDel.includes('other-file.json'));

  // backupFileName theo múi giờ
  const t = Date.UTC(2026, 10, 2, 17, 30, 0); // 00:30 ngày 03/11 ở Asia/Saigon
  assert.equal(backupFileName(t, 'Asia/Saigon'), 'progress-2026-11-03.json');
});

test('progressio: applyCardOverride đưa thẻ về đúng trạng thái như khi trả lời đúng', () => {
  const prevState = {
    state: 'learning',
    step: 0,
    ease: 2.5,
    interval: 0,
    due: 1000,
    reps: 0,
    lapses: 0,
  };

  const origLog = {
    t: 10000,
    card: 'deck-1:card-1:fwd',
    rating: RATING.AGAIN,
    ms: 2500,
  };

  const now = 15000;
  const { nextCard, overrideLogEntry } = applyCardOverride(prevState, origLog, now, { learnSteps: [1, 10] });

  // Từ step 0 lên step 1 (Good)
  assert.equal(nextCard.step, 1);
  assert.equal(nextCard.state, 'learning');
  assert.equal(overrideLogEntry.override, true);
  assert.equal(overrideLogEntry.of, 10000);
  assert.equal(overrideLogEntry.rating, RATING.GOOD);
});

