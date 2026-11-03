// src/main/ipc/register.ts — Đăng ký các kênh IPC có kiểm soát kiểu và context
import electron from 'electron';

const { ipcMain } = (electron as any) || {};
import { IpcContracts, IpcChannel, IpcRequest, IpcResponse } from '../../core/types/ipc.types.js';
import { DatabaseManager } from '../db/index.js';
import { PackageStore } from '../services/package-store.js';
import { AppPaths } from '../app/paths.js';
import { registerSettingsIpc } from './settings.ipc.js';
import { registerProgressIpc } from './progress.ipc.js';
import { registerAssetIpc } from './asset.ipc.js';
import { registerImportIpc } from './import.ipc.js';
import { registerDeckIpc } from './deck.ipc.js';
import { registerLibraryIpc } from './library.ipc.js';
import { registerDraftIpc } from './draft.ipc.js';
import { registerBackupIpc } from './backup.ipc.js';
import { registerTypedIpcHandlers } from '../ipc-handlers.js';

export interface IpcDispatcher {
  handle(channel: string, listener: (event: any, ...args: any[]) => any): void;
  on?(channel: string, listener: (event: any, ...args: any[]) => any): void;
}

export interface IpcContext {
  dbManager?: DatabaseManager;
  packageStore: PackageStore;
  paths: AppPaths;
  winOf?: (event?: any) => any;
  notify?: (channel: string, payload: any) => void;
  watchPath?: (dir: string) => void;
  knownSaves?: Map<string, number>;
}

export const defaultDispatcher: IpcDispatcher = ipcMain;

const ARRAY_CHANNELS = new Set([
  'deck:open',
  'asset:add',
  'asset:list',
  'draft:list',
  'backup:list',
  'library:scan',
]);

export function getFallbackErrorResponse(channel: string, errorMsg: string): any {
  if (ARRAY_CHANNELS.has(channel)) {
    return [];
  }
  return { ok: false, error: `Lỗi không mong muốn: ${errorMsg}` };
}

export function isValidSenderFrame(url?: string): boolean {
  if (!url) return true;
  return url.startsWith('file://') && url.includes('src/index.html');
}

export function registerTypedHandler<C extends IpcChannel>(
  dispatcher: IpcDispatcher,
  channel: C,
  fn: (event: any, request: IpcRequest<C>) => Promise<IpcResponse<C>> | IpcResponse<C>
): void {
  dispatcher.handle(channel, async (event, ...args: any[]) => {
    try {
      if (event?.senderFrame?.url && !isValidSenderFrame(event.senderFrame.url)) {
        console.warn(`[Security] Blocked IPC from unauthorized origin: ${event.senderFrame.url}`);
        return getFallbackErrorResponse(channel, 'Yêu cầu bị từ chối do nguồn gốc không hợp lệ.');
      }
      const param = args.length <= 1 ? args[0] : args;
      return await fn(event, param as IpcRequest<C>);
    } catch (e: any) {
      const msg = (e && e.message) || String(e);
      console.error(`[IPC Error] ${channel}:`, e);
      return getFallbackErrorResponse(channel, msg);
    }
  });
}

export function registerAll(dispatcher: IpcDispatcher, ctx: IpcContext): void {
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
