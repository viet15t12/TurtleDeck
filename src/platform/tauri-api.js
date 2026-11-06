// src/platform/tauri-api.js — Lớp tương thích window.api cho Tauri v2 thay thế preload.ts của Electron
import { ARRAY_CHANNELS, getCommandName } from './channels.js';

/**
 * Gọi command Tauri với xử lý lỗi chuẩn hoá
 * @param {string} cmd
 * @param {any} [args]
 * @returns {Promise<any>}
 */
async function rawInvoke(cmd, args) {
  if (typeof window !== 'undefined' && window.__TAURI_INTERNALS__ && typeof window.__TAURI_INTERNALS__.invoke === 'function') {
    return window.__TAURI_INTERNALS__.invoke(cmd, args);
  }
  // Thử dynamic import nếu có
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    return invoke(cmd, args);
  } catch (err) {
    throw new Error(`Tauri invoke không khả dụng cho lệnh "${cmd}": ${err?.message || err}`);
  }
}

/**
 * Đăng ký listener sự kiện từ Tauri
 * @param {string} event
 * @param {Function} callback
 * @returns {Promise<() => void>}
 */
async function rawListen(event, callback) {
  try {
    const { listen } = await import('@tauri-apps/api/event');
    const unlisten = await listen(event, (e) => callback(e.payload));
    return unlisten;
  } catch (err) {
    console.warn(`Không thể đăng ký listener cho sự kiện "${event}":`, err);
    return () => {};
  }
}

/**
 * Gọi IPC Typed tương thích Electron
 * @param {string} channel
 * @param {any} [data]
 * @returns {Promise<any>}
 */
export async function invokeTyped(channel, data) {
  const command = getCommandName(channel);
  let args = {};

  if (data !== undefined && data !== null) {
    if (channel === 'progress:save' || channel === 'settings:save') {
      args = typeof data === 'object' && !Array.isArray(data) && 'data' in data ? data : { data };
    } else if (typeof data === 'object' && !Array.isArray(data)) {
      args = data;
    } else {
      // Dữ liệu nguyên thuỷ hoặc mảng: chuyển thành tham số phù hợp
      args = { value: data };
    }
  }

  try {
    return await rawInvoke(command, args);
  } catch (err) {
    const errorMsg = err?.message || (typeof err === 'string' ? err : JSON.stringify(err));
    console.warn(`[Tauri IPC] ${channel} -> ${command} error:`, errorMsg);

    // Kênh mảng trả [] thay vì ném lỗi để tránh crash renderer (theo Issue 12)
    if (ARRAY_CHANNELS.has(channel)) {
      return [];
    }
    return { ok: false, error: errorMsg };
  }
}

/**
 * Đăng ký sự kiện từ backend
 * @param {string} channel
 * @param {Function} callback
 * @returns {() => void}
 */
export function onEvent(channel, callback) {
  let unlistenFn = null;
  let active = true;

  rawListen(channel, (payload) => {
    if (active) callback(payload);
  }).then((fn) => {
    unlistenFn = fn;
    if (!active && unlistenFn) unlistenFn();
  });

  return () => {
    active = false;
    if (unlistenFn) {
      unlistenFn();
    }
  };
}

// Xác định nền tảng (Linux, Windows, v.v.)
const userAgent = typeof navigator !== 'undefined' ? navigator.userAgent.toLowerCase() : '';
const platform = userAgent.includes('win') ? 'win32' : userAgent.includes('mac') ? 'darwin' : 'linux';

