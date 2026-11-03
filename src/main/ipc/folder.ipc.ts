// src/main/ipc/folder.ipc.ts — Đăng ký IPC cho các thao tác thư mục
import { IpcDispatcher, IpcContext, registerTypedHandler } from './register.js';
import { FolderService } from '../services/folder-service.js';

export function registerFolderIpc(dispatcher: IpcDispatcher, ctx: IpcContext): void {
  const folderService = ctx.folderService || (ctx.dbManager?.folder
    ? new FolderService(ctx.dbManager.folder, {
        notify: ctx.notify,
        libraryDir: () => ctx.paths.defaultLibraryDir(),
      })
    : null);

  registerTypedHandler(dispatcher, 'folder:create', async (_e, req) => {
    if (!folderService) return { ok: false, error: 'Dịch vụ thư mục chưa sẵn sàng.' };
    return folderService.createFolder(req.name, req.parentId);
  });

  registerTypedHandler(dispatcher, 'folder:rename', async (_e, req) => {
    if (!folderService) return { ok: false, error: 'Dịch vụ thư mục chưa sẵn sàng.' };
    return folderService.renameFolder(req.id, req.newName);
  });

  registerTypedHandler(dispatcher, 'folder:move', async (_e, req) => {
    if (!folderService) return { ok: false, error: 'Dịch vụ thư mục chưa sẵn sàng.' };
    return folderService.moveFolder(req.id, req.newParentId);
  });

  registerTypedHandler(dispatcher, 'folder:delete', async (_e, req) => {
    if (!folderService) return { ok: false, error: 'Dịch vụ thư mục chưa sẵn sàng.' };
    return folderService.deleteFolder(req.id);
  });

  registerTypedHandler(dispatcher, 'folder:getTree', async (_e) => {
    if (!folderService) return [];
    return folderService.getFolderTree();
  });
}

