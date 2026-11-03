// test/ipc-handlers.test.mjs — Test các IPC Handlers có type
import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseManager } from '../src/main/db/index.js';
import { registerTypedIpcHandlers } from '../src/main/ipc-handlers.js';

class MockDispatcher {
  constructor() {
    this.handlers = new Map();
  }

  handle(channel, fn) {
    this.handlers.set(channel, fn);
  }

  async invoke(channel, params) {
    const fn = this.handlers.get(channel);
    if (!fn) throw new Error(`No handler registered for channel: ${channel}`);
    return fn({}, params);
  }
}

test('IPC Handlers: srs:recordReview, srs:getDeckSummary, srs:getDueItems, deck:queryItems, meta & stats', async () => {
  const manager = DatabaseManager.createInMemory();
  const dispatcher = new MockDispatcher();
  registerTypedIpcHandlers(manager, dispatcher);

  // 1. Chuẩn bị dữ liệu deck vào DB
  manager.deck.syncDeck({
    meta: { id: 'd1', title: 'English Vocab', kind: 'vocab' },
    items: [
      { id: 'item-1', type: 'vocab', term: 'cat', definition: 'con mèo', tags: ['animal'] },
      { id: 'item-2', type: 'vocab', term: 'dog', definition: 'con chó', tags: ['animal'] },
    ]
  });

  // 2. deck:queryItems
  const queryRes = await dispatcher.invoke('deck:queryItems', { deckId: 'd1', tag: 'animal' });
  assert.equal(queryRes.items.length, 2);

  // 3. srs:recordReview (học lần đầu item-1)
  const revRes1 = await dispatcher.invoke('srs:recordReview', {
    deckId: 'd1',
    itemId: 'item-1',
    direction: 'en-vi',
    rating: 3, // Good
    elapsedMs: 1500,
  });

  assert.equal(revRes1.ok, true);
  assert.equal(revRes1.card.deckId, 'd1');
  assert.equal(revRes1.card.itemId, 'item-1');
  assert.equal(revRes1.card.state, 'learning');
  assert.equal(revRes1.card.step, 1);

  // 4. srs:getDeckSummary
  const summary = await dispatcher.invoke('srs:getDeckSummary', { deckId: 'd1' });
  assert.equal(summary.totalCards, 2);
  assert.equal(summary.newCount, 1); // item-2 chưa học
  assert.equal(summary.learningCount, 1); // item-1 đang learning

  // 5. srs:getDueItems (tại thời điểm tương lai khi item-1 due)
  const futureNow = Date.now() + 86400000;
  const dueItems = await dispatcher.invoke('srs:getDueItems', { deckId: 'd1', now: futureNow });
  assert.equal(dueItems.length, 1);
  assert.equal(dueItems[0].item.id, 'item-1');
  assert.equal(dueItems[0].card.itemId, 'item-1');

  // 6. Meta: setStarred, setNote, get
  await dispatcher.invoke('meta:setStarred', { deckId: 'd1', itemId: 'item-1', starred: true });
  await dispatcher.invoke('meta:setNote', { deckId: 'd1', itemId: 'item-1', note: 'Từ vựng quan trọng' });
  const meta = await dispatcher.invoke('meta:get', { deckId: 'd1', itemId: 'item-1' });
  assert.equal(meta.starred, true);
  assert.equal(meta.note, 'Từ vựng quan trọng');

  // 7. stats:getDeckReport & stats:getOverallStreak
  const report = await dispatcher.invoke('stats:getDeckReport', { deckId: 'd1' });
  assert.equal(report.deckId, 'd1');
  assert.equal(report.learnedItems, 1);

  const streak = await dispatcher.invoke('stats:getOverallStreak');
  assert.equal(streak.currentStreak, 1);
});
