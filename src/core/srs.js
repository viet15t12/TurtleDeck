// src/core/srs.js — Thuật toán lặp lại ngắt quãng SM-2 + learning steps (hàm thuần, ES module).
// Theo study-app.md mục 4.1, 7.5, 8.

export const DAY = 86400000;
export const MINUTE = 60000;
export const DEFAULT_LEARN_STEPS = [1, 10]; // phút

export const RATING = {
  AGAIN: 1,
  HARD: 2,
  GOOD: 3,
  EASY: 4,
};

let configuredLearnSteps = [...DEFAULT_LEARN_STEPS];

// Chuẩn hoá danh sách bước học (phút) từ mảng hoặc chuỗi (vd "1, 10" hoặc [1, 10])
export function parseLearnSteps(input, fallback = DEFAULT_LEARN_STEPS) {
  let raw = input;
  if (typeof raw === 'string') {
    raw = raw.split(/[\s,;]+/).filter(Boolean).map(Number);
  }
  if (!Array.isArray(raw)) return [...fallback];
  const valid = raw.map(Number).filter(n => Number.isFinite(n) && n > 0);
  return valid.length > 0 ? valid : [...fallback];
}

export function setLearnSteps(steps) {
  configuredLearnSteps = parseLearnSteps(steps, DEFAULT_LEARN_STEPS);
  return [...configuredLearnSteps];
}

export function getLearnSteps() {
  return [...configuredLearnSteps];
}

function resolveSteps(opts) {
  if (Array.isArray(opts)) return parseLearnSteps(opts, configuredLearnSteps);
  if (opts && typeof opts === 'object' && opts.learnSteps !== undefined) {
    return parseLearnSteps(opts.learnSteps, configuredLearnSteps);
  }
  return configuredLearnSteps;
}

// Khoá thẻ: deckId:itemId:direction (deckId = meta.id, direction mặc định 'fwd')
export function cardKey(deckId, itemId, direction = 'fwd') {
  return `${deckId}:${itemId}:${direction || 'fwd'}`;
}

export function newCard() {
  return {
    state: 'new',
    step: 0,
    ease: 2.5,
    interval: 0,
    due: 0,
    reps: 0,
    lapses: 0,
  };
}

// rating: 1=Again 2=Hard 3=Good 4=Easy
export function schedule(card, rating, now = Date.now(), opts = {}) {
  const steps = resolveSteps(opts);
  const c = { ...newCard(), ...(card || {}) };
  const wasRelearning = c.state === 'relearning';

  if (c.state === 'new' || c.state === 'learning' || c.state === 'relearning') {
    if (rating === 1) {
      c.state = wasRelearning ? 'relearning' : 'learning';
      c.step = 0;
    } else if (rating === 4) {
      c.step = steps.length;
    } else if (rating === 3) {
      c.step = (c.step || 0) + 1;
    } else if (rating === 2) {
      c.step = Math.min(c.step || 0, Math.max(0, steps.length - 1));
    }

    if (c.step >= steps.length) {
      c.state = 'review';
      // Khi thẻ relearning tốt nghiệp: giữ interval đã giảm lúc lapse (tối thiểu 1 ngày)
      if (wasRelearning) {
        const reduced = Math.max(1, Math.round(c.interval || 1));
        c.interval = rating === 4 ? Math.max(reduced, Math.round(reduced * 1.3)) : reduced;
      } else {
        c.interval = rating === 4 ? 4 : 1;
      }
      c.due = now + c.interval * DAY;
    } else {
      c.state = wasRelearning ? 'relearning' : 'learning';
      c.due = now + steps[c.step] * MINUTE;
    }
    return c;
  }

  // state === 'review'
  if (rating === 1) {
    c.state = 'relearning';
    c.step = 0;
    c.lapses = (c.lapses || 0) + 1;
    c.ease = Math.max(1.3, (c.ease ?? 2.5) - 0.2);
    c.interval = Math.max(1, Math.round((c.interval || 1) * 0.5));
    c.due = now + steps[0] * MINUTE;
  } else {
    const mult = rating === 2 ? 1.2 : rating === 4 ? c.ease * 1.3 : c.ease;
    c.interval = Math.max(c.interval + 1, Math.round(c.interval * mult));
    if (rating === 2) c.ease = Math.max(1.3, c.ease - 0.15);
    if (rating === 4) c.ease += 0.15;
    c.reps = (c.reps || 0) + 1;
    c.due = now + c.interval * DAY;
  }
  return c;
}

