// test/sqlite-repo.test.mjs — Test SQLite Repositories (:memory:)
import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseManager } from '../src/main/db/index.js';
import { SrsRepository } from '../src/main/db/repositories/srs.repo.js';
import { DeckRepository } from '../src/main/db/repositories/deck.repo.js';
import { MatchRepository } from '../src/main/db/repositories/match.repo.js';
import { StatsRepository } from '../src/main/db/repositories/stats.repo.js';

test('DatabaseManager: khởi tạo DB :memory: với PRAGMA và migration hợp lệ', () => {
  const manager = DatabaseManager.createInMemory();
  const db = manager.db;
  assert.ok(db, 'Phải tạo được database instance');
  const userVersion = db.pragma('user_version', { simple: true });
  assert.equal(userVersion, 1, 'user_version phải là 1');

  // Kiểm tra bảng schema tồn tại
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(r => r.name);
  assert.ok(tables.includes('decks'), 'Có bảng decks');
  assert.ok(tables.includes('items'), 'Có bảng items');
  assert.ok(tables.includes('srs_cards'), 'Có bảng srs_cards');
  assert.ok(tables.includes('review_logs'), 'Có bảng review_logs');
  assert.ok(tables.includes('item_meta'), 'Có bảng item_meta');
  assert.ok(tables.includes('match_records'), 'Có bảng match_records');
});

test('DeckRepository: syncDeck, hash check, FTS query và xoá item giữ srs_cards', () => {
  const manager = DatabaseManager.createInMemory();
  const deckRepo = manager.deck;
  const srsRepo = manager.srs;

  const sampleDeck = {
    id: 'deck-1',
    meta: { id: 'deck-1', title: 'Từ vựng tiếng Anh', kind: 'vocab' },
    items: [
      { id: 'item-1', type: 'vocab', term: 'apple', definition: 'quả táo', tags: ['fruit'] },
      { id: 'item-2', type: 'vocab', term: 'banana', definition: 'quả chuối', tags: ['fruit'] },
      { id: 'item-3', type: 'single', prompt: 'Hà Nội là thủ đô của?', choices: ['Việt Nam', 'Lào'], answer: 0 }
    ]
  };

  // 1. Sync deck lần 1
  const res1 = deckRepo.syncDeck(sampleDeck);
  assert.equal(res1.itemsCount, 3);
  assert.equal(res1.changed, true);

  // Sync lại không đổi -> changed: false
  const res2 = deckRepo.syncDeck(sampleDeck);
  assert.equal(res2.changed, false);

  // 2. Query items với FTS và tag
  const searchFruit = deckRepo.queryItems('deck-1', { tag: 'fruit' });
  assert.equal(searchFruit.items.length, 2);

  const searchFts = deckRepo.queryItems('deck-1', { query: 'thủ đô' });
  assert.equal(searchFts.items.length, 1);
  assert.equal(searchFts.items[0].id, 'item-3');

  // 3. Tạo thẻ SRS cho item-1
  const now = Date.now();
  srsRepo.recordReview(
    {
      deckId: 'deck-1',
      itemId: 'item-1',
      direction: 'en-vi',
      state: 'review',
      due: now + 86400000,
      interval: 1,
      ease: 2.5,
      reps: 1,
      lapses: 0,
      lastReviewed: now
    },
    {
      deckId: 'deck-1',
      itemId: 'item-1',
      direction: 'en-vi',
      rating: 'good',
      reviewTime: now,
      interval: 1,
      ease: 2.5,
      timeSpentMs: 1200
    }
  );

  assert.ok(srsRepo.getCard('deck-1', 'item-1', 'en-vi'));

  // 4. Update deck loại bỏ item-1
  const updatedDeck = {
    id: 'deck-1',
    meta: { id: 'deck-1', title: 'Từ vựng tiếng Anh', kind: 'vocab' },
    items: [
      { id: 'item-2', type: 'vocab', term: 'banana', definition: 'quả chuối', tags: ['fruit'] },
      { id: 'item-3', type: 'single', prompt: 'Hà Nội là thủ đô của?', choices: ['Việt Nam', 'Lào'], answer: 0 }
    ]
  };
  deckRepo.syncDeck(updatedDeck);

  // item-1 không còn trong items
  const allItems = deckRepo.getItems('deck-1');
  assert.equal(allItems.length, 2);
  assert.ok(!allItems.find(i => i.id === 'item-1'));

  // Nhưng srs_cards của item-1 VẪN CÒN (không có FK CASCADE xoá tiến độ!)
  const cardAfterItemDelete = srsRepo.getCard('deck-1', 'item-1', 'en-vi');
  assert.ok(cardAfterItemDelete, 'Tiến độ srs_cards phải được giữ nguyên khi item bị xoá khỏi deck');
});

