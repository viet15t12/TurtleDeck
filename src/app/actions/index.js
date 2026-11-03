// src/app/actions/index.js — Hợp nhất toàn bộ nhóm actions của ứng dụng

import { navigationActions } from './navigation.js';
import { deckActions } from './deck.js';
import { modalActions } from './modals.js';
import { sessionActions } from './sessions.js';
import { settingsActions } from './settings.js';
import { scanLibrary, reloadLibrary } from '../library.js';

export function createActions({ state }) {
  const actions = {};
  Object.assign(
    actions,
    navigationActions({ state, actions }),
    deckActions({ state, actions }),
    modalActions({ state, actions }),
    sessionActions({ state, actions }),
    settingsActions({ state, actions }),
    {
      scanLibrary: () => scanLibrary(actions),
      reloadLibrary: () => reloadLibrary(actions),
    }
  );
  return actions;
}

