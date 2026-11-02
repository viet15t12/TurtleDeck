// src/core/deckstats.js — Thống kê trạng thái thẻ của bộ thẻ cho Home & Deck view (study-app-phase3b.md mục 4).
// Hàm thuần, ES module, không phụ thuộc Electron/DOM, nhận `now` làm tham số để test.

import { cardKey, newCard } from './srs.js';
import {
  DEFAULT_NEW_CARDS_PER_DAY,
  localDayKey,
  countNewStudiedToday,
  getValidDeckItems,
} from './planner.js';
import { kindOf } from './deckkinds.js';

function resolveTimestamp(now) {
  if (now instanceof Date) return now.getTime();
  if (typeof now === 'number' && Number.isFinite(now)) return now;
  if (typeof now === 'string') {
    const parsed = Date.parse(now);
    if (Number.isFinite(parsed)) return parsed;
  }
  return Date.now();
}

function resolveSettings(settings) {
  if (typeof settings === 'number' && Number.isFinite(settings)) {
    return {
      newCardsPerDay: Math.max(0, Math.floor(settings)),
      direction: undefined,
      timeZone: undefined,
    };
  }
  const s = settings && typeof settings === 'object' ? settings : {};
  const rawLimit = s.newCardsPerDay ?? DEFAULT_NEW_CARDS_PER_DAY;
  const newCardsPerDay = Number.isFinite(Number(rawLimit)) && Number(rawLimit) >= 0
    ? Math.floor(Number(rawLimit))
    : DEFAULT_NEW_CARDS_PER_DAY;
  return {
    newCardsPerDay,
    direction: s.direction,
    timeZone: s.timeZone,
  };
}

// Tính thống kê một bộ thẻ tại thời điểm `now`:
// Trả về { new, learning, due, mastered, newLeftToday, lastStudied }
// - new: số mục hợp lệ chưa học (state === 'new' hoặc chưa có trong progress.cards)
// - learning: số mục đang trong các bước học/học lại ngắn hạn (state === 'learning' | 'relearning')
// - due: số mục ôn tập đã đến hạn (state === 'review' && due <= now)
// - mastered: số mục đã thuộc, chưa đến hạn ôn lại (state === 'review' && due > now)
// - newLeftToday: số thẻ mới còn có thể học hôm nay trong hạn mức ngày địa phương (Math.min(new, remainingQuota))
// - lastStudied: timestamp ms của lượt trả lời gần nhất thuộc bộ thẻ trong progress.log (hoặc null nếu chưa học)
export function deckStats(deck, progress = {}, settings = {}, now = Date.now()) {
  const ts = resolveTimestamp(now);
  const { newCardsPerDay, direction, timeZone } = resolveSettings(settings);

  const isDeckObj = deck && typeof deck === 'object' && !Array.isArray(deck);
  const deckId = (isDeckObj ? (deck.meta?.id ?? deck.id) : undefined) || 'deck';
  const deckKind = kindOf(deck);
  const validItems = getValidDeckItems(deck, deckKind);

  const cards = (progress && typeof progress === 'object' && 'cards' in progress)
    ? (progress.cards || {})
    : (progress && typeof progress === 'object' && !Array.isArray(progress) ? progress : {});
  const log = (progress && Array.isArray(progress.log)) ? progress.log : [];

  let newCount = 0;
  let learning = 0;
  let due = 0;
  let mastered = 0;

  const directions = deckKind === 'vocab'
    ? (direction === 'fwd' || direction === 'rev' ? [direction] : ['fwd', 'rev'])
    : ['fwd'];

  for (const item of validItems) {
    for (const d of directions) {
      const key = cardKey(deckId, item.id, d);
      const rawCard = cards[key] || (d === 'fwd' && cards[item.id] ? cards[item.id] : null);
      const card = rawCard ? { ...newCard(), ...rawCard } : newCard();

      if (card.state === 'review') {
        if ((card.due || 0) <= ts) {
          due++;
        } else {
          mastered++;
        }
      } else if (card.state === 'learning' || card.state === 'relearning') {
        learning++;
      } else {
        newCount++;
      }
    }
  }

  const newStudiedToday = countNewStudiedToday(log, ts, { deckId, cards, timeZone });
  const remainingQuota = Math.max(0, newCardsPerDay - newStudiedToday);
  const newLeftToday = Math.min(newCount, remainingQuota);

  let lastStudied = null;
  const prefix = `${deckId}:`;
  for (const entry of log) {
    if (!entry || typeof entry.t !== 'number') continue;
    const isThisDeck = (typeof entry.card === 'string' && entry.card.startsWith(prefix))
      || entry.deckId === deckId;
    if (isThisDeck) {
      if (lastStudied === null || entry.t > lastStudied) {
        lastStudied = entry.t;
      }
    }
  }

  return {
    new: newCount,
    learning,
    due,
    mastered,
    newLeftToday,
    lastStudied,
  };
}

// Đếm số lượt câu đã ôn trong ngày địa phương của `now` từ `progress.log` (cho dải "Hôm nay" ở Home)
export function countReviewedToday(progress = {}, now = Date.now(), { deckId, timeZone } = {}) {
  const ts = resolveTimestamp(now);
  const log = Array.isArray(progress) ? progress : (Array.isArray(progress?.log) ? progress.log : []);
  if (log.length === 0) return 0;

  const today = localDayKey(ts, timeZone);
  const prefix = deckId ? `${deckId}:` : null;
  let count = 0;
  for (const entry of log) {
    if (!entry || typeof entry.t !== 'number') continue;
    if (prefix && !(typeof entry.card === 'string' && entry.card.startsWith(prefix)) && entry.deckId !== deckId) {
      continue;
    }
    if (localDayKey(entry.t, timeZone) === today) {
      count++;
    }
  }
  return count;
}

