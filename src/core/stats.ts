// src/core/stats.ts — Thống kê học tập (hàm thuần, ES module, test được bằng node --test).
// Theo study-app.md mục 5, 7.3 và yêu cầu Giai đoạn 6.

import { RATING } from './srs.js';

// Quy ước đúng / sai duy nhất:
// Again (1) = sai; Hard (2), Good (3), Easy (4) = đúng.
export const RATING_CORRECT: Record<number, boolean> = {
  [RATING.AGAIN]: false,
  [RATING.HARD]: true,
  [RATING.GOOD]: true,
  [RATING.EASY]: true,
};

export function isCorrectRating(rating: number): boolean {
  return rating === RATING.HARD || rating === RATING.GOOD || rating === RATING.EASY;
}

// Chuyển timestamp ms thành chuỗi ngày 'YYYY-MM-DD' theo múi giờ tz (mặc định lấy hệ thống).
export function dayKey(timestamp: number, tz?: string): string {
  const d = new Date(timestamp);
  if (tz) {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(d);
    const y = parts.find(p => p.type === 'year')?.value;
    const m = parts.find(p => p.type === 'month')?.value;
    const day = parts.find(p => p.type === 'day')?.value;
    return `${y}-${m}-${day}`;
  }
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function resolveEffectiveLog(log: any[] = []): any[] {
  if (!Array.isArray(log) || log.length === 0) return [];

  const overrides = new Map<number, any>();
  for (let i = 0; i < log.length; i++) {
    const entry = log[i];
    if (entry && entry.override === true && entry.of != null) {
      overrides.set(entry.of, entry);
    }
  }

  const effective: any[] = [];
  for (let i = 0; i < log.length; i++) {
    const entry = log[i];
    if (!entry || entry.override === true) continue;

    const ov = overrides.get(entry.t);
    if (ov) {
      effective.push({
        ...entry,
        rating: ov.rating ?? entry.rating,
        ms: ov.ms ?? entry.ms,
        overridden: true,
      });
    } else {
      effective.push(entry);
    }
  }

  return effective;
}

export function parseCardKey(key: unknown): { deckId: string; itemId: string; direction: string } {
  if (typeof key !== 'string') return { deckId: '', itemId: '', direction: 'fwd' };
  const parts = key.split(':');
  if (parts.length >= 3) {
    return {
      deckId: parts[0],
      itemId: parts.slice(1, -1).join(':'),
      direction: parts[parts.length - 1] || 'fwd',
    };
  }
  if (parts.length === 2) {
    return { deckId: parts[0], itemId: parts[1], direction: 'fwd' };
  }
  return { deckId: key, itemId: key, direction: 'fwd' };
}

export function streak(progress: any, { now = Date.now(), tz }: { now?: number; tz?: string } = {}): { current: number; longest: number } {
  const log = resolveEffectiveLog(progress?.log);
  if (!log.length) return { current: 0, longest: 0 };

  const activeDaysSet = new Set<string>();
  for (let i = 0; i < log.length; i++) {
    activeDaysSet.add(dayKey(log[i].t, tz));
  }

  const sortedDays = [...activeDaysSet].sort();
  if (!sortedDays.length) return { current: 0, longest: 0 };

  let longest = 0;
  let currentRun = 0;
  let prevDate: Date | null = null;

  for (let i = 0; i < sortedDays.length; i++) {
    const dStr = sortedDays[i];
    const parts = dStr.split('-').map(Number);
    const dateObj = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));

    if (prevDate) {
      const diffMs = dateObj.getTime() - prevDate.getTime();
      const diffDays = Math.round(diffMs / 86400000);
      if (diffDays === 1) {
        currentRun++;
      } else {
        currentRun = 1;
      }
    } else {
      currentRun = 1;
    }
    prevDate = dateObj;
    if (currentRun > longest) longest = currentRun;
  }

  const todayStr = dayKey(now, tz);
  const todayParts = todayStr.split('-').map(Number);
  const todayUtc = new Date(Date.UTC(todayParts[0], todayParts[1] - 1, todayParts[2]));

  const yesterdayUtc = new Date(todayUtc.getTime() - 86400000);
  const yY = yesterdayUtc.getUTCFullYear();
  const yM = String(yesterdayUtc.getUTCMonth() + 1).padStart(2, '0');
  const yD = String(yesterdayUtc.getUTCDate()).padStart(2, '0');
  const yesterdayStr = `${yY}-${yM}-${yD}`;

  let current = 0;
  let checkUtc: Date | null = null;

  if (activeDaysSet.has(todayStr)) {
    checkUtc = todayUtc;
  } else if (activeDaysSet.has(yesterdayStr)) {
    checkUtc = yesterdayUtc;
  } else {
    return { current: 0, longest };
  }

  while (true) {
    const cY = checkUtc.getUTCFullYear();
    const cM = String(checkUtc.getUTCMonth() + 1).padStart(2, '0');
    const cD = String(checkUtc.getUTCDate()).padStart(2, '0');
    const cStr = `${cY}-${cM}-${cD}`;

    if (activeDaysSet.has(cStr)) {
      current++;
      checkUtc = new Date(checkUtc.getTime() - 86400000);
    } else {
      break;
    }
  }

  return { current, longest: Math.max(longest, current) };
}

