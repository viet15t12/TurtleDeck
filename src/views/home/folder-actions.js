// src/views/home/folder-actions.js — Xử lý các tác vụ thư mục (Tạo, Đổi tên, Di chuyển, Xoá)

import { openFolderModal } from '../components/foldermenu.js';

export function createFolderActionHandler(ctx) {
  const { folderStore, refresh, nav, ui } = ctx;

  return function handleFolderAction(actionType, folder) {
    if (actionType === 'create') {
      openFolderModal({
        type: 'create',
        folder,
        onConfirm: async name => {
          const res = await window.api?.createFolder(name, folder?.id || null);
          if (res && !res.ok) throw new Error(res.error);
          await refresh.folders();
        },
      });
    } else if (actionType === 'rename') {
      openFolderModal({
        type: 'rename',
        folder,
        onConfirm: async newName => {
          const res = await window.api?.renameFolder(folder.id, newName);
          if (res && !res.ok) throw new Error(res.error);
          await refresh.folders();
        },
      });
    } else if (actionType === 'move') {
      openFolderModal({
        type: 'move',
        folder,
        folders: folderStore.flatFolders,
        onConfirm: async newParentId => {
          const res = await window.api?.moveFolder(folder.id, newParentId);
          if (res && !res.ok) throw new Error(res.error);
          await refresh.folders();
        },
      });
    } else if (actionType === 'delete') {
      openFolderModal({
        type: 'delete',
        folder,
        onConfirm: async () => {
          const res = await window.api?.deleteFolder(folder.id);
          if (res && !res.ok) throw new Error(res.error);
          if (ui.selectedFolderId === folder.id) {
            nav.navigateToFolder(folder.parentId || null);
          } else {
            await refresh.folders();
          }
        },
      });
    }
  };
}
