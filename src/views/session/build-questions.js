// src/views/session/build-questions.js — Tạo danh sách câu hỏi cho phiên học theo cấu hình và chế độ

import { planSession } from '../../core/planner.js';
import { buildSessionQuestions } from '../../core/builder.js';

export function createQuestions({ entry, config, progress, settings }) {
  const isSrsMode = config.mode === 'srs';
  const deckKind = entry.deck.meta?.kind;
  const learnSteps = settings?.learnSteps;
  const newCardsPerDay = settings?.newCardsPerDay;

  return isSrsMode
    ? planSession(entry.deck, progress, Date.now(), {
        newCardsPerDay,
        learnSteps,
        count: config.count,
      })
    : buildSessionQuestions(entry.deck.items, {
        count: config.count,
        shuffle: Boolean(config.shuffle),
        itemIds: config.itemIds,
        deckKind,
      });
}