export const isDue = (c, now = Date.now()) => Boolean(c && c.state !== 'new' && c.due <= now);

// Quy đổi kết quả chấm điểm sang rating (đúng / gần đúng -> Good 3, sai -> Again 1)
export function ratingFromGrade(grade, explicitRating) {
  if (explicitRating === 1 || explicitRating === 2 || explicitRating === 3 || explicitRating === 4) {
    return explicitRating;
  }
  return grade?.ok ? RATING.GOOD : RATING.AGAIN;
}

// Nhãn khoảng thời gian ôn tiếp theo cho giao diện nút chấm Flashcard
export function previewIntervalLabel(card, rating, now = Date.now(), opts = {}) {
  const next = schedule(card || newCard(), rating, now, opts);
  const diffMs = Math.max(0, next.due - now);
  if (next.state === 'learning' || next.state === 'relearning') {
    const mins = Math.max(1, Math.round(diffMs / MINUTE));
    return `${mins} phút`;
  }
  const days = Math.max(1, next.interval || Math.round(diffMs / DAY));
  return `${days} ngày`;
}

// Ghi nhận 1 lượt trả lời vào đối tượng progress ({ version, cards, meta, log }).
// Nếu persist === false ("Học thử" từ Editor), bỏ qua toàn bộ việc cập nhật cards và log.
export function recordReview(progress, {
  deckId,
  itemId,
  direction = 'fwd',
  rating,
  ms = 0,
  now = Date.now(),
  learnSteps,
  persist = true,
} = {}) {
  const safeProgress = {
    version: 1,
    cards: { ...(progress?.cards || {}) },
    meta: { ...(progress?.meta || {}) },
    log: Array.isArray(progress?.log) ? [...progress.log] : [],
  };

  if (persist === false) {
    return {
      progress: safeProgress,
      key: deckId && itemId ? cardKey(deckId, itemId, direction) : null,
      card: null,
      logEntry: null,
      persisted: false,
    };
  }

  const key = cardKey(deckId, itemId, direction);
  const prevCard = safeProgress.cards[key] || newCard();
  const nextCard = schedule(prevCard, rating, now, { learnSteps });
  const logEntry = {
    t: now,
    card: key,
    rating,
    ms: Math.max(0, Math.round(Number(ms) || 0)),
  };

  safeProgress.cards[key] = nextCard;
  safeProgress.log.push(logEntry);

  return {
    progress: safeProgress,
    key,
    card: nextCard,
    logEntry,
    persisted: true,
  };
}

// Xoá tiến trình học (đặt lại về trạng thái ban đầu).
// deckId = null hoặc 'all': xoá toàn bộ tiến trình của tất cả bộ thẻ.
// deckId = string cụ thể: chỉ xoá tiến trình của bộ thẻ đó.
export function clearProgress(progress, deckId = null) {
  if (!deckId || deckId === 'all') {
    return {
      version: 1,
      cards: {},
      meta: {},
      log: [],
    };
  }

  const prefix = `${deckId}:`;
  const cards = {};
  for (const [k, v] of Object.entries(progress?.cards || {})) {
    if (!k.startsWith(prefix)) {
      cards[k] = v;
    }
  }

  const meta = { ...(progress?.meta || {}) };
  delete meta[deckId];

  const log = Array.isArray(progress?.log)
    ? progress.log.filter(entry => entry && !String(entry.card || '').startsWith(prefix))
    : [];

  return {
    version: 1,
    cards,
    meta,
    log,
  };
}


