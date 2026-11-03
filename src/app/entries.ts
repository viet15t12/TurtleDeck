// src/app/entries.ts — Quản lý và xử lý kết quả nạp/gộp các entry bộ thẻ

import type { Entry } from '../core/types.js';
import { fileName } from '../views/dom.js';
import { notify } from '../views/notify.js';
import { state, newEntry } from './state.js';

const api = window.api;

export const samePath = (a?: string | null, b?: string | null): boolean => Boolean(a && b && a === b);

// r: kết quả từ main (deck:open / deck:import / deck:save). Trả entry đã thêm/cập nhật.
export function applyResult(r: any, target?: Entry): Entry {
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

  // hai file khác nhau cùng meta.id → cảnh báo và chỉ nạp một
  if (r.ok && fields.path && r.deck?.meta?.id) {
    const twin = state.entries.find(
      e =>
        e !== target &&
        e.status === 'ok' &&
        !samePath(e.path, fields.path) &&
        e.path &&
        e.deck?.meta?.id === fields.deck?.meta?.id
    );
    if (twin) {
      if (fields.deckKey) api.closeDeck(fields.deckKey);
      Object.assign(fields, {
        status: 'error',
        deckKey: null,
        deck: null,
        error: `Trùng mã bộ thẻ (meta.id "${r.deck.meta.id}") với "${fileName(twin.path)}" đang mở — chỉ nạp một bộ.`,
      });
      notify(`"${fileName(fields.path)}" có cùng mã bộ thẻ với "${fileName(twin.path)}" nên không được nạp.`, 'warn');
    }
  }

  // cùng đường dẫn đã có trong danh sách → thay thế mục cũ
  const existing = target ?? (fields.path ? state.entries.find(e => samePath(e.path, fields.path)) : null);
  if (existing) {
    if (existing.deckKey && existing.deckKey !== fields.deckKey) api.closeDeck(existing.deckKey);
    Object.assign(existing, fields);
    // lưu đè lên file đang có ở mục khác → gộp lại
    for (const other of state.entries.filter(e => e !== existing && samePath(e.path, existing.path))) {
      if (other.deckKey) api.closeDeck(other.deckKey);
      state.entries.splice(state.entries.indexOf(other), 1);
    }
    return existing;
  }

  const entry = newEntry(fields);
  state.entries.push(entry);
  return entry;
}
