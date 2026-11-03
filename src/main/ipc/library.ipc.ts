// src/main/ipc/library.ipc.ts — Handlers IPC cho thư viện bộ thẻ
import path from 'node:path';
import fs from 'node:fs/promises';
import electron from 'electron';
const { dialog } = (electron as any) || {};
import * as fsutil from '../../core/fsutil.js';
import { IpcDispatcher, IpcContext, registerTypedHandler } from './register.js';
import * as libraryService from '../services/library-service.js';

export function registerLibraryIpc(dispatcher: IpcDispatcher, ctx: IpcContext): void {
  const getLibDir = async () =>
    await libraryService.getActiveLibraryDir(ctx.paths.settingsFile(), ctx.paths.defaultLibraryDir());

  registerTypedHandler(dispatcher, 'library:getDir', async () => {
    return await getLibDir();
  });

  registerTypedHandler(dispatcher, 'library:pickDir', async event => {
    const current = await getLibDir();
    const win = ctx.winOf ? ctx.winOf(event) : undefined;
    const r = await dialog.showOpenDialog(win, {
      title: 'Chọn thư mục Thư viện bộ thẻ',
      defaultPath: current,
      properties: ['openDirectory', 'createDirectory'],
    });
    if (r.canceled || !r.filePaths.length) return null;
    const picked = path.resolve(r.filePaths[0]);
    await fsutil.saveSettingsFile(ctx.paths.settingsFile(), { libraryDir: picked });
    if (ctx.watchPath) ctx.watchPath(picked);
    return picked;
  });

  registerTypedHandler(dispatcher, 'library:setDir', async (_event, req: any) => {
    const dir = typeof req === 'object' && req !== null ? req.dir : req;
    if (typeof dir !== 'string' || !dir.trim()) return { ok: false, error: 'Đường dẫn không hợp lệ.' };
    const resolved = path.resolve(dir);
    await fs.mkdir(resolved, { recursive: true }).catch(() => {});
    await fsutil.saveSettingsFile(ctx.paths.settingsFile(), { libraryDir: resolved });
    if (ctx.watchPath) ctx.watchPath(resolved);
    return { ok: true, libraryDir: resolved };
  });

  registerTypedHandler(dispatcher, 'library:scan', async () => {
    const libDir = await getLibDir();
    if (ctx.watchPath) ctx.watchPath(libDir);
    return await libraryService.scanLibrary(libDir);
  });
}