test('SrsRepository: recordReview atomic transaction (card + log)', () => {
  const manager = DatabaseManager.createInMemory();
  const db = manager.db;
  const srsRepo = manager.srs;

  const now = 1700000000000;
  const card = {
    deckId: 'deck-test',
    itemId: 'it-1',
    direction: 'fwd',
    state: 'learning',
    due: now + 600000,
    interval: 0,
    ease: 2.5,
    reps: 1,
    lapses: 0,
    lastReviewed: now
  };
  const log = {
    deckId: 'deck-test',
    itemId: 'it-1',
    direction: 'fwd',
    rating: 'good',
    reviewTime: now,
    interval: 0,
    ease: 2.5,
    timeSpentMs: 2500
  };

  // Record thành công
  srsRepo.recordReview(card, log);

  const savedCard = srsRepo.getCard('deck-test', 'it-1', 'fwd');
  assert.ok(savedCard);
  assert.equal(savedCard.state, 'learning');
  assert.equal(savedCard.reps, 1);

  const logs = srsRepo.getReviewLogs('deck-test');
  assert.equal(logs.length, 1);
  assert.equal(logs[0].rating, 3);
  assert.equal(logs[0].elapsed_ms, 2500);

  // Kiểm tra tính ATOMIC: nếu cố tình chèn card lỗi làm transaction rollback
  const initialCardCount = db.prepare('SELECT COUNT(*) as c FROM srs_cards').get().c;
  const initialLogCount = db.prepare('SELECT COUNT(*) as c FROM review_logs').get().c;

  assert.throws(() => {
    // Ép lỗi kiểu dữ liệu ở card nhưng log hợp lệ (hoặc ngược lại)
    srsRepo.recordReview(
      { ...card, state: null }, // state NOT NULL -> sẽ throw SQLite constraint
      log
    );
  });

  const postCardCount = db.prepare('SELECT COUNT(*) as c FROM srs_cards').get().c;
  const postLogCount = db.prepare('SELECT COUNT(*) as c FROM review_logs').get().c;

  assert.equal(postCardCount, initialCardCount, 'Card count không được thay đổi khi transaction fail');
  assert.equal(postLogCount, initialLogCount, 'Log count không được thay đổi khi transaction fail');
});

