// src/views/home/dnd.ts — Logic kéo thả an toàn cho thư mục ảo và bộ thẻ

import type { Folder } from '../../core/types.js';
// @ts-ignore
import { notify } from '../notify.js';
// @ts-ignore
import { formatFolderError } from './folder-store.js';

export function canMoveFolderInto(
  dragged: Folder | null,
  target: Folder | null,
  flatFolders?: Folder[]
): boolean {
  if (!dragged) return false;
  if (!target) return true; // Di chuyển ra thư mục gốc
  if (target.id === dragged.id) return false;

  if (Array.isArray(flatFolders) && flatFolders.length > 0) {
    const byId = new Map(flatFolders.map(f => [f.id, f]));
    let cur: Folder | undefined = target;
    const visited = new Set<string>();
    while (cur && cur.parentId && !visited.has(cur.id)) {
      visited.add(cur.id);
      if (cur.parentId === dragged.id) return false;
      cur = byId.get(cur.parentId);
    }
  }

  if (dragged.path && target.path) {
    if (target.path === dragged.path || target.path.startsWith(`${dragged.path}/`)) {
      return false;
    }
  }
  return true;
}

export function createDndHandlers(ctx: any) {
  const { folderStore, refresh } = ctx;

  async function handleDropDeck(deckId: string, targetFolderId: string | null) {
    const folderId = targetFolderId || null;
    const prevLocations = [...folderStore.deckLocations];
    try {
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
        alert('Không thể chuyển bộ thẻ: ' + formatFolderError(res));
        return;
      }

      folderStore.applyDeckMoved(deckId, folderId, res?.location || null);
      const targetFolder = folderStore.findFolder(folderId);
      const folderName = targetFolder ? targetFolder.name : 'Thư mục gốc (Home)';
      notify(`Đã chuyển bộ thẻ vào "${folderName}".`, 'success');
      refresh.cards?.();
    } catch (err) {
      console.warn('Lỗi di chuyển deck:', err);
      await folderStore.refreshDeckLocations();
      refresh.cards?.();
    }
  }

  async function handleDropFolder(draggedFolderId: string, targetFolderId: string | null) {
    if (draggedFolderId === targetFolderId) return;

    if (targetFolderId !== null) {
      const dragged = folderStore.findFolder(draggedFolderId);
      const target = folderStore.findFolder(targetFolderId);
      if (!canMoveFolderInto(dragged, target, folderStore.flatFolders)) {
        alert('Không thể di chuyển thư mục vào bên trong chính nó hoặc thư mục con của nó.');
        return;
      }
    }

    try {
      const res = await window.api?.moveFolder(draggedFolderId, targetFolderId);
      if (res && !res.ok) {
        alert('Không thể di chuyển thư mục: ' + formatFolderError(res));
        return;
      }
      folderStore.applyFolderMoved(draggedFolderId, targetFolderId, res?.folder);
      const targetFolder = folderStore.findFolder(targetFolderId);
      const folderName = targetFolder ? targetFolder.name : 'Thư mục gốc';
      notify(`Đã di chuyển thư mục vào "${folderName}".`, 'success');
      refresh.breadcrumb?.();
      refresh.sidebar?.();
      refresh.cards?.();
    } catch (err) {
      console.warn('Lỗi di chuyển thư mục:', err);
    }
  }

  return {
    handleDropDeck,
    handleDropFolder,
  };
}
