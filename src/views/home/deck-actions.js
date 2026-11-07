// src/views/home/deck-actions.js — Xử lý các tác vụ bộ thẻ: di chuyển thư mục ảo, tạo liên kết, hủy liên kết

import { fileName } from '../dom.js';
import { openFolderModal } from '../components/foldermenu.js';
import { formatFolderError } from './folder-store.js';

export function createDeckCardActions(ctx) {
  const { actions, folderStore, refresh } = ctx;

  return {
    ...actions,
    onMoveDeck: entry => {
      const deckId = entry.deck?.meta?.id;
      if (!deckId) return;
      const currentParentId = folderStore.locationsByDeckId.get(deckId) ?? null;
      openFolderModal({
        type: 'move',
        folder: { name: entry.deck?.meta?.title || fileName(entry.path), parentId: currentParentId, path: '' },
        folders: folderStore.flatFolders,
        onConfirm: async targetFolderId => {
          const folderId = targetFolderId || null;
          const prevLocations = [...folderStore.deckLocations];
          folderStore.applyDeckMoved(deckId, folderId);
          refresh.cards?.();

          const res = await window.api?.moveDeck(deckId, folderId);
          if (res && !res.ok) {
            folderStore.setStateForTest({
              folders: folderStore.flatFolders,
              locations: prevLocations,
            });
            await folderStore.refreshDeckLocations();
            refresh.cards?.();
            throw new Error(formatFolderError(res, 'Lỗi khi di chuyển bộ thẻ.'));
          }
          folderStore.applyDeckMoved(deckId, folderId, res?.location || null);
          refresh.cards?.();
        },
      });
    },
    onLinkDeck: entry => {
      const deckId = entry.deck?.meta?.id;
      if (!deckId) return;
      openFolderModal({
        type: 'link',
        folder: { name: entry.deck?.meta?.title || fileName(entry.path), parentId: null, path: '' },
        folders: folderStore.flatFolders,
        onConfirm: async targetFolderId => {
          const folderId = targetFolderId || null;
          const res = await window.api?.linkDeck(deckId, folderId);
          if (res && !res.ok) {
            throw new Error(formatFolderError(res, 'Lỗi khi tạo liên kết.'));
          }
          if (res?.location) {
            folderStore.applyDeckLinked(res.location);
          } else {
            await folderStore.refreshDeckLocations();
          }
          refresh.cards?.();
        },
      });
    },
    onUnlinkDeck: async entry => {
      if (!confirm(`Bạn có chắc muốn xoá liên kết bộ thẻ "${entry.deck?.meta?.title}" khỏi thư mục này?`)) return;
      if (entry.locationId) {
        const res = await window.api?.unlinkDeck(entry.locationId, false);
        if (res && !res.ok) {
          alert(formatFolderError(res, 'Lỗi khi xoá liên kết.'));
          return;
        }
        folderStore.applyDeckUnlinked(entry.locationId);
        refresh.cards?.();
      }
    },
  };
}