test('SrsRepository: getSummary, getDueCards, meta và clearDeckProgress', () => {
  const manager = DatabaseManager.createInMemory();
  const srsRepo = manager.srs;
  const deckRepo = manager.deck;

  const now = 1700000000000;
  // Tạo deck với 5 items
  deckRepo.syncDeck({
    id: 'deck-srs',
    meta: { id: 'deck-srs', title: 'Deck SRS' },
    items: [
      { id: 'i1', type: 'card', front: '1', back: '1' },
      { id: 'i2', type: 'card', front: '2', back: '2' },
      { id: 'i3', type: 'card', front: '3', back: '3' },
      { id: 'i4', type: 'card', front: '4', back: '4' },
      { id: 'i5', type: 'card', front: '5', back: '5' }
    ]
  });

  // i1: learning
  srsRepo.recordReview(
    { deckId: 'deck-srs', itemId: 'i1', direction: 'fwd', state: 'learning', due: now - 100, interval: 0, ease: 2.5, reps: 1, lapses: 0, lastReviewed: now },
    { deckId: 'deck-srs', itemId: 'i1', direction: 'fwd', rating: 'good', reviewTime: now }
  );

  // i2: review, due hôm nay
  srsRepo.recordReview(
    { deckId: 'deck-srs', itemId: 'i2', direction: 'fwd', state: 'review', due: now - 50, interval: 3, ease: 2.5, reps: 3, lapses: 0, lastReviewed: now },
    { deckId: 'deck-srs', itemId: 'i2', direction: 'fwd', rating: 'good', reviewTime: now }
  );

  // i3: review, tương lai (chưa due)
  srsRepo.recordReview(
    { deckId: 'deck-srs', itemId: 'i3', direction: 'fwd', state: 'review', due: now + 86400000, interval: 5, ease: 2.5, reps: 4, lapses: 0, lastReviewed: now },
    { deckId: 'deck-srs', itemId: 'i3', direction: 'fwd', rating: 'good', reviewTime: now }
  );

  // i4: mastered (interval >= 21)
  srsRepo.recordReview(
    { deckId: 'deck-srs', itemId: 'i4', direction: 'fwd', state: 'review', due: now + 86400000 * 30, interval: 30, ease: 2.5, reps: 10, lapses: 0, lastReviewed: now },
    { deckId: 'deck-srs', itemId: 'i4', direction: 'fwd', rating: 'easy', reviewTime: now }
  );

  // Summary
  const summary = srsRepo.getSummary('deck-srs', now);
  assert.equal(summary.totalCards, 5);
  assert.equal(summary.newCount, 1); // i5 chưa học
  assert.equal(summary.learningCount, 1); // i1
  assert.equal(summary.dueCount, 1); // i2
  assert.equal(summary.masteredCount, 2); // i3 và i4 đều có state = review và due > now

  // Due cards
  const dueCards = srsRepo.getDueCards('deck-srs', now);
  assert.equal(dueCards.length, 2); // i1 (learning) + i2 (review due)
  assert.equal(dueCards[0].itemId, 'i1'); // i1 due sớm hơn i2

  // Meta (starred, note)
  srsRepo.setStarred('deck-srs', 'i1', true);
  srsRepo.setNote('deck-srs', 'i1', 'Lưu ý từ này');
  const meta = srsRepo.getMeta('deck-srs', 'i1');
  assert.equal(meta.starred, true);
  assert.equal(meta.note, 'Lưu ý từ này');

  // Clear progress
  srsRepo.clearDeckProgress('deck-srs');
  const summaryAfterClear = srsRepo.getSummary('deck-srs', now);
  assert.equal(summaryAfterClear.newCount, 5);
  assert.equal(summaryAfterClear.learningCount, 0);
  assert.equal(summaryAfterClear.dueCount, 0);
});

