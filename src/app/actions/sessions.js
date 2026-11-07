// src/app/actions/sessions.js — Các action khởi tạo và điều hướng phiên học tập

import { render } from '../runtime.js';
import { buildQuestion } from '../../core/builder.js';

const api = window.api;

async function planSessionWithRust(entry, config, settings) {
  if (!api?.planSession) return null;
  try {
    const planned = await api.planSession({
      deckId: entry.deck?.meta?.id || 'deck',
      config: {
        deckId: entry.deck?.meta?.id || 'deck',
        deckKind: entry.deck?.meta?.kind,
        mode: config.mode,
        direction: config.direction,
        newCardsPerDay: settings?.newCardsPerDay ?? 20,
        maxCount: config.count,
        targetRetention: 0.9,
        minGap: 3,
      },
      items: entry.deck?.items || [],
    });
    if (Array.isArray(planned) && planned.length > 0) {
      const validItems = entry.deck?.items || [];
      return planned
        .map(p => {
          if (p.question) {
            const kind = p.question.kind;
            const answers = Array.isArray(p.question.answers)
              ? (kind === 'single' || kind === 'multi'
                  ? p.question.answers.map(a => Number(a))
                  : p.question.answers)
              : p.question.answers;
            return {
              ...p.question,
              answers,
              item: p.item,
              itemId: p.itemId || p.item_id,
              deckId: entry.deck?.meta?.id || 'deck',
              direction: p.direction,
              key: `${entry.deck?.meta?.id || 'deck'}:${p.itemId || p.item_id}:${p.direction}`,
              card: p.card,
              category: p.category,
              priority: p.priority,
              retrievability: p.retrievability,
            };
          }
          const q = buildQuestion(p.item, {
            dir: p.direction,
            mode: config.mode,
            allItems: validItems,
          });
          if (!q) return null;
          return {
            ...q,
            item: p.item,
            itemId: p.itemId || p.item_id,
            deckId: entry.deck?.meta?.id || 'deck',
            direction: p.direction,
            key: `${entry.deck?.meta?.id || 'deck'}:${p.itemId || p.item_id}:${p.direction}`,
            card: p.card,
            category: p.category,
            priority: p.priority,
            retrievability: p.retrievability,
          };
        })
        .filter(Boolean);
    }
  } catch (err) {
    console.warn('Rust planSession failed, falling back:', err);
  }
  return null;
}

export function sessionActions({ state, actions }) {
  return {
    async startSrsSession(entry) {
      state.modal = null;
      const config = { mode: 'srs', persist: true };
      const plannedQuestions = await planSessionWithRust(entry, config, state.settings);
      state.route = {
        name: 'session',
        uid: entry.uid,
        config: { ...config, plannedQuestions },
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

    async startSession(entry, config = {}) {
      state.modal = null;
      if (config.mode === 'learn') {
        state.route = { name: 'learn', uid: entry.uid, config };
      } else if (config.mode === 'match') {
        state.route = { name: 'match', uid: entry.uid, config };
      } else if (config.mode === 'exam') {
        state.route = { name: 'exam', uid: entry.uid, config };
      } else {
        const plannedQuestions = await planSessionWithRust(entry, config, state.settings);
        state.route = {
          name: 'session',
          uid: entry.uid,
          config: { ...config, plannedQuestions },
        };
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

