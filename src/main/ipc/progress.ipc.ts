// src/main/ipc/progress.ipc.ts — Handlers IPC cho tiến độ học tập (import/export/load/save)
import electron from 'electron';
const { dialog } = (electron as any) || {};
import * as progressio from '../../core/progressio.js';
import { IpcDispatcher, IpcContext, registerTypedHandler } from './register.js';
import * as progressService from '../services/progress-service.js';

export function registerProgressIpc(dispatcher: IpcDispatcher, ctx: IpcContext): void {
  const getDeps = () => ({
    progressFile: ctx.paths.progressFile(),
    backupsDir: ctx.paths.backupsDir(),
    dbManager: ctx.dbManager,
  });

  registerTypedHandler(dispatcher, 'progress:load', async () => {
    return await progressService.loadProgress(getDeps());
  });

  registerTypedHandler(dispatcher, 'progress:save', async (_event, data) => {
    return await progressService.saveProgress(getDeps(), data);
  });

  registerTypedHandler(dispatcher, 'progress:export', async event => {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const defaultName = progressio.backupFileName(Date.now(), tz);
    const win = ctx.winOf ? ctx.winOf(event) : undefined;
    const r = await dialog.showSaveDialog(win, {
      title: 'Xuất file tiến độ học tập',
      defaultPath: defaultName,
      filters: [{ name: 'JSON Backup', extensions: ['json'] }],
    });
    if (r.canceled || !r.filePath) return { ok: false, canceled: true };
    return await progressService.exportProgressToFile(getDeps(), r.filePath);
  });

  registerTypedHandler(dispatcher, 'progress:pickImport', async event => {
    const win = ctx.winOf ? ctx.winOf(event) : undefined;
    const r = await dialog.showOpenDialog(win, {
      title: 'Chọn file sao lưu tiến độ',
      properties: ['openFile'],
      filters: [{ name: 'JSON Backup', extensions: ['json'] }, { name: 'Tất cả tập tin', extensions: ['*'] }],
    });
    if (r.canceled || !r.filePaths.length) return null;
    return await progressService.readAndValidateImportFile(r.filePaths[0]);
  });

  registerTypedHandler(dispatcher, 'progress:applyImport', async (_event, req) => {
    const { importedProgress, mode = 'merge' } = req || {};
    return await progressService.applyImport(getDeps(), importedProgress, mode);
  });
}