export function reviewsPerDay(progress: any, days = 30, { now = Date.now(), tz }: { now?: number; tz?: string } = {}): any[] {
  const log = resolveEffectiveLog(progress?.log);
  const safeDays = Math.max(1, Math.min(365, Math.floor(days)));

  const todayStr = dayKey(now, tz);
  const todayParts = todayStr.split('-').map(Number);
  const todayUtc = new Date(Date.UTC(todayParts[0], todayParts[1] - 1, todayParts[2]));

  const result: any[] = [];
  const dayIndexMap = new Map<string, number>();

  for (let i = safeDays - 1; i >= 0; i--) {
    const d = new Date(todayUtc.getTime() - i * 86400000);
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, '0');
    const day = String(d.getUTCDate()).padStart(2, '0');
    const key = `${y}-${m}-${day}`;
    dayIndexMap.set(key, result.length);
    result.push({
      date: key,
      total: 0,
      correct: 0,
      incorrect: 0,
    });
  }

  for (let i = 0; i < log.length; i++) {
    const entry = log[i];
    const key = dayKey(entry.t, tz);
    const idx = dayIndexMap.get(key);
    if (idx !== undefined) {
      const row = result[idx];
      row.total++;
      if (isCorrectRating(entry.rating)) {
        row.correct++;
      } else {
        row.incorrect++;
      }
    }
  }

  return result;
}

export function heatmap(progress: any, days = 90, { now = Date.now(), tz }: { now?: number; tz?: string } = {}): any[] {
  const rpd = reviewsPerDay(progress, days, { now, tz });
  let max = 0;
  for (let i = 0; i < rpd.length; i++) {
    if (rpd[i].total > max) max = rpd[i].total;
  }

  return rpd.map(d => {
    let level = 0;
    if (d.total > 0) {
      if (max <= 4) {
        level = Math.min(4, d.total);
      } else {
        const ratio = d.total / max;
        if (ratio <= 0.25) level = 1;
        else if (ratio <= 0.5) level = 2;
        else if (ratio <= 0.75) level = 3;
        else level = 4;
      }
    }
    return {
      date: d.date,
      count: d.total,
      correct: d.correct,
      incorrect: d.incorrect,
      level,
    };
  });
}

export function accuracyByDeck(progress: any, decks: any[] = [], { filterDeckId = null }: { filterDeckId?: string | null } = {}): any[] {
  const log = resolveEffectiveLog(progress?.log);
  const titles = new Map<string, string>();
  if (Array.isArray(decks)) {
    for (const d of decks) {
      const id = d?.meta?.id || d?.id;
      if (id) titles.set(id, d?.meta?.title || d?.title || id);
    }
  }

  const map = new Map<string, any>();

  for (let i = 0; i < log.length; i++) {
    const entry = log[i];
    const { deckId } = parseCardKey(entry.card);
    if (filterDeckId && deckId !== filterDeckId) continue;

    let stat = map.get(deckId);
    if (!stat) {
      stat = {
        deckId,
        title: titles.get(deckId) || deckId,
        total: 0,
        correct: 0,
        incorrect: 0,
      };
      map.set(deckId, stat);
    }

    stat.total++;
    if (isCorrectRating(entry.rating)) {
      stat.correct++;
    } else {
      stat.incorrect++;
    }
  }

  return [...map.values()].map(s => ({
    ...s,
    accuracy: s.total > 0 ? Math.round((s.correct / s.total) * 100) : 0,
  })).sort((a, b) => b.total - a.total);
}