test('StatsRepository: streak qua nửa đêm theo múi giờ Asia/Saigon', () => {
  const manager = DatabaseManager.createInMemory();
  const srsRepo = manager.srs;
  const statsRepo = manager.stats;

  // Asia/Saigon là UTC+7.
  // Ví dụ:
  // 2026-05-10 23:30:00 UTC+7 tương đương 2026-05-10 16:30:00 UTC
  // 2026-05-11 00:30:00 UTC+7 tương đương 2026-05-10 17:30:00 UTC
  // Hai mốc thời gian này chỉ cách nhau 1 giờ thực tế, nhưng qua nửa đêm và nằm ở 2 ngày liên tiếp tại Việt Nam!
  const d1Saigon = new Date('2026-05-10T16:30:00.000Z').getTime(); // 23:30 tại Saigon
  const d2Saigon = new Date('2026-05-10T17:30:00.000Z').getTime(); // 00:30 ngày hôm sau tại Saigon

  srsRepo.recordReview(
    { deckId: 'd', itemId: 'i1', direction: 'fwd', state: 'review', due: d1Saigon + 86400000, interval: 1, ease: 2.5, reps: 1, lapses: 0, lastReviewed: d1Saigon },
    { deckId: 'd', itemId: 'i1', direction: 'fwd', rating: 'good', reviewTime: d1Saigon }
  );

  srsRepo.recordReview(
    { deckId: 'd', itemId: 'i2', direction: 'fwd', state: 'review', due: d2Saigon + 86400000, interval: 1, ease: 2.5, reps: 1, lapses: 0, lastReviewed: d2Saigon },
    { deckId: 'd', itemId: 'i2', direction: 'fwd', rating: 'good', reviewTime: d2Saigon }
  );

  // Kiểm tra daily activity
  const daily = statsRepo.getDailyActivity(30, 'Asia/Saigon');
  const day1Entry = daily.find(d => d.date === '2026-05-10');
  const day2Entry = daily.find(d => d.date === '2026-05-11');

  assert.ok(day1Entry, 'Phải có bản ghi cho ngày 2026-05-10');
  assert.equal(day1Entry.count, 1);
  assert.ok(day2Entry, 'Phải có bản ghi cho ngày 2026-05-11');
  assert.equal(day2Entry.count, 1);

  // Kiểm tra streak tại ngày 2026-05-11 (Saigon time)
  // now = 2026-05-11 08:00:00 Saigon (01:00 UTC)
  const nowSaigon = new Date('2026-05-11T01:00:00.000Z').getTime();
  const streak = statsRepo.getOverallStreak('Asia/Saigon', nowSaigon);
  assert.equal(streak.currentStreak, 2, 'Chuỗi học phải là 2 ngày liên tiếp qua nửa đêm Saigon');
  assert.equal(streak.bestStreak, 2);

  // Kiểm tra trường hợp hôm nay chưa học nhưng hôm qua có học: streak vẫn giữ nguyên
  const nowDay3Saigon = new Date('2026-05-12T01:00:00.000Z').getTime(); // Hôm nay là 2026-05-12, chưa học gì
  const streakDay3 = statsRepo.getOverallStreak('Asia/Saigon', nowDay3Saigon);
  assert.equal(streakDay3.currentStreak, 2, 'Hôm nay chưa học thì streak hôm qua vẫn được bảo toàn');

  // Thêm ngày 2026-05-14 (bỏ qua ngày 12 và 13 -> gãy streak)
  const nowDay5Saigon = new Date('2026-05-14T01:00:00.000Z').getTime();
  const streakDay5 = statsRepo.getOverallStreak('Asia/Saigon', nowDay5Saigon);
  assert.equal(streakDay5.currentStreak, 0, 'Quá 1 ngày không học thì streak trở về 0');
  assert.equal(streakDay5.bestStreak, 2, 'Best streak vẫn giữ mức cao nhất là 2');
});

test('MatchRepository: getRecord và saveRecord lưu thời gian tốt nhất', () => {
  const manager = DatabaseManager.createInMemory();
  const matchRepo = manager.match;

  assert.equal(matchRepo.getRecord('deck-m'), null);

  // Lần 1: 45.5s
  matchRepo.saveRecord('deck-m', 45500, 6);
  const rec1 = matchRepo.getRecord('deck-m');
  assert.equal(rec1.bestTimeMs, 45500);

  // Lần 2: 50.0s (kém hơn -> giữ bestTime cũ)
  const saved2 = matchRepo.saveRecord('deck-m', 50000, 6);
  assert.equal(saved2, false);
  const rec2 = matchRepo.getRecord('deck-m');
  assert.equal(rec2.bestTimeMs, 45500);

  // Lần 3: 38.2s (tốt hơn -> cập nhật bestTime)
  const saved3 = matchRepo.saveRecord('deck-m', 38200, 6);
  assert.equal(saved3, true);
  const rec3 = matchRepo.getRecord('deck-m');
  assert.equal(rec3.bestTimeMs, 38200);
});
