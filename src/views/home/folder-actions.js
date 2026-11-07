// src/views/home/folder-actions.js — Xử lý các tác vụ thư mục ảo (Tạo, Đổi tên, Di chuyển, Xoá)

import { openFolderModal } from '../components/foldermenu.js';
import { formatFolderError } from './folder-store.js';

export function createFolderActionHandler(ctx) {
  const { folderStore, refresh, nav, ui } = ctx;

  return function handleFolderAction(actionType, folder) {
    if (actionType === 'create') {
      openFolderModal({
        type: 'create',
        folder,
        onConfirm: async name => {
          const res = await window.api?.createFolder(name, folder?.id || null);
          if (res && !res.ok) throw new Error(formatFolderError(res));
          if (res?.folder) {
            folderStore.applyFolderCreated(res.folder);
            refresh.breadcrumb?.();
            refresh.sidebar?.();
            refresh.cards?.();
          } else {
            await refresh.folders();
          }
        },
      });
    } else if (actionType === 'rename') {
      openFolderModal({
        type: 'rename',
        folder,
        onConfirm: async newName => {
          const res = await window.api?.renameFolder(folder.id, newName);
          if (res && !res.ok) throw new Error(formatFolderError(res));
          folderStore.applyFolderRenamed(folder.id, newName, res?.folder);
          refresh.breadcrumb?.();
          refresh.sidebar?.();
          refresh.cards?.();
        },
      });
    } else if (actionType === 'move') {
      openFolderModal({
        type: 'move',
        folder,
        folders: folderStore.flatFolders,
        onConfirm: async newParentId => {
          const res = await window.api?.moveFolder(folder.id, newParentId);
          if (res && !res.ok) throw new Error(formatFolderError(res));
          folderStore.applyFolderMoved(folder.id, newParentId, res?.folder);
          refresh.breadcrumb?.();
          refresh.sidebar?.();
          refresh.cards?.();
        },
      });
    } else if (actionType === 'delete') {
      openFolderModal({
        type: 'delete',
        folder,
        onConfirm: async () => {
          const wasSelectedInSubtree = folderStore.isDescendantOrSelf(ui.selectedFolderId, folder.id);
          const res = await window.api?.deleteFolder(folder.id);
          if (res && !res.ok) throw new Error(formatFolderError(res));
          folderStore.applyFolderDeleted(folder.id, res?.affectedDeckIds || []);
          if (wasSelectedInSubtree) {
            nav.navigateToFolder('all');
          } else {
            refresh.breadcrumb?.();
            refresh.sidebar?.();
            refresh.cards?.();
          }
        },
      });
    }
  };
}
