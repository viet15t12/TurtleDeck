// src/core/progressio.js — Xuất/Nhập và Sao lưu tiến độ học tập (hàm thuần, ES module, test được bằng node --test).
// Theo study-app.md mục 8 và yêu cầu Giai đoạn 6.

import { schedule, RATING, newCard, cardKey } from './srs.js';
import { dayKey } from './stats.js';

export const CURRENT_FORMAT_VERSION = 1;
export const MAX_CARDS_LIMIT = 100000;
export const MAX_LOG_LIMIT = 500000;
export const MAX_NOTE_LENGTH = 2000;

export function exportProgress(progress, exportedAt = new Date().toISOString()) {
  return {
    app: 'study-app',
    formatVersion: CURRENT_FORMAT_VERSION,
    exportedAt,
    progress: {
      version: 1,
      cards: { ...(progress?.cards || {}) },
      meta: { ...(progress?.meta || {}) },
      log: Array.isArray(progress?.log) ? [...progress.log] : [],
    },
  };
}

export function validateProgress(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return { ok: false, error: 'Dữ liệu tiến độ phải là một đối tượng JSON.' };
  }

  // Hỗ trợ cả file export đầy đủ { app, formatVersion, progress } lẫn đối tượng progress trực tiếp
  let prog = data.progress || data;
  if (!prog || typeof prog !== 'object' || Array.isArray(prog)) {
    return { ok: false, error: 'Không tìm thấy dữ liệu tiến trình (progress) trong file.' };
  }

  if (data.formatVersion !== undefined) {
    if (!Number.isInteger(data.formatVersion) || data.formatVersion > CURRENT_FORMAT_VERSION || data.formatVersion < 1) {
      return { ok: false, error: `Phiên bản định dạng tệp (${data.formatVersion}) không được ứng dụng hỗ trợ.` };
    }
  }

  if (prog.version !== undefined && prog.version > 1) {
    return { ok: false, error: `Phiên bản tiến độ (${prog.version}) mới hơn phiên bản ứng dụng hiện tại.` };
  }

  // Validate cards
  const cards = prog.cards;
  if (cards !== undefined) {
    if (typeof cards !== 'object' || cards === null || Array.isArray(cards)) {
      return { ok: false, error: 'Trường "cards" phải là một đối tượng.' };
    }
    const cardKeys = Object.keys(cards);
    if (cardKeys.length > MAX_CARDS_LIMIT) {
      return { ok: false, error: `Số lượng thẻ vượt quá giới hạn an toàn (${MAX_CARDS_LIMIT} thẻ).` };
    }

    const validStates = new Set(['new', 'learning', 'review', 'relearning']);

    for (let i = 0; i < cardKeys.length; i++) {
      const key = cardKeys[i];
      if (typeof key !== 'string' || !key.trim()) {
        return { ok: false, error: `Khoá thẻ không hợp lệ tại vị trí ${i}.` };
      }
      const c = cards[key];
      if (!c || typeof c !== 'object' || Array.isArray(c)) {
        return { ok: false, error: `Trạng thái thẻ "${key}" không phải là đối tượng hợp lệ.` };
      }
      if (c.state !== undefined && !validStates.has(c.state)) {
        return { ok: false, error: `Trạng thái state "${c.state}" của thẻ "${key}" không hợp lệ.` };
      }
      if (c.ease !== undefined && (!Number.isFinite(c.ease) || c.ease < 1.0 || c.ease > 10.0)) {
        return { ok: false, error: `Chỉ số ease của thẻ "${key}" phải nằm trong khoảng từ 1.0 đến 10.0.` };
      }
      if (c.reps !== undefined && (!Number.isInteger(c.reps) || c.reps < 0)) {
        return { ok: false, error: `Số lần ôn reps của thẻ "${key}" phải là số nguyên không âm.` };
      }
      if (c.lapses !== undefined && (!Number.isInteger(c.lapses) || c.lapses < 0)) {
        return { ok: false, error: `Số lần quên lapses của thẻ "${key}" phải là số nguyên không âm.` };
      }
      if (c.interval !== undefined && (!Number.isFinite(c.interval) || c.interval < 0)) {
        return { ok: false, error: `Khoảng cách ôn interval của thẻ "${key}" không hợp lệ.` };
      }
      if (c.due !== undefined && !Number.isFinite(c.due)) {
        return { ok: false, error: `Thời điểm đến hạn due của thẻ "${key}" không hợp lệ.` };
      }
    }
  }

  // Validate meta (sao và ghi chú cá nhân)
  const meta = prog.meta;
  if (meta !== undefined) {
    if (typeof meta !== 'object' || meta === null || Array.isArray(meta)) {
      return { ok: false, error: 'Trường "meta" phải là một đối tượng.' };
    }
    for (const [k, v] of Object.entries(meta)) {
      if (typeof k !== 'string' || !k.trim()) {
        return { ok: false, error: 'Khoá meta không hợp lệ.' };
      }
      if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
        if (v.starred !== undefined && typeof v.starred !== 'boolean') {
          return { ok: false, error: `Trường starred của meta "${k}" phải là kiểu boolean.` };
        }
        if (v.note !== undefined && typeof v.note !== 'string') {
          return { ok: false, error: `Trường note của meta "${k}" phải là chuỗi văn bản.` };
        }
        if (v.note && v.note.length > MAX_NOTE_LENGTH) {
          return { ok: false, error: `Ghi chú cho "${k}" vượt quá độ dài tối đa (${MAX_NOTE_LENGTH} ký tự).` };
        }
      }
    }
  }

  // Validate log
  const log = prog.log;
  if (log !== undefined) {
    if (!Array.isArray(log)) {
      return { ok: false, error: 'Trường "log" phải là một mảng.' };
    }
    if (log.length > MAX_LOG_LIMIT) {
      return { ok: false, error: `Số lượng bản ghi log vượt quá giới hạn an toàn (${MAX_LOG_LIMIT} dòng).` };
    }
    for (let i = 0; i < log.length; i++) {
      const entry = log[i];
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
        return { ok: false, error: `Dòng log thứ ${i + 1} không phải là đối tượng hợp lệ.` };
      }
      if (typeof entry.t !== 'number' || !Number.isFinite(entry.t) || entry.t <= 0) {
        return { ok: false, error: `Thời điểm t ở dòng log thứ ${i + 1} không hợp lệ.` };
      }
      if (typeof entry.card !== 'string' || !entry.card.trim()) {
        return { ok: false, error: `Khoá card ở dòng log thứ ${i + 1} không hợp lệ.` };
      }
      if (entry.rating !== undefined && (!Number.isInteger(entry.rating) || entry.rating < 1 || entry.rating > 4)) {
        return { ok: false, error: `Đánh giá rating ở dòng log thứ ${i + 1} phải từ 1 đến 4.` };
      }
      if (entry.ms !== undefined && (!Number.isFinite(entry.ms) || entry.ms < 0)) {
        return { ok: false, error: `Thời gian ms ở dòng log thứ ${i + 1} không hợp lệ.` };
      }
    }
  }

  return {
    ok: true,
    progress: {
      version: 1,
      cards: { ...(prog.cards || {}) },
      meta: { ...(prog.meta || {}) },
      log: Array.isArray(prog.log) ? [...prog.log] : [],
    },
  };
}

