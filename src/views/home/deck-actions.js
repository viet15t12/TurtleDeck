// src/views/home/deck-actions.js — Xử lý các tác vụ bộ thẻ: di chuyển thư mục, liên kết, hủy liên kết

import { fileName } from '../dom.js';
import { openFolderModal } from '../components/foldermenu.js';

export function createDeckCardActions(ctx) {
  const { actions, folderStore, refresh } = ctx;

  return {
    ...actions,
    onMoveDeck: entry => {
      const deckId = entry.deck?.meta?.id;
      if (!deckId) return;
      openFolderModal({
        type: 'move',
        folder: { name: entry.deck?.meta?.title || fileName(entry.path), parentId: null, path: '' },
        folders: folderStore.flatFolders,
        onConfirm: async targetFolderId => {
          const res = await window.api?.moveDeck(deckId, targetFolderId);
          if (res && !res.ok) throw new Error(res.error);
          await refresh.folders();
          actions.reloadLibrary?.();
        },
      });
    },
    onLinkDeck: entry => {
      const deckId = entry.deck?.meta?.id;
      if (!deckId) return;
      openFolderModal({
        type: 'move',
        folder: { name: entry.deck?.meta?.title || fileName(entry.path), parentId: null, path: '' },
        folders: folderStore.flatFolders,
        onConfirm: async targetFolderId => {
          const res = await window.api?.linkDeck(deckId, targetFolderId);
          if (res && !res.ok) throw new Error(res.error);
          await refresh.folders();
          actions.reloadLibrary?.();
        },
      });
    },
    onUnlinkDeck: async entry => {
      if (!confirm(`Bạn có chắc muốn xoá liên kết bộ thẻ "${entry.deck?.meta?.title}" khỏi thư mục này?`)) return;
      if (entry.locationId) {
        await window.api?.unlinkDeck(entry.locationId, true);
        await refresh.folders();
        actions.reloadLibrary?.();
      }
    },
  };
}

