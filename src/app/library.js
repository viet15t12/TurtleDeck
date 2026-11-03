// src/app/library.js — Quản lý đường dẫn bộ thẻ và quét thư viện tệp

import { fileName } from '../views/dom.js';
import { notify } from '../views/notify.js';
import { state } from './state.js';
import { applyResult, samePath } from './entries.js';
import { render } from './runtime.js';

const api = window.api;

export async function persistDeckPaths() {
  const decks = [...new Set(state.entries.map(e => e.path).filter(Boolean))];
  state.settings.decks = decks;
  const r = await api.saveSettings({ decks });
  if (r && r.ok === false) notify('Không lưu được cài đặt: ' + r.error, 'error');
  else if (r?.settings) state.settings = r.settings;
}

export async function scanLibrary(actions) {
  const r = await api.scanLibrary();
  if (!r) return;
  const libFiles = Array.isArray(r) ? r : (r.files || []);
  let updated = false;

  for (const entry of state.entries) {
    const match = libFiles.find(f => samePath(f.path, entry.path));
    if (match) {
      entry.group = match.group;
      entry.relPath = match.relPath;
      entry.inLibrary = true;
      if (entry.status === 'missing') {
        const [opened] = await api.openDecks(entry.path);
        if (opened?.ok) {
          applyResult(opened, entry);
          updated = true;
        }
      }
    } else if (entry.inLibrary) {
      entry.inLibrary = false;
    }
  }

  for (const f of libFiles) {
    const existing = state.entries.find(e => samePath(e.path, f.path));
    if (!existing) {
      const [opened] = await api.openDecks(f.path);
      if (opened?.ok) {
        const deckId = opened.deck?.meta?.id;
        // Kiểm tra xem có entry cũ nào cùng deckId đang bị 'missing' không (do vừa di chuyển file)
        const ghost = state.entries.find(e => e.deck?.meta?.id && e.deck.meta.id === deckId);
        if (ghost) {
          applyResult(opened, ghost);
          ghost.group = f.group;
          ghost.relPath = f.relPath;
          ghost.inLibrary = true;
          ghost.status = 'ok';
        } else {
          const e = applyResult(opened);
          e.group = f.group;
          e.relPath = f.relPath;
          e.inLibrary = true;
        }
        updated = true;
      }
    }
  }

  // Dọn dẹp các thẻ trùng lặp hoặc thẻ 'missing' mà file hoặc deck ID đã có thẻ ok tương ứng
  state.entries = state.entries.filter(e => {
    if (e.status === 'missing') {
      const id = e.deck?.meta?.id;
      if (id && state.entries.some(other => other !== e && other.deck?.meta?.id === id && other.status === 'ok')) {
        return false;
      }
      const fname = fileName(e.path);
      if (state.entries.some(other => other !== e && fileName(other.path) === fname && other.status === 'ok')) {
        return false;
      }
    }
    return true;
  });

  if (updated) {
    await persistDeckPaths();
  }
  render();
}

export function reloadLibrary(actions) {
  return actions.scanLibrary();
}