// Gộp tiến độ:
// - Thẻ trùng khoá giữ bản có reps cao hơn, hoà thì lấy bản trong file nhập (imported)
// - Meta hợp nhất: sao OR, ghi chú giữ bản local nếu có, nếu local không có mới lấy imported
// - Log hợp nhất: khử trùng theo (t, card), sắp xếp theo thời gian
export function mergeProgress(local = {}, imported = {}) {
  const mergedCards = { ...(local?.cards || {}) };
  const impCards = imported?.cards || {};

  for (const [k, impCard] of Object.entries(impCards)) {
    if (!impCard) continue;
    const locCard = mergedCards[k];
    if (!locCard) {
      mergedCards[k] = { ...impCard };
    } else {
      const locReps = Number(locCard.reps || 0);
      const impReps = Number(impCard.reps || 0);
      if (impReps >= locReps) {
        mergedCards[k] = { ...impCard };
      }
      // Nếu locReps > impReps: giữ locCard
    }
  }

  const mergedMeta = { ...(local?.meta || {}) };
  const impMeta = imported?.meta || {};

  for (const [k, impVal] of Object.entries(impMeta)) {
    if (!impVal || typeof impVal !== 'object') continue;
    const locVal = mergedMeta[k] || {};

    const starred = Boolean(locVal.starred || impVal.starred);
    const note = (typeof locVal.note === 'string' && locVal.note.trim())
      ? locVal.note
      : (typeof impVal.note === 'string' ? impVal.note : '');

    mergedMeta[k] = { starred, note };
  }

  // Khử trùng và hợp nhất log theo (t, card)
  const logMap = new Map();
  const locLog = Array.isArray(local?.log) ? local.log : [];
  const impLog = Array.isArray(imported?.log) ? imported.log : [];

  for (let i = 0; i < locLog.length; i++) {
    const e = locLog[i];
    if (e && typeof e.t === 'number' && e.card) {
      logMap.set(`${e.t}|${e.card}`, e);
    }
  }

  for (let i = 0; i < impLog.length; i++) {
    const e = impLog[i];
    if (e && typeof e.t === 'number' && e.card) {
      const key = `${e.t}|${e.card}`;
      if (!logMap.has(key)) {
        logMap.set(key, e);
      } else {
        // Nếu có override ở bản nhập thì ưu tiên giữ thông tin override
        const existing = logMap.get(key);
        if (e.override && !existing.override) {
          logMap.set(key, e);
        }
      }
    }
  }

  const mergedLog = [...logMap.values()].sort((a, b) => a.t - b.t);

  return {
    version: 1,
    cards: mergedCards,
    meta: mergedMeta,
    log: mergedLog,
  };
}

