// test/deck-actions-remove.test.mjs — Kiểm tra thao tác gỡ bộ thẻ (kể cả thẻ missing / clone)
import test from 'node:test';
import assert from 'node:assert/strict';
import { deckActions } from '../src/app/actions/deck.js';

test('deckActions.remove removes cloned / missing entries from state.entries and settings.decks', async () => {
  const missingPath = '/path/to/missing-deck.sdeck';
  const originalEntry = {
    uid: 'entry-123',
    path: missingPath,
    status: 'missing',
    deck: null,
  };

  const state = {
    entries: [originalEntry],
    settings: {
      decks: [missingPath],
    },
    route: { name: 'home', uid: 'entry-123' },
    progress: {},
  };

  // Mock window.confirm và window.api
  globalThis.window = {
    confirm: () => true,
    api: {
      saveProgress: async () => ({ ok: true }),
      deleteDeck: async () => ({ ok: true }),
      closeDeck: async () => {},
      saveSettings: async (s) => ({ ok: true, settings: s }),
    },
  };

  const actions = {
    scanLibrary: async () => {},
  };

  const deckActionHandlers = deckActions({ state, actions });

  // Mô phỏng đối tượng entry clone được truyền từ selectDecks (không cùng tham chiếu với originalEntry)
  const clonedEntry = {
    ...originalEntry,
    isLink: false,
    locationId: undefined,
  };

  await deckActionHandlers.remove(clonedEntry);

  // Kiểm tra: entry đã được xoá khỏi state.entries
  assert.strictEqual(state.entries.length, 0, 'state.entries must be empty after remove');
  // Kiểm tra: đường dẫn đã được xoá khỏi settings.decks
  assert.ok(!state.settings.decks.includes(missingPath), 'missingPath must be removed from settings.decks');
});
