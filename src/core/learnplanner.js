// src/core/learnplanner.js — Quản lý tiến trình thành thạo (mastery) và hàng đợi học thích ứng cho chế độ Learn.
// Theo study-app.md mục 6.1 và study-app-phases.md GĐ5. Hàm thuần, ES module, không phụ thuộc DOM/Electron.

import { buildMC, buildWrite, buildCloze, buildFlashcard, buildQuestion } from './builder.js';
import { cardKey, newCard, schedule } from './srs.js';

export const LEARN_STAGES = ['preview', 'mc-en-vi', 'mc-vi-en', 'write-vi-en', 'cloze'];
export const QUIZ_LEARN_STAGES = ['question', 'retest'];

export function getStagesForKind(deckKind) {
  return deckKind === 'quiz' ? [...QUIZ_LEARN_STAGES] : [...LEARN_STAGES];
}

// Tính stage tiếp theo khi trả lời: đúng lên bậc, sai tụt 1 bậc (không về 0).
// Đạt mastery cuối (>= stages.length) trả về null.
export function nextStage(entry, correct, stages = entry?.stages || LEARN_STAGES) {
  if (!entry) return null;
  const current = typeof entry.mastery === 'number' ? entry.mastery : 0;
  if (correct) {
    entry.mastery = Math.min(stages.length, current + 1);
  } else {
    entry.mastery = Math.max(1, current - 1);
  }
  return entry.mastery >= stages.length ? null : stages[entry.mastery];
}

// Lấy câu kế tiếp từ hàng đợi: không lặp lại cùng item liền kề nếu còn item khác.
export function pickNext(queue, lastId) {
  if (!Array.isArray(queue) || queue.length === 0) return null;
  const idx = queue.findIndex(q => q && q.itemId !== lastId);
  const targetIdx = idx === -1 ? 0 : idx;
  return queue.splice(targetIdx, 1)[0];
}

// Khởi tạo hàng đợi Learn. Với quiz: bỏ preview và ưu tiên single/multi trước rồi command/fill.
export function initLearnQueue(items = [], { deckKind = 'vocab' } = {}) {
  const isQuiz = deckKind === 'quiz';
  const stages = getStagesForKind(deckKind);

  let sortedItems = [...items].filter(it => it && typeof it === 'object');
  if (isQuiz) {
    sortedItems.sort((a, b) => {
      const typeRank = t => (t === 'single' || t === 'multi' ? 1 : 2);
      return typeRank(a.type) - typeRank(b.type);
    });
  }

  return sortedItems.map(item => ({
    itemId: item.id,
    item,
    mastery: 0,
    stages: [...stages],
    completed: false,
  }));
}

// Sinh câu hỏi tương ứng với stage hiện tại của entry trong hàng đợi Learn.
export function buildLearnQuestion(entry, allItems = []) {
  if (!entry || !entry.item) return null;
  const { item, mastery, stages } = entry;
  const stage = stages[mastery] || stages[0];

  if (stage === 'preview') {
    return {
      type: 'preview',
      stage: 'preview',
      item,
      itemId: item.id,
      prompt: item.term || item.front || item.question || '',
      definition: item.definition || item.back || '',
      example: item.example || '',
      phonetic: item.phonetic || '',
      pos: item.pos || '',
      image: item.image || item.frontImage || null,
      answerImage: item.answerImage || item.backImage || null,
    };
  }

  if (stage === 'mc-en-vi') {
    return {
      ...buildMC(item, allItems, 'en-vi'),
      stage: 'mc-en-vi',
      item,
      itemId: item.id,
    };
  }

  if (stage === 'mc-vi-en') {
    return {
      ...buildMC(item, allItems, 'vi-en'),
      stage: 'mc-vi-en',
      item,
      itemId: item.id,
    };
  }

  if (stage === 'write-vi-en') {
    return {
      ...buildWrite(item, 'vi-en'),
      stage: 'write-vi-en',
      item,
      itemId: item.id,
    };
  }

  if (stage === 'cloze') {
    const clozeQ = buildCloze(item);
    if (clozeQ) {
      return { ...clozeQ, stage: 'cloze', item, itemId: item.id };
    }
    // Nếu item không có example để cloze thì chuyển sang gõ từ xuôi
    return {
      ...buildWrite(item, 'fwd'),
      stage: 'cloze-fallback',
      item,
      itemId: item.id,
    };
  }

  // Quiz stages: question / retest
  const baseQ = buildQuestion(item, { mode: 'practice', allItems });
  return {
    ...baseQ,
    stage,
    item,
    itemId: item.id,
  };
}

// Đẩy thẻ đạt mastery cuối cùng vào hệ thống SRS dài hạn (review).
export function graduateToSRS(entry, progress = {}, { deckId = 'deck', now = Date.now(), rating = 4 } = {}) {
  const cards = { ...(progress.cards || {}) };
  const log = Array.isArray(progress.log) ? [...progress.log] : [];
  const key = cardKey(deckId, entry.itemId, 'fwd');
  const existingCard = cards[key] || newCard();

  const scheduledCard = schedule(existingCard, rating, now);
  cards[key] = scheduledCard;
  log.push({ card: key, r: rating, t: now, isNew: true });

  return {
    progress: {
      ...progress,
      cards,
      log,
    },
    card: scheduledCard,
    key,
  };
}
