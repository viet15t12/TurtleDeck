// src/app/actions/navigation.js — Các action chuyển hướng màn hình chính

import { render } from '../runtime.js';
import { applyResult } from '../entries.js';

const getApi = () => (typeof window !== 'undefined' ? window.api : undefined);

export function navigationActions({ state }) {
  async function ensureDeckLoaded(entry) {
    if (!entry.deckKey && entry.path) {
      const api = getApi();
      const [r] = (await api?.openDecks?.(entry.path)) || [];
      if (r?.ok) applyResult(r, entry);
    }
  }

  return {
    home() {
      state.route = { name: 'home' };
      render();
    },

    openStats() {
      state.route = { name: 'stats' };
      render();
    },

    openSettings() {
      state.route = { name: 'settings' };
      render();
    },

    async openDeckView(entry) {
      await ensureDeckLoaded(entry);
      state.route = { name: 'deck', uid: entry.uid };
      render();
    },

    async openEditor(entry, initialItemId = null) {
      await ensureDeckLoaded(entry);
      state.route = { name: 'editor', uid: entry.uid, itemId: initialItemId };
      render();
    },
  };
}

