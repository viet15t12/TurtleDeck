import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createMatchGame,
  checkMatch,
  updateMatchRecord,
  getMatchRecord,
  formatMatchTime,
} from '../src/core/matchgame.js';

test('match: deck 8 thẻ và deck 3 thẻ (tự giảm số cặp), ghép đúng/sai, kỷ lục', () => {
  // 1. Deck 8 thẻ: tạo từ 6 đến 8 cặp (ở đây maxPairs = 6 mặc định -> 6 cặp = 12 ô)
  const items8 = Array.from({ length: 8 }, (_, i) => ({
    id: `item-${i + 1}`,
    term: `Term ${i + 1}`,
    definition: `Def ${i + 1}`,
  }));
  const game8 = createMatchGame(items8, { maxPairs: 6, shuffle: false });
  assert.equal(game8.pairsCount, 6);
  assert.equal(game8.cards.length, 12);

  // Deck 8 thẻ với maxPairs: 8 -> 8 cặp = 16 ô
  const game8Full = createMatchGame(items8, { maxPairs: 8, shuffle: false });
  assert.equal(game8Full.pairsCount, 8);
  assert.equal(game8Full.cards.length, 16);

  // 2. Deck 3 thẻ: tự giảm số cặp xuống 3 (3 cặp = 6 ô)
  const items3 = [
    { id: '1', term: 'apple', definition: 'táo' },
    { id: '2', term: 'banana', definition: 'chuối' },
    { id: '3', term: 'orange', definition: 'cam' },
  ];
  const game3 = createMatchGame(items3, { maxPairs: 6, shuffle: false });
  assert.equal(game3.pairsCount, 3);
  assert.equal(game3.cards.length, 6);

  // 3. Ghép đúng và ghép sai
  const cardLeft1 = game3.cards.find(c => c.itemId === '1' && c.side === 'left');
  const cardRight1 = game3.cards.find(c => c.itemId === '1' && c.side === 'right');
  const cardLeft2 = game3.cards.find(c => c.itemId === '2' && c.side === 'left');

  // Ghép đúng: cùng itemId, khác side
  const resCorrect = checkMatch(cardLeft1, cardRight1);
  assert.equal(resCorrect.ok, true);
  assert.equal(resCorrect.itemId, '1');

  // Ghép sai: khác itemId
  const resWrong = checkMatch(cardLeft1, cardLeft2);
  assert.equal(resWrong.ok, false);

  // Ghép cùng một ô
  const resSame = checkMatch(cardLeft1, cardLeft1);
  assert.equal(resSame.ok, false);

  // 4. Kỷ lục theo deck
  let progress = { matchRecords: {} };
  assert.equal(getMatchRecord(progress, 'deck-vocab'), null);

  // Lần đầu ghi kỷ lục 15.5s (15500 ms)
  const rec1 = updateMatchRecord(progress, 'deck-vocab', 15500);
  assert.equal(rec1.isNewRecord, true);
  assert.equal(rec1.bestTime, 15500);
  progress = rec1.progress;

  // Lần thứ hai chậm hơn: 18.0s (18000 ms) -> không phải kỷ lục mới
  const rec2 = updateMatchRecord(progress, 'deck-vocab', 18000);
  assert.equal(rec2.isNewRecord, false);
  assert.equal(rec2.bestTime, 15500);
  progress = rec2.progress;

  // Lần thứ ba nhanh hơn: 12.3s (12300 ms) -> kỷ lục mới
  const rec3 = updateMatchRecord(progress, 'deck-vocab', 12300);
  assert.equal(rec3.isNewRecord, true);
  assert.equal(rec3.bestTime, 12300);
  assert.equal(getMatchRecord(rec3.progress, 'deck-vocab'), 12300);

  // Định dạng thời gian
  assert.equal(formatMatchTime(12300), '12.3s');
  assert.equal(formatMatchTime(75200), '1:15.2');
});