// Tên file sao lưu tự động theo ngày địa phương
export function backupFileName(now = Date.now(), tz) {
  const day = dayKey(now, tz);
  return `progress-${day}.json`;
}

// Chọn các file sao lưu cần xoá (chỉ giữ keep = 7 bản mới nhất, chỉ xoá file đúng mẫu)
export function pickBackupsToDelete(fileNames = [], keep = 7) {
  const pattern = /^progress-(\d{4}-\d{2}-\d{2})\.json$/;
  const matched = [];

  for (let i = 0; i < fileNames.length; i++) {
    const name = fileNames[i];
    const m = pattern.exec(name);
    if (m) {
      matched.push({ name, date: m[1] });
    }
  }

  // Sắp xếp giảm dần theo ngày (mới nhất lên đầu)
  matched.sort((a, b) => b.date.localeCompare(a.date));

  const toDelete = [];
  for (let i = keep; i < matched.length; i++) {
    toDelete.push(matched[i].name);
  }

  return toDelete;
}

// Thực hiện override chấm lại trên thẻ (Section C):
// - Khôi phục prevState
// - Gọi schedule với rating Good (3)
// - Trả về { nextCard, overrideLogEntry }
export function applyCardOverride(prevState, originalLogEntry, now = Date.now(), { learnSteps } = {}) {
  const cardBefore = prevState ? { ...prevState } : newCard();
  const nextCard = schedule(cardBefore, RATING.GOOD, now, { learnSteps });

  const overrideLogEntry = {
    t: now,
    card: originalLogEntry.card,
    override: true,
    of: originalLogEntry.t,
    rating: RATING.GOOD,
    ms: originalLogEntry.ms || 0,
  };

  return {
    nextCard,
    overrideLogEntry,
  };
}

