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

export function registerTypedHandler<C extends IpcChannel>(
  dispatcher: IpcDispatcher,
  channel: C,
  fn: (event: any, request: IpcRequest<C>) => Promise<IpcResponse<C>> | IpcResponse<C>
): void {
  dispatcher.handle(channel, async (event, ...args: any[]) => {
    try {
      const param = args.length <= 1 ? args[0] : args;
      return await fn(event, param as IpcRequest<C>);
    } catch (e: any) {
      console.error(`[IPC Error] ${channel}:`, e);
      return { ok: false, error: (e && e.message) || String(e) } as any;
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
