// src/core/fsutil.js — ghi file atomic (ghi .tmp → fsync → rename) và quản lý đọc/ghi progress.json, settings.json.
// Chỉ dùng ở main và tools/test (Node), không dùng ở renderer.
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { parseLearnSteps, DEFAULT_LEARN_STEPS } from './srs.js';

const queues = new Map();   // filePath -> Promise: tuần tự hoá mọi thao tác đọc/ghi trên cùng một file

const isPlainObject = v => v !== null && typeof v === 'object' && !Array.isArray(v);

async function writeNow(file, data) {
  const tmp = `${file}.${process.pid}-${randomBytes(4).toString('hex')}.tmp`;
  try {
    const fh = await fs.open(tmp, 'w');
    try { await fh.writeFile(data); await fh.sync(); }   // dữ liệu xuống đĩa trước khi rename
    finally { await fh.close(); }
    await fs.rename(tmp, file);                          // rename là atomic trên cùng hệ thống file
  } catch (e) {
    await fs.rm(tmp, { force: true }).catch(() => {});
    throw e;
  }
  try {                                                  // fsync thư mục để rename bền vững (best-effort)
    const dh = await fs.open(path.dirname(file), 'r');
    try { await dh.sync(); } finally { await dh.close(); }
  } catch { /* một số hệ thống file không hỗ trợ */ }
}

export function enqueueFileOp(file, fn) {
  const key = path.resolve(file);
  const prev = queues.get(key) ?? Promise.resolve();
  const next = prev.catch(() => {}).then(fn);
  queues.set(key, next);
  next.finally(() => { if (queues.get(key) === next) queues.delete(key); }).catch(() => {});
  return next;
}

export function atomicWrite(file, data) {
  return enqueueFileOp(file, () => writeNow(file, data));
}

// Giữ 1 bản sao lần lưu trước: file → file.bak (chép ra .tmp rồi rename). Chưa có file cũ → bỏ qua.
export async function backupFile(file, bak = file + '.bak') {
  const tmp = `${bak}.${process.pid}-${randomBytes(4).toString('hex')}.tmp`;
  try {
    await fs.copyFile(file, tmp);
    await fs.rename(tmp, bak);
    return true;
  } catch (e) {
    await fs.rm(tmp, { force: true }).catch(() => {});
    if (e.code === 'ENOENT') return false;
    throw e;
  }
}

// ── Progress (study-app.md mục 8) ────────────────────────────────────────────

export const defaultProgress = () => ({
  version: 1,
  cards: {},
  meta: {},
  log: [],
});

function isValidProgressShape(obj) {
  if (!isPlainObject(obj)) return false;
  if (obj.cards !== undefined && !isPlainObject(obj.cards)) return false;
  if (obj.meta !== undefined && !isPlainObject(obj.meta)) return false;
  if (obj.log !== undefined && !Array.isArray(obj.log)) return false;
  return true;
}

function normalizeProgress(obj) {
  return {
    version: 1,
    cards: isPlainObject(obj?.cards) ? { ...obj.cards } : {},
    meta: isPlainObject(obj?.meta) ? { ...obj.meta } : {},
    log: Array.isArray(obj?.log) ? [...obj.log] : [],
  };
}

function sameLogEntry(a, b) {
  if (!a || !b) return false;
  return a.t === b.t && a.card === b.card && a.rating === b.rating && a.ms === b.ms;
}

function mergeLogs(existingLog = [], incomingLog) {
  if (!Array.isArray(incomingLog)) return [...existingLog];
  if (existingLog.length === 0) return [...incomingLog];

  // Nếu incomingLog đã chứa toàn bộ existingLog ở đầu (renderer tích luỹ log) → lấy incomingLog
  if (incomingLog.length >= existingLog.length) {
    let isPrefix = true;
    for (let i = 0; i < existingLog.length; i++) {
      if (!sameLogEntry(existingLog[i], incomingLog[i])) {
        isPrefix = false;
        break;
      }
    }
    if (isPrefix) return [...incomingLog];
  }

  // Hai lần ghi độc lập liên tiếp: giữ existingLog và nối thêm các mục mới từ incomingLog
  const merged = [...existingLog];
  for (const item of incomingLog) {
    if (!merged.some(x => sameLogEntry(x, item))) {
      merged.push(item);
    }
  }
  return merged;
}

async function readProgressRaw(file) {
  let text;
  try {
    text = await fs.readFile(file, 'utf8');
  } catch (e) {
    if (e.code === 'ENOENT') return { status: 'missing', data: defaultProgress() };
    throw e;
  }

  try {
    const parsed = JSON.parse(text);
    if (!isValidProgressShape(parsed)) {
      return { status: 'corrupt', data: defaultProgress() };
    }
    return { status: 'ok', data: normalizeProgress(parsed) };
  } catch {
    return { status: 'corrupt', data: defaultProgress() };
  }
}

