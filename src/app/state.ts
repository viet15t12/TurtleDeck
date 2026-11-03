// src/app/state.ts — Khởi tạo AppState và entry factory

import type { Entry, Progress, Route, Settings } from '../core/types.js';
import { DEFAULT_NEW_CARDS_PER_DAY } from '../core/planner.js';
import { DEFAULT_LEARN_STEPS } from '../core/srs.js';

export interface AppState {
  settings: Settings;
  progress: Progress;
  entries: Entry[];
  route: Route;
  modal: HTMLElement | null;
  busy: boolean;
}

export const state: AppState = {
  settings: {
    version: 1,
    decks: [],
    newCardsPerDay: DEFAULT_NEW_CARDS_PER_DAY,
    learnSteps: [...DEFAULT_LEARN_STEPS],
  },
  progress: {
    version: 1,
    cards: {},
    meta: {},
    log: [],
  },
  entries: [],
  route: { name: 'home' },
  modal: null,
  busy: false,
};

let uidSeq = 0;
export const newEntry = (fields: Partial<Entry>): Entry => ({
  uid: ++uidSeq,
  path: fields.path ?? null,
  status: fields.status ?? 'ok',
  issues: fields.issues ?? [],
  ...fields,
});

