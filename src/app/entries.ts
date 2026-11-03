// src/app/entries.ts — Quản lý và xử lý kết quả nạp/gộp các entry bộ thẻ

import type { Entry } from '../core/types.js';
import { fileName } from '../views/dom.js';
import { notify } from '../views/notify.js';
import { state, newEntry } from './state.js';

const getApi = () => (typeof window !== 'undefined' ? window.api : undefined);

export const samePath = (a?: string | null, b?: string | null): boolean => Boolean(a && b && a === b);

export interface PlanApplyResult {
  fields: Partial<Entry>;
  targetEntry?: Entry | null;
  toClose: string[];
  toRemove: Entry[];
  warnMessage?: string | null;
}

// Hàm thuần lập kế hoạch gộp/thay thế entry mà không có tác dụng phụ
export function planApplyResult(entries: Entry[], r: any, target?: Entry): PlanApplyResult {
  const fields: Partial<Entry> = r.ok
    ? {
        status: 'ok',
        path: r.path ?? target?.path ?? null,
        deckKey: r.deckKey ?? target?.deckKey,
        deckText: r.deckText,
        deck: r.deck,
        issues: r.issues || [],
        error: null,
        source: r.source ?? target?.source,
        assetCount: r.assetCount,
      }
    : {
        status: r.missing ? 'missing' : 'error',
        path: r.path ?? target?.path ?? null,
        deckKey: null,
        deck: null,
        issues: r.issues || [],
        error: r.error || 'Không mở được bộ thẻ.',
      };

  const toClose: string[] = [];
  const toRemove: Entry[] = [];
  let warnMessage: string | null = null;

  // hai file khác nhau cùng meta.id → cảnh báo và chỉ nạp một
  if (r.ok && fields.path && r.deck?.meta?.id) {
    const twin = entries.find(
      e =>
        e !== target &&
        e.status === 'ok' &&
        !samePath(e.path, fields.path) &&
        e.path &&
        e.deck?.meta?.id === fields.deck?.meta?.id
    );
    if (twin) {
      if (fields.deckKey) toClose.push(fields.deckKey);
      Object.assign(fields, {
        status: 'error',
        deckKey: null,
        deck: null,
        error: `Trùng mã bộ thẻ (meta.id "${r.deck.meta.id}") với "${fileName(twin.path)}" đang mở — chỉ nạp một bộ.`,
      });
      warnMessage = `"${fileName(fields.path)}" có cùng mã bộ thẻ với "${fileName(twin.path)}" nên không được nạp.`;
    }
  }

  const existing = target ?? (fields.path ? entries.find(e => samePath(e.path, fields.path)) : null);
  if (existing) {
    if (existing.deckKey && existing.deckKey !== fields.deckKey) {
      toClose.push(existing.deckKey);
    }
    for (const other of entries.filter(e => e !== existing && samePath(e.path, existing.path))) {
      if (other.deckKey) toClose.push(other.deckKey);
      toRemove.push(other);
    }
  }

  return {
    fields,
    targetEntry: existing,
    toClose,
    toRemove,
    warnMessage,
  };
}

// r: kết quả từ main (deck:open / deck:import / deck:save). Trả entry đã thêm/cập nhật.
export function applyResult(r: any, target?: Entry): Entry {
  const plan = planApplyResult(state.entries, r, target);

  const api = getApi();
  for (const k of plan.toClose) {
    api?.closeDeck?.(k);
  }

  if (plan.warnMessage) {
    notify(plan.warnMessage, 'warn');
  }

  if (plan.targetEntry) {
    Object.assign(plan.targetEntry, plan.fields);
    for (const rem of plan.toRemove) {
      const idx = state.entries.indexOf(rem);
      if (idx >= 0) state.entries.splice(idx, 1);
    }
    return plan.targetEntry;
  }

  const entry = newEntry(plan.fields);
  state.entries.push(entry);
  return entry;
}
