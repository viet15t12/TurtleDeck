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
const ARRAY_CHANNELS = new Set([
    'deck:open',
    'asset:add',
    'asset:list',
    'draft:list',
    'backup:list',
    'library:scan',
]);
export function getFallbackErrorResponse(channel, errorMsg) {
    if (ARRAY_CHANNELS.has(channel)) {
        return [];
    }
    return { ok: false, error: `Lỗi không mong muốn: ${errorMsg}` };
}
export function isValidSenderFrame(url) {
    if (!url)
        return true;
    return url.startsWith('file://') && url.includes('src/index.html');
}
export function registerTypedHandler(dispatcher, channel, fn) {
    dispatcher.handle(channel, async (event, ...args) => {
        try {
            if (event?.senderFrame?.url && !isValidSenderFrame(event.senderFrame.url)) {
                console.warn(`[Security] Blocked IPC from unauthorized origin: ${event.senderFrame.url}`);
                return getFallbackErrorResponse(channel, 'Yêu cầu bị từ chối do nguồn gốc không hợp lệ.');
            }
            const param = args.length <= 1 ? args[0] : args;
            return await fn(event, param);
        }
        catch (e) {
            const msg = (e && e.message) || String(e);
            console.error(`[IPC Error] ${channel}:`, e);
            return getFallbackErrorResponse(channel, msg);
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