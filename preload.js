"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// preload.ts — Preload script trung gian giữa Main và Renderer (CJS đơn nhất, chỉ import type)
const electron_1 = require("electron");
function invokeTyped(channel, data) {
    return electron_1.ipcRenderer.invoke(channel, data);
}
function onEvent(channel, callback) {
    const handler = (_event, data) => callback(data);
    electron_1.ipcRenderer.on(channel, handler);
    return () => {
        electron_1.ipcRenderer.removeListener(channel, handler);
    };
}
const api = {
    platform: process.platform,
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
    // ── Các hàm giao diện tương thích ngược (đã chuyển toàn bộ qua invokeTyped) ──
    openDecks: (filePath) => invokeTyped('deck:open', filePath ? { filePath } : undefined),
    newDeck: () => invokeTyped('deck:new', undefined),
    duplicateDeck: (oldDeckKey) => invokeTyped('deck:duplicate', oldDeckKey),
    importDeck: (kind) => invokeTyped('deck:import', kind),
    saveDeck: (deckKey, deckText, opts) => invokeTyped('deck:save', { deckKey, deckText, ...opts }),
    closeDeck: (deckKey) => invokeTyped('deck:close', deckKey),
    showInFolder: (filePath) => invokeTyped('deck:showInFolder', filePath),
    exportCopy: (filePath) => invokeTyped('deck:exportCopy', filePath),
    // Quản lý ảnh trong gói
    addImages: (deckKey) => invokeTyped('asset:add', deckKey),
    addImageBytes: (deckKey, name, bytes) => invokeTyped('asset:addBytes', { deckKey, name, bytes }),
    listAssets: (deckKey) => invokeTyped('asset:list', deckKey),
    removeAsset: (deckKey, assetPath) => invokeTyped('asset:remove', { deckKey, assetPath }),
    // Tiến độ & Cài đặt
    loadProgress: () => invokeTyped('progress:load', undefined),
    saveProgress: (d) => invokeTyped('progress:save', d),
    loadSettings: () => invokeTyped('settings:load', undefined),
    saveSettings: (d) => invokeTyped('settings:save', d),
    // Nhập hàng loạt (CSV/TSV/Markdown)
    pickImportFile: () => invokeTyped('import:pickFile', undefined),
    previewImport: (args) => invokeTyped('import:preview', args),
    commitImport: (args) => invokeTyped('import:commit', args),
    // Thư viện & Quét thư mục
    getLibraryDir: () => invokeTyped('library:getDir', undefined),
    pickLibraryDir: () => invokeTyped('library:pickDir', undefined),
    setLibraryDir: (dir) => invokeTyped('library:setDir', dir),
    scanLibrary: () => invokeTyped('library:scan', undefined),
    // Bản nháp Editor (Auto-save)
    saveDraft: (metaId, deckKey, deckText) => invokeTyped('draft:save', { metaId, deckKey, deckText }),
    deleteDraft: (metaId) => invokeTyped('draft:delete', metaId),
    listDrafts: () => invokeTyped('draft:list', undefined),
    loadDraft: (draftId) => invokeTyped('draft:load', draftId),
    // Sao lưu & Import / Export tiến độ
    exportProgress: () => invokeTyped('progress:export', undefined),
    pickImportProgress: () => invokeTyped('progress:pickImport', undefined),
    applyImportProgress: (opts) => invokeTyped('progress:applyImport', opts),
    listBackups: () => invokeTyped('backup:list', undefined),
    createBackup: () => invokeTyped('backup:create', undefined),
    restoreBackup: (name) => invokeTyped('backup:restore', name),
    openBackupsFolder: () => invokeTyped('backup:openFolder', undefined),
    // Đăng ký sự kiện từ main
    onDeckChanged: (cb) => onEvent('deck:changed', cb),
    onWatchError: (cb) => onEvent('deck:watchError', cb),
    onFileAdded: (cb) => onEvent('deck:fileAdded', cb),
    onFileRemoved: (cb) => onEvent('deck:fileRemoved', cb),
    onOpenExternal: (cb) => onEvent('deck:openExternal', cb),
    notifyReady: () => electron_1.ipcRenderer.send('app:ready'),
};
electron_1.contextBridge.exposeInMainWorld('api', api);
//# sourceMappingURL=preload.js.map