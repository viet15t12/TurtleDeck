import assert from 'node:assert/strict';
import test from 'node:test';
import {
  extractTopics,
  extractTags,
  getItemStatus,
  filterItems,
} from '../src/core/filters.js';

test('filters: lọc theo topic/tag/trạng thái', () => {
  const now = 2000000;
  const items = [
    {
      id: 'it-1',
      term: 'algorithm',
      definition: 'thuật toán',
      topic: 'CS Basics',
      tags: ['core', 'math'],
    },
    {
      id: 'it-2',
      term: 'database',
      definition: 'cơ sở dữ liệu',
      topic: 'Storage',
      tags: ['backend', 'core'],
      starred: true,
    },
    {
      id: 'it-3',
      term: 'network',
      definition: 'mạng máy tính',
      topic: 'Network',
      tags: ['devops'],
    },
    {
      id: 'it-4',
      term: 'compiler',
      definition: 'trình biên dịch',
      topic: 'CS Basics',
      tags: ['backend'],
    },
  ];

  // 1. extractTopics & extractTags
  assert.deepEqual(extractTopics(items), ['CS Basics', 'Network', 'Storage']);
  assert.deepEqual(extractTags(items), ['backend', 'core', 'devops', 'math']);

  // 2. Trạng thái học (SRS)
  const progress = {
    starred: ['it-1'], // it-1 cũng được sao qua progress
    cards: {
      'd1:it-1:fwd': { state: 'review', due: now + 50000, reps: 3, lapses: 0 },
      'd1:it-2:fwd': { state: 'learning', step: 1, due: now + 1000 },
      'd1:it-3:fwd': { state: 'relearning', lapses: 2, due: now - 1000 },
      // it-4 chưa có trong progress.cards -> 'new'
    },
  };

  assert.equal(getItemStatus(items[0], progress, { deckId: 'd1', now }), 'starred');
  assert.equal(getItemStatus(items[1], progress, { deckId: 'd1', now }), 'starred'); // it-2 has item.starred: true
  assert.equal(getItemStatus(items[2], progress, { deckId: 'd1', now }), 'error-prone'); // lapses = 2 >= 1
  assert.equal(getItemStatus(items[3], progress, { deckId: 'd1', now }), 'new');

  // 3. Lọc theo Topic
  const csItems = filterItems(items, { topic: 'CS Basics' });
  assert.deepEqual(csItems.map(i => i.id), ['it-1', 'it-4']);

  // 4. Lọc theo Tag
  const coreItems = filterItems(items, { tag: 'core' });
  assert.deepEqual(coreItems.map(i => i.id), ['it-1', 'it-2']);

  const backendItems = filterItems(items, { tag: 'backend' });
  assert.deepEqual(backendItems.map(i => i.id), ['it-2', 'it-4']);

  // 5. Lọc theo Trạng thái (status)
  // - Đã sao (starred)
  const starredItems = filterItems(items, { status: 'starred' }, { progress, deckId: 'd1', now });
  assert.deepEqual(starredItems.map(i => i.id), ['it-1', 'it-2']);

  // - Sai nhiều (error-prone / lapses >= 1)
  const lapsedItems = filterItems(items, { status: 'error-prone' }, { progress, deckId: 'd1', now });
  assert.deepEqual(lapsedItems.map(i => i.id), ['it-3']);

  // - Mới (new)
  const newItems = filterItems(items, { status: 'new' }, { progress, deckId: 'd1', now });
  assert.deepEqual(newItems.map(i => i.id), ['it-4']);

  // - Đang học (learning)
  const learningItems = filterItems(items, { status: 'learning' }, { progress, deckId: 'd1', now });
  assert.deepEqual(learningItems.map(i => i.id), ['it-2']);

  // 6. Kết hợp Topic và Tag
  const combined = filterItems(items, { topic: 'CS Basics', tag: 'math' });
  assert.deepEqual(combined.map(i => i.id), ['it-1']);
});