export const api = {
  platform,

  // IPC có Type
  invokeTyped,
  onEvent,

  // Gói thẻ có type
  openDeck: (filePath) => invokeTyped('deck:open', filePath ? { filePath } : undefined),
  saveDeckTyped: (params) => invokeTyped('deck:save', params),
  queryItems: (params) => invokeTyped('deck:queryItems', params),

  // SRS Typed
  getDeckSummary: (deckId, now) => invokeTyped('srs:getDeckSummary', { deckId, now }),
  getDueItems: (deckId, limit, now) => invokeTyped('srs:getDueItems', { deckId, limit, now }),
  recordReview: (params) => invokeTyped('srs:recordReview', params),
  getCard: (params) => invokeTyped('srs:getCard', params),

  // Thống kê Typed
  getDeckReport: (deckId, days) => invokeTyped('stats:getDeckReport', { deckId, days }),
  getOverallStreak: () => invokeTyped('stats:getOverallStreak', undefined),

  // Meta (sao, ghi chú)
  getItemMeta: (deckId, itemId) => invokeTyped('meta:get', { deckId, itemId }),
  setItemStarred: (deckId, itemId, starred) => invokeTyped('meta:setStarred', { deckId, itemId, starred }),
  setItemNote: (deckId, itemId, note) => invokeTyped('meta:setNote', { deckId, itemId, note }),

  // ── Các hàm giao diện tương thích ngược ──
  openDecks: (filePath) => invokeTyped('deck:open', filePath ? { filePath } : undefined),
  newDeck: () => invokeTyped('deck:new', undefined),
  duplicateDeck: (oldDeckKey) => invokeTyped('deck:duplicate', { oldDeckKey }),
  importDeck: (kind) => invokeTyped('deck:import', { kind }),
  importSdeck: (targetFolderId, filePaths) =>
    invokeTyped('deck:importSdeck', { targetFolderId, filePaths }),
  saveDeck: (deckKey, deckText, opts) =>
    invokeTyped('deck:save', { deckKey, deckText, ...opts }),
  closeDeck: (deckKey) => invokeTyped('deck:close', { deckKey }),
  deleteDeck: (opts) => invokeTyped('deck:delete', opts),
  showInFolder: (filePath) => invokeTyped('deck:showInFolder', { filePath }),
  exportCopy: (filePath) => invokeTyped('deck:exportCopy', { filePath }),

  // Quản lý ảnh trong gói
  addImages: (deckKey) => invokeTyped('asset:add', { deckKey }),
  addImageBytes: (deckKey, name, bytes) =>
    invokeTyped('asset:addBytes', { deckKey, name, bytes: Array.from(bytes) }),
  listAssets: (deckKey) => invokeTyped('asset:list', { deckKey }),
  removeAsset: (deckKey, assetPath) => invokeTyped('asset:remove', { deckKey, assetPath }),

  // Tiến độ & Cài đặt
  loadProgress: () => invokeTyped('progress:load', undefined),
  saveProgress: (d) => invokeTyped('progress:save', { data: d }),
  loadSettings: () => invokeTyped('settings:load', undefined),
  saveSettings: (d) => invokeTyped('settings:save', { data: d }),

  // Nhập hàng loạt (CSV/TSV/Markdown)
  pickImportFile: () => invokeTyped('import:pickFile', undefined),
  previewImport: (args) => invokeTyped('import:preview', args),
  commitImport: (args) => invokeTyped('import:commit', args),

  // Thư viện & Quét thư mục
  getLibraryDir: () => invokeTyped('library:getDir', undefined),
  pickLibraryDir: () => invokeTyped('library:pickDir', undefined),
  setLibraryDir: (dir) => invokeTyped('library:setDir', { dir }),
  scanLibrary: () => invokeTyped('library:scan', undefined),

  // Bản nháp Editor (Auto-save)
  saveDraft: (metaId, deckKey, deckText) => invokeTyped('draft:save', { metaId, deckKey, deckText }),
  deleteDraft: (metaId) => invokeTyped('draft:delete', { metaId }),
  listDrafts: () => invokeTyped('draft:list', undefined),
  loadDraft: (draftId) => invokeTyped('draft:load', { draftId }),

  // Sao lưu & Import / Export tiến độ
  exportProgress: () => invokeTyped('progress:export', undefined),
  pickImportProgress: () => invokeTyped('progress:pickImport', undefined),
  applyImportProgress: (opts) => invokeTyped('progress:applyImport', opts),
  listBackups: () => invokeTyped('backup:list', undefined),
  createBackup: () => invokeTyped('backup:create', undefined),
  createFullBackup: (destPath) => invokeTyped('backup:createFull', destPath ? { destPath } : undefined),
  restoreBackup: (name) => invokeTyped('backup:restore', { name }),
  restoreFullBackup: (filePath) => invokeTyped('backup:restoreFull', filePath ? { filePath } : undefined),
  openBackupsFolder: () => invokeTyped('backup:openFolder', undefined),

  // Quản lý thư mục cây phân cấp & vị trí bộ thẻ
  createFolder: (name, parentId = null) => invokeTyped('folder:create', { name, parentId }),
  renameFolder: (id, newName) => invokeTyped('folder:rename', { id, newName }),
  moveFolder: (id, newParentId = null) => invokeTyped('folder:move', { id, newParentId }),
  deleteFolder: (id) => invokeTyped('folder:delete', { id }),
  getFolderTree: () => invokeTyped('folder:getTree', undefined),
  moveDeck: (deckId, newFolderId = null) => invokeTyped('deck:move', { deckId, newFolderId }),
  linkDeck: (deckId, targetFolderId = null) => invokeTyped('deck:link', { deckId, targetFolderId }),
  unlinkDeck: (locationId, deleteFile = false) => invokeTyped('deck:unlink', { locationId, deleteFile }),
  getDeckLocations: (deckId) => invokeTyped('deck:getLocations', deckId ? { deckId } : undefined),

  // Đăng ký sự kiện từ backend
  onDeckChanged: (cb) => onEvent('deck:changed', cb),
  onFolderChanged: (cb) => onEvent('folder:changed', cb),
  onDeckMoved: (cb) => onEvent('deck:moved', cb),
  onDeckLinked: (cb) => onEvent('deck:linked', cb),
  onDeckUnlinked: (cb) => onEvent('deck:unlinked', cb),
  onWatchError: (cb) => onEvent('deck:watchError', cb),
  onFileAdded: (cb) => onEvent('deck:fileAdded', cb),
  onFileRemoved: (cb) => onEvent('deck:fileRemoved', cb),
  onOpenExternal: (cb) => onEvent('deck:openExternal', cb),
  notifyReady: () => {
    // Thông báo app sẵn sàng
    rawInvoke('app_ready', {}).catch(() => {});
  },
};

// Đính kèm vào window.api nếu chạy trong môi trường browser/webview
if (typeof window !== 'undefined') {
  window.api = api;
}

export default api;

