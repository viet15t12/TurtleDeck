// src/views/home/dnd.ts — Logic kéo thả an toàn cho thư mục và bộ thẻ

import type { Folder } from '../../core/types.js';
import { notify } from '../notify.js';

export function canMoveFolderInto(dragged: Folder | null, target: Folder | null): boolean {
  if (!dragged) return false;
  if (!target) return true; // Di chuyển ra thư mục gốc
  if (target.id === dragged.id) return false;
  if (target.path === dragged.path || target.path.startsWith(`${dragged.path}/`)) {
    return false;
  }
  return true;
}

export function createDndHandlers(ctx: any) {
  const { folderStore, refresh, actions } = ctx;

  async function handleDropDeck(deckId: string, targetFolderId: string | null) {
    try {
      folderStore.locationsByDeckId.set(deckId, targetFolderId);
      refresh.cards();

      const res = await window.api?.moveDeck(deckId, targetFolderId);
      if (res && !res.ok) {
        alert('Không thể chuyển bộ thẻ: ' + res.error);
        await folderStore.refreshDeckLocations();
        refresh.cards();
        return;
      }
      const targetFolder = folderStore.findFolder(targetFolderId);
      const folderName = targetFolder ? targetFolder.name : 'Thư mục gốc (Home)';
      notify(`Đã chuyển bộ thẻ vào "${folderName}".`, 'success');
      await refresh.folders();
      actions.scanLibrary?.();
    } catch (err) {
      console.warn('Lỗi di chuyển deck:', err);
      await folderStore.refreshDeckLocations();
      refresh.cards();
    }
  }

  async function handleDropFolder(draggedFolderId: string, targetFolderId: string | null) {
    if (draggedFolderId === targetFolderId) return;

    if (targetFolderId !== null) {
      const dragged = folderStore.findFolder(draggedFolderId);
      const target = folderStore.findFolder(targetFolderId);
      if (!canMoveFolderInto(dragged, target)) {
        alert('Không thể di chuyển thư mục vào bên trong chính nó hoặc thư mục con của nó.');
        return;
      }
    }

    try {
      const res = await window.api?.moveFolder(draggedFolderId, targetFolderId);
      if (res && !res.ok) {
        alert('Không thể di chuyển thư mục: ' + res.error);
        return;
      }
      const targetFolder = folderStore.findFolder(targetFolderId);
      const folderName = targetFolder ? targetFolder.name : 'Thư mục gốc';
      notify(`Đã di chuyển thư mục vào "${folderName}".`, 'success');
      await refresh.folders();
      actions.reloadLibrary?.();
    } catch (err) {
      console.warn('Lỗi di chuyển thư mục:', err);
    }
  }

  return {
    handleDropDeck,
    handleDropFolder,
  };
}