// Đọc progress.json; nếu file hỏng thì sao lưu ra .bak và khởi tạo lại an toàn.
export function loadProgressFile(file) {
  return enqueueFileOp(file, async () => {
    const res = await readProgressRaw(file);
    if (res.status === 'corrupt') {
      await backupFile(file).catch(() => {});
      const fresh = defaultProgress();
      await writeNow(file, JSON.stringify(fresh, null, 2)).catch(() => {});
      return fresh;
    }
    return res.data;
  });
}

// Lưu progress.json (tuần tự hoá + atomic + giữ .bak + hợp nhất an toàn để 2 lần ghi liền nhau không mất dữ liệu).
export function saveProgressFile(file, data, { replace = false } = {}) {
  if (!isPlainObject(data)) {
    return Promise.resolve({ ok: false, error: 'Dữ liệu tiến độ không hợp lệ.' });
  }
  if (data.cards !== undefined && !isPlainObject(data.cards)) {
    return Promise.resolve({ ok: false, error: 'Trường cards không hợp lệ.' });
  }
  if (data.meta !== undefined && !isPlainObject(data.meta)) {
    return Promise.resolve({ ok: false, error: 'Trường meta không hợp lệ.' });
  }
  if (data.log !== undefined && !Array.isArray(data.log)) {
    return Promise.resolve({ ok: false, error: 'Trường log không hợp lệ.' });
  }

  return enqueueFileOp(file, async () => {
    const currentRes = await readProgressRaw(file);
    if (currentRes.status === 'corrupt' || currentRes.status === 'ok') {
      await backupFile(file).catch(() => {});
    }
    const existing = currentRes.data;

    const merged = replace
      ? normalizeProgress(data)
      : {
          version: 1,
          cards: { ...existing.cards, ...(data.cards || {}) },
          meta: { ...existing.meta, ...(data.meta || {}) },
          log: mergeLogs(existing.log, data.log),
        };

    await writeNow(file, JSON.stringify(merged, null, 2));
    return { ok: true, progress: merged };
  });
}

// ── Settings (hợp nhất với nội dung hiện có, tuần tự hoá + atomic) ──────────

export const DEFAULT_SETTINGS = {
  version: 1,
  decks: [],
  newCardsPerDay: 20,
  learnSteps: [...DEFAULT_LEARN_STEPS],
};

export function normalizeSettings(raw) {
  const base = isPlainObject(raw) ? { ...raw } : {};
  const decks = Array.isArray(base.decks) ? base.decks.filter(p => typeof p === 'string') : [];
  const rawNew = Number(base.newCardsPerDay);
  const newCardsPerDay = Number.isFinite(rawNew) && rawNew >= 0 ? Math.floor(rawNew) : DEFAULT_SETTINGS.newCardsPerDay;
  const learnSteps = parseLearnSteps(base.learnSteps, DEFAULT_SETTINGS.learnSteps);

  return {
    ...DEFAULT_SETTINGS,
    ...base,
    version: 1,
    decks,
    newCardsPerDay,
    learnSteps,
  };
}

async function readSettingsRaw(file) {
  let text;
  try {
    text = await fs.readFile(file, 'utf8');
  } catch (e) {
    if (e.code === 'ENOENT') return { status: 'missing', data: {} };
    throw e;
  }
  try {
    const parsed = JSON.parse(text);
    if (!isPlainObject(parsed)) return { status: 'corrupt', data: {} };
    return { status: 'ok', data: parsed };
  } catch {
    return { status: 'corrupt', data: {} };
  }
}

export function loadSettingsFile(file) {
  return enqueueFileOp(file, async () => {
    const res = await readSettingsRaw(file);
    if (res.status === 'corrupt') {
      await backupFile(file).catch(() => {});
    }
    return normalizeSettings(res.data);
  });
}

export function saveSettingsFile(file, patch) {
  if (!isPlainObject(patch)) {
    return Promise.resolve({ ok: false, error: 'Dữ liệu cài đặt không hợp lệ.' });
  }
  return enqueueFileOp(file, async () => {
    const res = await readSettingsRaw(file);
    if (res.status === 'corrupt' || res.status === 'ok') {
      await backupFile(file).catch(() => {});
    }
    const merged = normalizeSettings({ ...res.data, ...patch });
    await writeNow(file, JSON.stringify(merged, null, 2));
    return { ok: true, settings: merged };
  });
}
