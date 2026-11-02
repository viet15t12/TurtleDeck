import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  atomicWrite,
  backupFile,
  loadProgressFile,
  saveProgressFile,
  loadSettingsFile,
  saveSettingsFile,
} from '../src/core/fsutil.js';
import { recordReview } from '../src/core/srs.js';

async function withTmp(fn) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'fsutil-'));
  try { await fn(dir); } finally { await fs.rm(dir, { recursive: true, force: true }); }
}

test('atomicWrite ghi đúng nội dung, không để lại .tmp', () => withTmp(async dir => {
  const f = path.join(dir, 'settings.json');
  await atomicWrite(f, '{"a":1}');
  await atomicWrite(f, '{"a":2}');
  assert.equal(await fs.readFile(f, 'utf8'), '{"a":2}');
  assert.deepEqual(await fs.readdir(dir), ['settings.json']);
}));

test('atomicWrite nhiều lần đồng thời: kết quả là lần ghi cuối, file luôn nguyên vẹn', () => withTmp(async dir => {
  const f = path.join(dir, 'p.json');
  await Promise.all(Array.from({ length: 20 }, (_, i) => atomicWrite(f, JSON.stringify({ i, pad: 'x'.repeat(10000) }))));
  assert.equal(JSON.parse(await fs.readFile(f, 'utf8')).i, 19);
  assert.deepEqual(await fs.readdir(dir), ['p.json']);
}));

test('atomicWrite lỗi (thư mục không tồn tại) → ném lỗi, không tạo rác', () => withTmp(async dir => {
  await assert.rejects(atomicWrite(path.join(dir, 'khong-co', 'x.json'), 'x'));
  assert.deepEqual(await fs.readdir(dir), []);
}));

test('backupFile: chưa có file → false; có file → tạo .bak', () => withTmp(async dir => {
  const f = path.join(dir, 'a.sdeck');
  assert.equal(await backupFile(f), false);
  await fs.writeFile(f, 'v1');
  assert.equal(await backupFile(f), true);
  await atomicWrite(f, 'v2');
  assert.equal(await fs.readFile(f + '.bak', 'utf8'), 'v1');
  assert.equal(await fs.readFile(f, 'utf8'), 'v2');
}));

test('progress: ghi rồi đọc lại giống hệt (cards, meta, log)', () => withTmp(async dir => {
  const f = path.join(dir, 'progress.json');
  const sample = {
    version: 1,
    cards: {
      'eng-ielts-01:w-0001:fwd': { state: 'review', step: 2, ease: 2.6, interval: 6, due: 1793000000000, reps: 3, lapses: 0 },
    },
    meta: {
      'eng-ielts-01:w-0001': { starred: true, note: 'Từ quan trọng' },
    },
    log: [
      { t: 1792400000000, card: 'eng-ielts-01:w-0001:fwd', rating: 3, ms: 3800 },
    ],
  };

  const saved = await saveProgressFile(f, sample);
  assert.equal(saved.ok, true);

  const loaded = await loadProgressFile(f);
  assert.deepEqual(loaded, sample);
}));

test('progress: file hỏng hoặc thiếu → khởi tạo lại an toàn và giữ bản .bak', () => withTmp(async dir => {
  const f = path.join(dir, 'progress.json');

  // 1. File chưa tồn tại (thiếu) -> khởi tạo mặc định an toàn
  const missingLoaded = await loadProgressFile(f);
  assert.deepEqual(missingLoaded, { version: 1, cards: {}, meta: {}, log: [] });

  // 2. File bị hỏng (JSON lỗi) -> giữ bản .bak và khởi tạo lại an toàn
  const brokenContent = '{ "version": 1, "cards": { broken json';
  await fs.writeFile(f, brokenContent, 'utf8');

  const recovered = await loadProgressFile(f);
  assert.deepEqual(recovered, { version: 1, cards: {}, meta: {}, log: [] });
  const bakContent = await fs.readFile(f + '.bak', 'utf8');
  assert.equal(bakContent, brokenContent);
}));

