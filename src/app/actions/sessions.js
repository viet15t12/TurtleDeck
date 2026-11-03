// src/app/actions/sessions.js — Các action khởi tạo và điều hướng phiên học tập

import { render } from '../runtime.js';

export function sessionActions({ state, actions }) {
  return {
    startSrsSession(entry) {
      state.modal = null;
      state.route = {
        name: 'session',
        uid: entry.uid,
        config: { mode: 'srs', persist: true },
      };
      render();
    },

    startLearnSession(entry, config = {}) {
      state.modal = null;
      state.route = { name: 'learn', uid: entry.uid, config };
      render();
    },

    startMatchSession(entry, config = {}) {
      state.modal = null;
      state.route = { name: 'match', uid: entry.uid, config };
      render();
    },

    startExamSession(entry, config = {}) {
      state.modal = null;
      state.route = { name: 'exam', uid: entry.uid, config };
      render();
    },

    startSession(entry, config = {}) {
      state.modal = null;
      if (config.mode === 'learn') {
        state.route = { name: 'learn', uid: entry.uid, config };
      } else if (config.mode === 'match') {
        state.route = { name: 'match', uid: entry.uid, config };
      } else if (config.mode === 'exam') {
        state.route = { name: 'exam', uid: entry.uid, config };
      } else {
        state.route = { name: 'session', uid: entry.uid, config };
      }
      render();
    },

    // "Học thử" từ Editor (bộ thẻ đang soạn): persist: false → KHÔNG ghi progress hay log
    startTrialSession(entry, workingDeck) {
      state.modal = null;
      const trialDeck = workingDeck ? JSON.parse(JSON.stringify(workingDeck)) : entry.deck;
      state.route = {
        name: 'session',
        uid: entry.uid,
        fromEditor: true,
        trialDeck,
        config: {
          mode: 'trial',
          persist: false,
          count: (trialDeck.items || []).length,
          shuffle: false,
        },
      };
      render();
    },
  };
}

