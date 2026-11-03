// test/migration.test.mjs — Test Migration từ progress.json sang SQLite
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { DatabaseManager } from '../src/main/db/index.js';
import { migrateLegacyProgress } from '../src/main/db/migration.js';
import { SrsRepository } from '../src/main/db/repositories/srs.repo.js';

test('migrateLegacyProgress: đọc định dạng progress.json mục 8, migrate vào SQLite, đổi tên file và idempotent', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'studyapp-migration-test-'));
  const progressPath = path.join(tmpDir, 'progress.json');

  // Chuẩn bị progress.json đúng định dạng study-app.md mục 8
  const legacyData = {
    version: 1,
    cards: {
      'deck-eng:item-01:en-vi': {
        state: 'review',
        due: 1715000000000,
        interval: 4,
        ease: 2.6,
        reps: 3,
        lapses: 0,
        lastReviewed: 1714654400000
      },
      'deck-eng:item-01:vi-en': {
        state: 'learning',
        due: 1715000600000,
        interval: 0,
        ease: 2.5,
        reps: 1,
        lapses: 0,
        lastReviewed: 1715000000000
      },
      'deck-quiz:q1:fwd': {
        state: 'review',
        due: 1716000000000,
        interval: 15,
        ease: 2.4,
        reps: 5,
        lapses: 1,
        lastReviewed: 1714704000000
      }
    },
    log: [
      { t: 1714654400000, card: 'deck-eng:item-01:en-vi', rating: 'good', ms: 1200 },
      { t: 1715000000000, card: 'deck-eng:item-01:vi-en', rating: 'again', ms: 3500 },
      { t: 1714704000000, card: 'deck-quiz:q1:fwd', rating: 'easy', ms: 800 }
    ],
    meta: {
      'deck-eng:item-01': {
        starred: true,
        note: 'Từ này hay quên phần giới từ'
      },
      'deck-quiz:q1': {
        starred: false,
        note: 'Đọc kỹ câu hỏi phủ định'
      }
    }
  };

  fs.writeFileSync(progressPath, JSON.stringify(legacyData, null, 2), 'utf8');

  // Khởi tạo DB in-memory
  const manager = DatabaseManager.createInMemory();
  const db = manager.db;
  const srsRepo = manager.srs;

  // 1. Chạy migration
  const result = migrateLegacyProgress(db, progressPath);
  assert.equal(result.migrated, true);
  assert.equal(result.cardsCount, 3);
  assert.equal(result.logsCount, 3);
  assert.equal(result.metaCount, 2);

  // 2. Kiểm tra dữ liệu trong SQLite
  const c1 = srsRepo.getCard('deck-eng', 'item-01', 'en-vi');
  assert.ok(c1);
  assert.equal(c1.state, 'review');
  assert.equal(c1.interval, 4);
  assert.equal(c1.ease, 2.6);

  const c2 = srsRepo.getCard('deck-eng', 'item-01', 'vi-en');
  assert.ok(c2);
  assert.equal(c2.state, 'learning');

  const c3 = srsRepo.getCard('deck-quiz', 'q1', 'fwd');
  assert.ok(c3);
  assert.equal(c3.lapses, 1);

  // Kiểm tra review_logs
  const logsEng = srsRepo.getReviewLogs('deck-eng');
  assert.equal(logsEng.length, 2);
  assert.equal(logsEng[0].elapsed_ms, 3500); // Mới nhất lên đầu (ORDER BY review_time DESC)
  assert.equal(logsEng[1].elapsed_ms, 1200);

  // Kiểm tra item_meta
  const meta1 = srsRepo.getMeta('deck-eng', 'item-01');
  assert.equal(meta1.starred, true);
  assert.equal(meta1.note, 'Từ này hay quên phần giới từ');

  const meta2 = srsRepo.getMeta('deck-quiz', 'q1');
  assert.equal(meta2.starred, false);
  assert.equal(meta2.note, 'Đọc kỹ câu hỏi phủ định');

  // 3. Kiểm tra file progress.json gốc đã được đổi tên thành progress.json.migrated
  assert.equal(fs.existsSync(progressPath), false, 'File gốc progress.json phải không còn tồn tại');
  const migratedPath = `${progressPath}.migrated`;
  assert.equal(fs.existsSync(migratedPath), true, 'File phải được đổi tên sang .migrated');

  // 4. Kiểm tra IDEMPOTENT: gọi lại migration với file không còn hoặc file khác không bị trùng lặp
  const resEmpty = migrateLegacyProgress(db, progressPath);
  assert.equal(resEmpty.migrated, false);
  assert.equal(resEmpty.cardsCount, 0);

  // Nếu tạo lại file progress.json giống vậy và migrate vào DB đã có dữ liệu
  fs.writeFileSync(progressPath, JSON.stringify(legacyData, null, 2), 'utf8');
  const res2 = migrateLegacyProgress(db, progressPath);
  assert.equal(res2.migrated, true);

  // Tổng số cards và meta không bị nhân đôi
  const cardCount = db.prepare('SELECT COUNT(*) as c FROM srs_cards').get().c;
  const metaCount = db.prepare('SELECT COUNT(*) as c FROM item_meta').get().c;
  assert.equal(cardCount, 3);
  assert.equal(metaCount, 2);

  // Dọn dẹp tmp
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('migrateLegacyProgress: file JSON lỗi cú pháp không làm crash và không xoá file', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'studyapp-corrupt-test-'));
  const progressPath = path.join(tmpDir, 'progress.json');
  fs.writeFileSync(progressPath, '{ corrupt json !!!', 'utf8');

  const manager = DatabaseManager.createInMemory();
  const res = migrateLegacyProgress(manager.db, progressPath);

  assert.equal(res.migrated, false);
  assert.ok(res.error, 'Phải ghi nhận lỗi');
  assert.equal(fs.existsSync(progressPath), true, 'File bị lỗi không được xoá/đổi tên');

  fs.rmSync(tmpDir, { recursive: true, force: true });
});