test('progress: hai lần ghi liên tiếp không mất dữ liệu (tuần tự hoá + hợp nhất)', () => withTmp(async dir => {
  const f = path.join(dir, 'progress.json');

  const p1 = {
    version: 1,
    cards: { 'deck-1:q1:fwd': { state: 'learning', step: 1, ease: 2.5, interval: 0, due: 1000, reps: 0, lapses: 0 } },
    meta: { 'deck-1:q1': { starred: true, note: '' } },
    log: [{ t: 100, card: 'deck-1:q1:fwd', rating: 3, ms: 1200 }],
  };

  const p2 = {
    version: 1,
    cards: { 'deck-1:q2:fwd': { state: 'review', step: 2, ease: 2.65, interval: 4, due: 2000, reps: 0, lapses: 0 } },
    meta: { 'deck-1:q2': { starred: false, note: 'dễ' } },
    log: [{ t: 200, card: 'deck-1:q2:fwd', rating: 4, ms: 900 }],
  };

  // Gọi đồng thời 2 lần ghi không chờ nhau
  await Promise.all([
    saveProgressFile(f, p1),
    saveProgressFile(f, p2),
  ]);

  const finalData = await loadProgressFile(f);
  assert.ok(finalData.cards['deck-1:q1:fwd']);
  assert.ok(finalData.cards['deck-1:q2:fwd']);
  assert.equal(finalData.meta['deck-1:q1'].starred, true);
  assert.equal(finalData.meta['deck-1:q2'].note, 'dễ');
  assert.equal(finalData.log.length, 2);
  assert.deepEqual(finalData.log.map(l => l.card), ['deck-1:q1:fwd', 'deck-1:q2:fwd']);
}));

test('settings: lưu một khoá không làm mất các khoá khác (hợp nhất + tuần tự hoá)', () => withTmp(async dir => {
  const f = path.join(dir, 'settings.json');

  // Lần 1: lưu danh sách deck và độ rộng cột Editor
  await saveSettingsFile(f, {
    decks: ['/home/user/lpic.sdeck', '/home/user/math.sdeck'],
    editorListWidth: 280,
    editorPreviewWidth: 420,
    editorPreviewCollapsed: false,
  });

  // Lần 2 & 3 liên tiếp: lưu newCardsPerDay rồi learnSteps riêng lẻ
  await Promise.all([
    saveSettingsFile(f, { newCardsPerDay: 15 }),
    saveSettingsFile(f, { learnSteps: [2, 15] }),
  ]);

  const loaded = await loadSettingsFile(f);
  assert.deepEqual(loaded.decks, ['/home/user/lpic.sdeck', '/home/user/math.sdeck']);
  assert.equal(loaded.editorListWidth, 280);
  assert.equal(loaded.editorPreviewWidth, 420);
  assert.equal(loaded.editorPreviewCollapsed, false);
  assert.equal(loaded.newCardsPerDay, 15);
  assert.deepEqual(loaded.learnSteps, [2, 15]);
}));

test('progress: Học thử (persist:false) không tạo thêm mục nào trong cards hay log trên đĩa', () => withTmp(async dir => {
  const f = path.join(dir, 'progress.json');
  const initial = await loadProgressFile(f);

  // Mô phỏng 3 câu trả lời trong chế độ Học thử (persist: false)
  let current = initial;
  for (const itemId of ['q1', 'q2', 'q3']) {
    const res = recordReview(current, {
      deckId: 'draft-deck',
      itemId,
      rating: 3,
      ms: 1500,
      now: Date.now(),
      persist: false,
    });
    assert.equal(res.persisted, false);
    current = res.progress;
  }

  assert.deepEqual(current.cards, {});
  assert.deepEqual(current.log, []);

  // Đọc lại từ đĩa cũng hoàn toàn trống
  const onDisk = await loadProgressFile(f);
  assert.deepEqual(onDisk.cards, {});
  assert.deepEqual(onDisk.log, []);
}));