export function accuracyByTopic(progress: any, { deckId = null, itemsLookup = null }: { deckId?: string | null; itemsLookup?: any } = {}): any[] {
  const log = resolveEffectiveLog(progress?.log);

  const topicMap = new Map<string, string>();
  if (itemsLookup instanceof Map) {
    for (const [k, v] of itemsLookup.entries()) topicMap.set(k, v);
  } else if (itemsLookup && typeof itemsLookup === 'object') {
    for (const [k, v] of Object.entries(itemsLookup)) topicMap.set(k, v as string);
  }

  const map = new Map<string, any>();

  for (let i = 0; i < log.length; i++) {
    const entry = log[i];
    const info = parseCardKey(entry.card);
    if (deckId && info.deckId !== deckId) continue;

    const rawTopic = topicMap.get(info.itemId);
    const topic = (typeof rawTopic === 'string' && rawTopic.trim()) ? rawTopic.trim() : 'Khác';

    let stat = map.get(topic);
    if (!stat) {
      stat = { topic, total: 0, correct: 0, incorrect: 0 };
      map.set(topic, stat);
    }

    stat.total++;
    if (isCorrectRating(entry.rating)) {
      stat.correct++;
    } else {
      stat.incorrect++;
    }
  }

  return [...map.values()].map(s => ({
    ...s,
    accuracy: s.total > 0 ? Math.round((s.correct / s.total) * 100) : 0,
  })).sort((a, b) => b.total - a.total);
}

export function leeches(cards: any = {}, { threshold = 8, deckId = null }: { threshold?: number; deckId?: string | null } = {}): any[] {
  const list: any[] = [];
  const entries = Object.entries(cards || {});

  for (let i = 0; i < entries.length; i++) {
    const [key, card] = entries[i] as [string, any];
    if (!card) continue;
    const lapses = Number(card.lapses || 0);
    if (lapses >= threshold) {
      const parsed = parseCardKey(key);
      if (deckId && parsed.deckId !== deckId) continue;

      list.push({
        cardKey: key,
        deckId: parsed.deckId,
        itemId: parsed.itemId,
        direction: parsed.direction,
        lapses,
        reps: Number(card.reps || 0),
        ease: Number(card.ease || 2.5),
        interval: Number(card.interval || 0),
        state: card.state || 'new',
        due: Number(card.due || 0),
      });
    }
  }

  list.sort((a, b) => b.lapses - a.lapses);
  return list;
}

export function summary(progress: any, decks: any[] = [], { now = Date.now(), tz }: { now?: number; tz?: string } = {}): any {
  const log = resolveEffectiveLog(progress?.log);
  const cards = progress?.cards || {};

  const st = streak(progress, { now, tz });
  const todayKey = dayKey(now, tz);

  let todayCount = 0;
  const sevenDaysAgo = now - 7 * 86400000;
  let correct7d = 0;
  let total7d = 0;

  for (let i = 0; i < log.length; i++) {
    const entry = log[i];
    if (dayKey(entry.t, tz) === todayKey) {
      todayCount++;
    }
    if (entry.t >= sevenDaysAgo && entry.t <= now) {
      total7d++;
      if (isCorrectRating(entry.rating)) correct7d++;
    }
  }

  const accuracy7d = total7d > 0 ? Math.round((correct7d / total7d) * 100) : 0;

  let totalStudied = 0;
  let masteredCards = 0;

  for (const card of Object.values(cards) as any[]) {
    if (!card) continue;
    if (card.reps > 0 || (card.state && card.state !== 'new')) {
      totalStudied++;
    }
    if (card.state === 'review' && (card.due || 0) > now) {
      masteredCards++;
    }
  }

  return {
    currentStreak: st.current,
    longestStreak: st.longest,
    todayCount,
    accuracy7d,
    total7d,
    totalStudied,
    masteredCards,
  };
}

