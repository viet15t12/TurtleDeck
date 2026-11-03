// preload.ts — Preload script trung gian giữa Main và Renderer (CJS đơn nhất, chỉ import type)
import { contextBridge, ipcRenderer } from 'electron';
import type {
  IpcContracts,
  IpcChannel,
  IpcRequest,
  IpcResponse,
  IpcEvents,
  IpcEventChannel,
} from './src/core/types/ipc.types.js';

function invokeTyped<C extends IpcChannel>(
  channel: C,
  data?: IpcRequest<C>
): Promise<IpcResponse<C>> {
  return ipcRenderer.invoke(channel, data);
}

function onEvent<E extends IpcEventChannel>(
  channel: E,
  callback: (payload: IpcEvents[E]) => void
): () => void {
  const handler = (_event: any, data: IpcEvents[E]) => callback(data);
  ipcRenderer.on(channel, handler);
  return () => {
    ipcRenderer.removeListener(channel, handler);
  };
}

const api = {
  platform: process.platform,

  // IPC có Type
  invokeTyped,
  onEvent,

  // Gói thẻ có type
  openDeck: (filePath?: string | string[]) => invokeTyped('deck:open', filePath ? { filePath } : undefined),
  saveDeckTyped: (params: IpcRequest<'deck:save'>) => invokeTyped('deck:save', params),
  queryItems: (params: IpcRequest<'deck:queryItems'>) => invokeTyped('deck:queryItems', params),

  // SRS Typed
  getDeckSummary: (deckId: string, now?: number) => invokeTyped('srs:getDeckSummary', { deckId, now }),
  getDueItems: (deckId: string, limit?: number, now?: number) => invokeTyped('srs:getDueItems', { deckId, limit, now }),
  recordReview: (params: IpcRequest<'srs:recordReview'>) => invokeTyped('srs:recordReview', params),
  getCard: (params: IpcRequest<'srs:getCard'>) => invokeTyped('srs:getCard', params),

  // Thống kê Typed
  getDeckReport: (deckId: string, days?: number) => invokeTyped('stats:getDeckReport', { deckId, days }),
  getOverallStreak: () => invokeTyped('stats:getOverallStreak', undefined),

  // Meta (sao, ghi chú)
  getItemMeta: (deckId: string, itemId: string) => invokeTyped('meta:get', { deckId, itemId }),
  setItemStarred: (deckId: string, itemId: string, starred: boolean) => invokeTyped('meta:setStarred', { deckId, itemId, starred }),
  setItemNote: (deckId: string, itemId: string, note: string) => invokeTyped('meta:setNote', { deckId, itemId, note }),

  // ── Các hàm giao diện tương thích ngược (đã chuyển toàn bộ qua invokeTyped) ──
  openDecks: (filePath?: string | string[]) => invokeTyped('deck:open', filePath ? { filePath } : undefined),
  newDeck: () => invokeTyped('deck:new', undefined),
  duplicateDeck: (oldDeckKey: string) => invokeTyped('deck:duplicate', oldDeckKey),
  importDeck: (kind: string) => invokeTyped('deck:import', kind),
  saveDeck: (deckKey: string, deckText?: string, opts?: any) => invokeTyped('deck:save', { deckKey, deckText, ...opts }),
  closeDeck: (deckKey: string) => invokeTyped('deck:close', deckKey),
  showInFolder: (filePath: string) => invokeTyped('deck:showInFolder', filePath),
  exportCopy: (filePath: string) => invokeTyped('deck:exportCopy', filePath),

  // Quản lý ảnh trong gói
  addImages: (deckKey: string) => invokeTyped('asset:add', deckKey),
  addImageBytes: (deckKey: string, name: string, bytes: any) => invokeTyped('asset:addBytes', { deckKey, name, bytes }),
  listAssets: (deckKey: string) => invokeTyped('asset:list', deckKey),
  removeAsset: (deckKey: string, assetPath: string) => invokeTyped('asset:remove', { deckKey, assetPath }),

  // Tiến độ & Cài đặt
  loadProgress: () => invokeTyped('progress:load', undefined),
  saveProgress: (d: any) => invokeTyped('progress:save', d),
  loadSettings: () => invokeTyped('settings:load', undefined),
  saveSettings: (d: any) => invokeTyped('settings:save', d),

  // Nhập hàng loạt (CSV/TSV/Markdown)
  pickImportFile: () => invokeTyped('import:pickFile', undefined),
  previewImport: (args: any) => invokeTyped('import:preview', args),
  commitImport: (args: any) => invokeTyped('import:commit', args),

  // Thư viện & Quét thư mục
  getLibraryDir: () => invokeTyped('library:getDir', undefined),
  pickLibraryDir: () => invokeTyped('library:pickDir', undefined),
  setLibraryDir: (dir: string) => invokeTyped('library:setDir', dir),
  scanLibrary: () => invokeTyped('library:scan', undefined),

  // Bản nháp Editor (Auto-save)
  saveDraft: (metaId: string, deckKey: string, deckText: string) => invokeTyped('draft:save', { metaId, deckKey, deckText }),
  deleteDraft: (metaId: string) => invokeTyped('draft:delete', metaId),
  listDrafts: () => invokeTyped('draft:list', undefined),
  loadDraft: (draftId: string) => invokeTyped('draft:load', draftId),

  // Sao lưu & Import / Export tiến độ
  exportProgress: () => invokeTyped('progress:export', undefined),
  pickImportProgress: () => invokeTyped('progress:pickImport', undefined),
  applyImportProgress: (opts: any) => invokeTyped('progress:applyImport', opts),
  listBackups: () => invokeTyped('backup:list', undefined),
  createBackup: () => invokeTyped('backup:create', undefined),
  restoreBackup: (name: string) => invokeTyped('backup:restore', name),
  openBackupsFolder: () => invokeTyped('backup:openFolder', undefined),

  // Đăng ký sự kiện từ main
  onDeckChanged: (cb: (data: any) => void) => onEvent('deck:changed', cb),
  onWatchError: (cb: (data: any) => void) => onEvent('deck:watchError', cb),
  onFileAdded: (cb: (data: any) => void) => onEvent('deck:fileAdded', cb),
  onFileRemoved: (cb: (data: any) => void) => onEvent('deck:fileRemoved', cb),
  onOpenExternal: (cb: (data: any) => void) => onEvent('deck:openExternal', cb),
  notifyReady: () => ipcRenderer.send('app:ready'),
};

export type WindowApi = typeof api;
contextBridge.exposeInMainWorld('api', api);
