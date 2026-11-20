// src/views/session/item-meta.ts — Đọc và ghi metadata của item (gắn sao, ghi chú cá nhân)

import type { ItemMeta, Progress } from '../../core/types.js';

const api = window.api;

export function getItemMeta(progress: Progress, deckId: string, itemId: string): ItemMeta {
  const metaKey = `${deckId}:${itemId}`;
  const item = progress?.meta?.[metaKey];
  return {
    starred: Boolean(item?.starred),
    note: item?.note || '',
  };
}

export function setItemStarred(progress: Progress, deckId: string, itemId: string, starred: boolean): void {
  const metaKey = `${deckId}:${itemId}`;
  if (!progress.meta) progress.meta = {};
  if (!progress.meta[metaKey]) progress.meta[metaKey] = { starred: false, note: '' };
  progress.meta[metaKey].starred = starred;
  if (api?.setItemStarred) {
    api.setItemStarred(deckId, itemId, starred).catch((e: any) => console.warn('Lỗi lưu starred:', e));
  }
}

export function setItemNote(progress: Progress, deckId: string, itemId: string, note: string): void {
  const metaKey = `${deckId}:${itemId}`;
  if (!progress.meta) progress.meta = {};
  if (!progress.meta[metaKey]) progress.meta[metaKey] = { starred: false, note: '' };
  progress.meta[metaKey].note = String(note || '').slice(0, 2000);
  if (api?.setItemNote) {
    api.setItemNote(deckId, itemId, note).catch((e: any) => console.warn('Lỗi lưu note:', e));
  }
}

