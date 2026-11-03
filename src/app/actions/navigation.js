// src/app/actions/navigation.js — Các action chuyển hướng màn hình chính

import { render } from '../runtime.js';

export function navigationActions({ state }) {
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

    openDeckView(entry) {
      state.route = { name: 'deck', uid: entry.uid };
      render();
    },

    openEditor(entry, initialItemId = null) {
      state.route = { name: 'editor', uid: entry.uid, itemId: initialItemId };
      render();
    },
  };
}

