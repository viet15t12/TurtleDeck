// src/main/ipc/import.ipc.ts — Handlers IPC cho nhập dữ liệu hàng loạt
import fs from 'node:fs/promises';
import path from 'node:path';
import electron from 'electron';
const { dialog } = (electron as any) || {};
import { IpcDispatcher, IpcContext, registerTypedHandler } from './register.js';
import * as importService from '../services/import-service.js';

export function registerImportIpc(dispatcher: IpcDispatcher, ctx: IpcContext): void {
  registerTypedHandler(dispatcher, 'import:pickFile', async event => {
    const win = ctx.winOf ? ctx.winOf(event) : undefined;
    const r = await dialog.showOpenDialog(win, {
      title: 'Chọn file nguồn bộ thẻ',
      properties: ['openFile'],
      filters: [
        { name: 'File dữ liệu (.csv, .tsv, .txt, .md, .json)', extensions: ['csv', 'tsv', 'txt', 'md', 'json'] },
        { name: 'Tất cả tập tin', extensions: ['*'] },
      ],
    });
    if (r.canceled || !r.filePaths.length) return { ok: false, canceled: true };
    const p = r.filePaths[0];
    const token = ctx.packageStore.newKey();
    ctx.packageStore.setTempImport(token, p);
    const st = await fs.stat(p);
    return { ok: true, token, path: p, name: path.basename(p), size: st.size };
  });

  registerTypedHandler(dispatcher, 'import:preview', async (_event, args) => {
    return await importService.previewImport(ctx.packageStore, args);
  });

  registerTypedHandler(dispatcher, 'import:commit', async (_event, args) => {
    return importService.commitImport(ctx.packageStore, args);
  });
}
