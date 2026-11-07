// src/app/events.js — Đăng ký các sự kiện IPC từ main process gửi tới renderer

import { fileName } from '../views/dom.js';
import { notify } from '../views/notify.js';
import { applyResult, samePath } from './entries.js';
import { persistDeckPaths } from './library.js';
import { render } from './runtime.js';
import { state } from './state.js';

const api = window.api;

export function registerEvents(actions) {
  // Đăng ký các sự kiện tệp và hệ thống từ main
  api.onOpenExternal?.(async ({ path: filePath }) => {
    if (!filePath) return;
    const existing = state.entries.find(e => samePath(e.path, filePath));
    if (existing && existing.status === 'ok') {
      actions.openDeckView(existing);
      return;
    }
    const [r] = await api.openDecks(filePath);
    if (r && r.ok) {
      const e = applyResult(r, existing);
      await persistDeckPaths();
      actions.openDeckView(e);
    } else {
      notify(`Không mở được file "${fileName(filePath)}": ${r?.error || 'Lỗi'}`, 'error');
    }
  });

  api.onDeckChanged?.(async ({ deckKey, path: filePath }) => {
    const entry = state.entries.find(e => (deckKey && e.deckKey === deckKey) || samePath(e.path, filePath));
    if (!entry) return;
    if (state.route.name === 'editor' && state.route.uid === entry.uid) {
      const dirty = Boolean(document.querySelector('.editor-dirty-indicator') || window.__isEditorDirty?.());
      if (dirty) {
        const accept = window.confirm(
          `File "${fileName(entry.path)}" vừa được sửa đổi từ bên ngoài.\nBạn có muốn nạp lại và ghi đè các thay đổi chưa lưu trong Editor không?`
        );
        if (!accept) return;
      }
    }
    await actions.reload(entry);
    notify(`Đã nạp lại "${fileName(entry.path)}" vì file có thay đổi bên ngoài.`, 'info');
  });

  api.onWatchError?.(({ path: filePath, error }) => {
    const entry = state.entries.find(e => samePath(e.path, filePath));
    if (entry) {
      entry.status = 'error';
      entry.error = error;
      render();
    }
    notify(`Lỗi theo dõi file "${fileName(filePath)}": ${error}`, 'warn');
  });

  api.onFileAdded?.(async ({ path: filePath, group }) => {
    const existing = state.entries.find(e => samePath(e.path, filePath));
    if (existing) {
      existing.group = group;
      existing.inLibrary = true;
      render();
      return;
    }
    const [r] = await api.openDecks(filePath);
    if (r?.ok) {
      const e = applyResult(r);
      e.group = group;
      e.inLibrary = true;
      await persistDeckPaths();
      render();
    }
  });

  api.onFileRemoved?.(async ({ path: filePath, deckId }) => {
    const idx = state.entries.findIndex(
      e => (deckId && e.deck?.meta?.id === deckId) || samePath(e.path, filePath)
    );
    if (idx !== -1) {
      state.entries.splice(idx, 1);
      await persistDeckPaths();
      render();
    }
  });

  api.onFolderChanged?.(() => {
    render();
  });

  api.onDeckMoved?.(() => {
    render();
  });

  api.onDeckLinked?.(() => {
    render();
  });

  api.onDeckUnlinked?.(() => {
    render();
  });
}

