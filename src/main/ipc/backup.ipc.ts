// src/main/ipc/backup.ipc.ts — Handlers IPC cho sao lưu và khôi phục tiến độ
import path from 'node:path';
import electron from 'electron';
const { shell, dialog } = (electron as any) || {};
import { IpcDispatcher, IpcContext, registerTypedHandler } from './register.js';
import * as backupService from '../services/backup-service.js';
import { getActiveLibraryDir } from '../services/library-service.js';

export function registerBackupIpc(dispatcher: IpcDispatcher, ctx: IpcContext): void {
  const getDeps = (): backupService.BackupDeps => ({
    backupsDir: ctx.paths.backupsDir(),
    progressFile: ctx.paths.progressFile(),
    dbManager: ctx.dbManager,
  });

  const getFullDeps = async (destPath?: string): Promise<backupService.FullBackupDeps> => {
    const libDir = await getActiveLibraryDir(ctx.paths.settingsFile(), ctx.paths.defaultLibraryDir());
    return {
      backupsDir: ctx.paths.backupsDir(),
      progressFile: ctx.paths.progressFile(),
      settingsFile: ctx.paths.settingsFile(),
      dbManager: ctx.dbManager,
      libraryDir: libDir,
      destPath,
    };
  };

  registerTypedHandler(dispatcher, 'backup:create', async () => {
    return await backupService.createBackup(getDeps());
  });

  registerTypedHandler(dispatcher, 'backup:createFull', async (event, req: any) => {
    let destPath = typeof req === 'object' && req !== null ? req.destPath : undefined;
    if (!destPath && dialog) {
      const win = ctx.winOf ? ctx.winOf(event) : undefined;
      const now = new Date();
      const dateStr = now.toISOString().slice(0, 10);
      const r = await dialog.showSaveDialog(win, {
        title: 'Xuất file sao lưu toàn bộ hệ thống (Bộ thẻ & Thư mục)',
        defaultPath: `turtledeck-full-backup-${dateStr}.turtlebackup`,
        filters: [
          { name: 'File sao lưu Turtle Deck (*.turtlebackup, *.zip)', extensions: ['turtlebackup', 'zip'] },
        ],
      });
      if (r.canceled || !r.filePath) {
        return { ok: false, canceled: true };
      }
      destPath = r.filePath;
    }

    const fullDeps = await getFullDeps(destPath);
    return await backupService.createFullBackup(fullDeps);
  });

  registerTypedHandler(dispatcher, 'backup:restoreFull', async (event, req: any) => {
    let srcPath = typeof req === 'object' && req !== null ? req.filePath : undefined;
    if (!srcPath && dialog) {
      const win = ctx.winOf ? ctx.winOf(event) : undefined;
      const r = await dialog.showOpenDialog(win, {
        title: 'Chọn file sao lưu toàn bộ hệ thống để khôi phục',
        properties: ['openFile'],
        filters: [
          { name: 'File sao lưu Turtle Deck (*.turtlebackup, *.zip)', extensions: ['turtlebackup', 'zip'] },
          { name: 'Tất cả tập tin', extensions: ['*'] },
        ],
      });
      if (r.canceled || !r.filePaths.length) {
        return { ok: false, canceled: true };
      }
      srcPath = r.filePaths[0];
    }

    if (!srcPath) {
      return { ok: false, error: 'Chưa chọn file sao lưu để khôi phục.' };
    }

    const libDir = await getActiveLibraryDir(ctx.paths.settingsFile(), ctx.paths.defaultLibraryDir());
    const res = await backupService.restoreFullBackup({
      backupsDir: ctx.paths.backupsDir(),
      progressFile: ctx.paths.progressFile(),
      settingsFile: ctx.paths.settingsFile(),
      dbManager: ctx.dbManager,
      libraryDir: libDir,
      srcPath,
    });

    if (res.ok) {
      ctx.notify?.('folder:changed', { action: 'restore' });
      ctx.notify?.('deck:changed', { filePath: libDir });
    }
    return res;
  });

  registerTypedHandler(dispatcher, 'backup:list', async () => {
    return await backupService.listBackups(ctx.paths.backupsDir());
  });

  registerTypedHandler(dispatcher, 'backup:restore', async (_event, req: any) => {
    const name = typeof req === 'object' && req !== null ? req.name : req;
    return await backupService.restoreBackup(getDeps(), name);
  });

  registerTypedHandler(dispatcher, 'backup:openFolder', async () => {
    shell.openPath(ctx.paths.backupsDir());
    return { ok: true };
  });
}
