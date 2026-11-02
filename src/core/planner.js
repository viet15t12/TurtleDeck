// src/core/planner.js — Chọn câu hỏi cho phiên học SRS (due → learning → new) và chèn lại câu sai.
// Theo study-app.md mục 4.4 và study-app-phases.md GĐ3. Hàm thuần, ES module, nhận `now` để test.

import { validateItem, hasError } from './validate.js';
import { buildQuestion } from './builder.js';
import { cardKey, newCard } from './srs.js';

export const DEFAULT_NEW_CARDS_PER_DAY = 20;

// Tính chuỗi ngày địa phương 'YYYY-MM-DD' từ timestamp ms.
// Nếu truyền timeZone (vd 'Asia/Saigon'), dùng Intl.DateTimeFormat; mặc định dùng giờ địa phương của hệ thống.
export function localDayKey(now = Date.now(), timeZone) {
  const d = new Date(now);
  if (timeZone) {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone,
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

// Đếm số thẻ mới đã bắt đầu học trong ngày địa phương của `now` dựa trên `log`.
// Mỗi khoá thẻ (deckId:itemId:direction) xuất hiện lần đầu tiên trong log vào ngày hôm nay được tính là 1 thẻ mới.
export function countNewStudiedToday(log = [], now = Date.now(), { deckId, cards, timeZone } = {}) {
  if (!Array.isArray(log) || log.length === 0) return 0;
  const today = localDayKey(now, timeZone);
  const seenBeforeToday = new Set();
  const studiedToday = new Set();

  const sorted = [...log]
    .filter(e => e && typeof e.t === 'number' && typeof e.card === 'string')
    .sort((a, b) => a.t - b.t);

  for (const entry of sorted) {
    if (deckId && entry.card.includes(':') && !entry.card.startsWith(`${deckId}:`)) continue;
    const day = localDayKey(entry.t, timeZone);
    if (day === today) {
      if (entry.isNew === false) continue;
      if (!seenBeforeToday.has(entry.card)) {
        studiedToday.add(entry.card);
      }
    } else if (day < today) {
      seenBeforeToday.add(entry.card);
    }
  }

  // Nếu có bảng cards: loại trừ các thẻ đã ở trạng thái review từ ngày trước (reps > 0 hoặc lapses > 0)
  // trong trường hợp log của các ngày trước đã bị cắt hoặc không được truyền vào.
  if (cards && typeof cards === 'object') {
    for (const cKey of [...studiedToday]) {
      const c = cards[cKey];
      const todayLogs = sorted.filter(e => e.card === cKey && localDayKey(e.t, timeZone) === today);
      const explicitNew = todayLogs.some(e => e.isNew === true);
      if (!explicitNew && c && (c.reps > 1 || c.lapses > 0 || (c.interval || 0) > 4) && todayLogs.length === 1) {
        studiedToday.delete(cKey);
      }
    }
  }

  return studiedToday.size;
}

// Chuẩn hoá tham số đầu vào cho planner
function normalizePlanArgs(deckOrItems, progress = {}, now = Date.now(), opts = {}) {
  if (deckOrItems && typeof deckOrItems === 'object' && !Array.isArray(deckOrItems) && ('deck' in deckOrItems || (!('items' in deckOrItems) && !('meta' in deckOrItems)))) {
    const cfg = deckOrItems;
    return normalizePlanArgs(
      cfg.deck || cfg.items || [],
      cfg.progress || { cards: cfg.cards || {}, log: cfg.log || [] },
      cfg.now ?? Date.now(),
      cfg
    );
  }

  const isDeckObj = deckOrItems && typeof deckOrItems === 'object' && !Array.isArray(deckOrItems);
  const items = isDeckObj ? (deckOrItems.items || []) : (Array.isArray(deckOrItems) ? deckOrItems : []);
  const deckId = opts.deckId ?? (isDeckObj ? deckOrItems.meta?.id : undefined) ?? 'deck';
  const deckKind = opts.deckKind ?? (isDeckObj ? deckOrItems.meta?.kind : undefined);

  const cards = (progress && typeof progress === 'object' && 'cards' in progress)
    ? (progress.cards || {})
    : (progress || {});
  const log = opts.log ?? (progress && Array.isArray(progress.log) ? progress.log : []);

  const rawLimit = opts.newCardsPerDay ?? DEFAULT_NEW_CARDS_PER_DAY;
  const newCardsPerDay = Number.isFinite(Number(rawLimit)) && Number(rawLimit) >= 0
    ? Math.floor(Number(rawLimit))
    : DEFAULT_NEW_CARDS_PER_DAY;

  const defaultDir = deckKind === 'vocab' ? 'both' : 'fwd';
  const direction = opts.direction || defaultDir;
  const timeZone = opts.timeZone;

  return {
    items,
    deckId,
    deckKind,
    cards,
    log,
    now,
    newCardsPerDay,
    direction,
    timeZone,
    count: opts.count,
    mode: opts.mode,
  };
}

// Lọc các item hợp lệ trong deck (bỏ qua item có lỗi validateItem)
export function getValidDeckItems(deckOrItems, deckKind) {
  const isDeckObj = deckOrItems && typeof deckOrItems === 'object' && !Array.isArray(deckOrItems);
  const items = isDeckObj ? (deckOrItems.items || []) : (Array.isArray(deckOrItems) ? deckOrItems : []);
  const kind = deckKind ?? (isDeckObj ? deckOrItems.meta?.kind : undefined);
  return items.filter(it => !hasError(validateItem(it, { deckKind: kind })));
}

// Tính thống kê số thẻ đến hạn hôm nay / thẻ mới của một bộ thẻ (dùng cho Home & Deck view)
export function deckDueCounts(deckOrItems, progress = {}, now = Date.now(), opts = {}) {
  const {
    items,
    deckId,
    deckKind,
    cards,
    log,
    newCardsPerDay,
    direction,
    timeZone,
  } = normalizePlanArgs(deckOrItems, progress, now, opts);

  const validItems = getValidDeckItems(items, deckKind);
  let due = 0;
  let learning = 0;
  let newAvailable = 0;

  const directions = deckKind === 'vocab'
    ? (direction === 'fwd' || direction === 'rev' ? [direction] : ['fwd', 'rev'])
    : ['fwd'];

  for (const item of validItems) {
    for (const d of directions) {
      const key = cardKey(deckId, item.id, d);
      const card = cards[key] || (d === 'fwd' && cards[item.id] ? cards[item.id] : newCard());
      if (card.state === 'review') {
        if (card.due <= now) due++;
      } else if (card.state === 'learning' || card.state === 'relearning') {
        learning++;
      } else {
        newAvailable++;
      }
    }
  }

  const newStudiedToday = countNewStudiedToday(log, now, { deckId, cards, timeZone });
  const remainingQuota = Math.max(0, newCardsPerDay - newStudiedToday);
  const newToday = Math.min(newAvailable, remainingQuota);

  return {
    due,
    learning,
    dueToday: due + learning,
    newAvailable,
    newStudiedToday,
    newToday,
    total: validItems.length * directions.length,
  };
}

// Chọn câu hỏi cho phiên học SRS theo thứ tự:
// 1. due (state === 'review' && due <= now, quá hạn lâu nhất trước)
// 2. learning (state === 'learning' | 'relearning', due nhỏ hơn trước)
// 3. new (state === 'new', tối đa N thẻ mới/ngày trừ số thẻ mới đã học hôm nay từ log)
// Item đã xoá khỏi deck tự động bị bỏ qua; item không hợp lệ (validateItem có error) bị bỏ qua.
export function planSession(deckOrItems, progress = {}, now = Date.now(), opts = {}) {
  const {
    items,
    deckId,
    deckKind,
    cards,
    log,
    newCardsPerDay,
    direction,
    timeZone,
    count,
  } = normalizePlanArgs(deckOrItems, progress, now, opts);

  const validItems = getValidDeckItems(items, deckKind);

  const dueBucket = [];
  const learningBucket = [];
  const newBucket = [];

  // Tập các thẻ đã có log lần đầu trong ngày hôm nay (phòng trường hợp test chỉ truyền log mà chưa cập nhật cards)
  const today = localDayKey(now, timeZone);
  const loggedTodayKeys = new Set(
    (log || [])
      .filter(e => e && typeof e.t === 'number' && typeof e.card === 'string' && localDayKey(e.t, timeZone) === today)
      .map(e => e.card)
  );

  const directions = deckKind === 'vocab'
    ? (direction === 'fwd' || direction === 'rev' ? [direction] : ['fwd', 'rev'])
    : ['fwd'];

  validItems.forEach((item, index) => {
    for (const d of directions) {
      const q = buildQuestion(item, { mode: opts.mode, dir: d, allItems: validItems });
      if (!q) continue;
      const key = cardKey(deckId, item.id, d);
      const rawCard = cards[key] || (d === 'fwd' && cards[item.id] ? cards[item.id] : null);
      const card = rawCard ? { ...newCard(), ...rawCard } : newCard();

      const entry = {
        ...q,
        item,
        itemId: item.id,
        deckId,
        direction: d,
        key,
        card,
        due: card.due,
        _order: index * 2 + (d === 'rev' ? 1 : 0),
      };

      if (card.state === 'review') {
        if (card.due <= now) {
          dueBucket.push({ ...entry, category: 'due' });
        }
      } else if (card.state === 'learning' || card.state === 'relearning') {
        learningBucket.push({ ...entry, category: 'learning' });
      } else if (!rawCard && loggedTodayKeys.has(key)) {
        // Đã được học hôm nay trong log
      } else {
        newBucket.push({ ...entry, category: 'new' });
      }
    }
  });

  // 1. Sắp xếp due: quá hạn lâu nhất trước (due tăng dần)
  dueBucket.sort((a, b) => (a.card.due - b.card.due) || (a._order - b._order));

  // 2. Sắp xếp learning: đến hạn sớm hơn trước (due tăng dần)
  learningBucket.sort((a, b) => ((a.card.due || 0) - (b.card.due || 0)) || (a._order - b._order));

  // 3. Giới hạn thẻ mới theo ngày địa phương
  const studiedToday = countNewStudiedToday(log, now, { deckId, cards, timeZone });
  const remainingNew = Math.max(0, newCardsPerDay - studiedToday);
  const selectedNew = newBucket.slice(0, remainingNew);

  let planned = [...dueBucket, ...learningBucket, ...selectedNew].map(e => {
    const copy = { ...e };
    delete copy._order;
    return copy;
  });

  // Đảm bảo không xếp 2 câu cùng itemId cạnh nhau nếu có thể
  if (planned.length > 2) {
    for (let i = 0; i < planned.length - 1; i++) {
      if (planned[i].itemId === planned[i + 1].itemId) {
        const swapIdx = planned.findIndex((e, idx) => idx > i + 1 && e.itemId !== planned[i].itemId);
        if (swapIdx !== -1) {
          const temp = planned[i + 1];
          planned[i + 1] = planned[swapIdx];
          planned[swapIdx] = temp;
        }
      }
    }
  }

  const maxCount = Number(count);
  if (maxCount > 0 && maxCount < planned.length) {
    planned = planned.slice(0, maxCount);
  }

  return planned;
}

// Chèn lại câu trả lời sai vào hàng đợi sau 3–7 câu khác trong cùng phiên.
// Hỗ trợ cả 2 kiểu gọi:
// - reinsertWrong(queue, currentIndex, opts): đang ở vị trí `currentIndex` trong mảng `queue`
// - reinsertWrong(queue, wrongItem, opts): `wrongItem` vừa được lấy ra khỏi đầu `queue`
export function reinsertWrong(queue, currentIndexOrItem, opts = {}) {
  if (!Array.isArray(queue)) return [];
  const minGap = Number.isInteger(opts.minGap) ? opts.minGap : 3;
  const maxGap = Number.isInteger(opts.maxGap) ? opts.maxGap : 6; // 3..6 câu xen giữa => khoảng cách chỉ số 4..7 (đều thuộc [3, 7])
  const rand = typeof opts.rand === 'function' ? opts.rand : Math.random;

  const span = Math.max(0, maxGap - minGap);
  const gap = minGap + Math.min(span, Math.floor(rand() * (span + 1)));

  let wrongItem;
  let baseIndex;
  if (typeof currentIndexOrItem === 'number') {
    baseIndex = currentIndexOrItem;
    wrongItem = queue[baseIndex];
    if (!wrongItem) return queue;
  } else {
    baseIndex = -1;
    wrongItem = currentIndexOrItem;
    if (!wrongItem) return queue;
  }

  const clone = typeof wrongItem === 'object' && wrongItem !== null
    ? { ...wrongItem, retry: true, retryCount: (wrongItem.retryCount || 0) + 1 }
    : wrongItem;

  // Chèn sau `gap` câu khác tính từ sau `baseIndex`
  // Lưu ý: nếu cuối hàng đợi có ít hơn `minGap` câu thì chèn vào cuối hàng đợi,
  // còn nếu đủ câu thì đảm bảo cách ít nhất `minGap` câu khác.
  const targetIndex = Math.min(queue.length, baseIndex + 1 + gap);
  queue.splice(targetIndex, 0, clone);
  return queue;
}

// Re-export learn mastery (study-app-phases.md GĐ5)
export {
  LEARN_STAGES,
  QUIZ_LEARN_STAGES,
  getStagesForKind,
  nextStage,
  pickNext,
  initLearnQueue,
  buildLearnQuestion,
  graduateToSRS,
} from './learnplanner.js';


