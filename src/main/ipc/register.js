// src/main/ipc/register.ts — Đăng ký các kênh IPC có kiểm soát kiểu và context
import electron from 'electron';
const { ipcMain } = electron || {};
import { registerSettingsIpc } from './settings.ipc.js';
import { registerProgressIpc } from './progress.ipc.js';
import { registerAssetIpc } from './asset.ipc.js';
import { registerImportIpc } from './import.ipc.js';
import { registerDeckIpc } from './deck.ipc.js';
import { registerLibraryIpc } from './library.ipc.js';
import { registerDraftIpc } from './draft.ipc.js';
import { registerBackupIpc } from './backup.ipc.js';
import { registerTypedIpcHandlers } from '../ipc-handlers.js';
export const defaultDispatcher = ipcMain;
export function registerTypedHandler(dispatcher, channel, fn) {
    dispatcher.handle(channel, async (event, ...args) => {
        try {
            const param = args.length <= 1 ? args[0] : args;
            return await fn(event, param);
        }
        catch (e) {
            console.error(`[IPC Error] ${channel}:`, e);
            return { ok: false, error: (e && e.message) || String(e) };
        }
    });
}
export function registerAll(dispatcher, ctx) {
    registerSettingsIpc(dispatcher, ctx);
    registerProgressIpc(dispatcher, ctx);
    registerAssetIpc(dispatcher, ctx);
    registerImportIpc(dispatcher, ctx);
    registerDeckIpc(dispatcher, ctx);
    registerLibraryIpc(dispatcher, ctx);
    registerDraftIpc(dispatcher, ctx);
    registerBackupIpc(dispatcher, ctx);
    if (ctx.dbManager) {
        registerTypedIpcHandlers(ctx.dbManager, dispatcher);
    }
}
//# sourceMappingURL=register.js.map