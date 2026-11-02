const { contextBridge, ipcRenderer } = require('electron');

// Preload: contextIsolation: true, nodeIntegration: false.
// Chỉ expose các hàm cụ thể qua window.api, không lộ ipcRenderer hay Node internals.
contextBridge.exposeInMainWorld('api', {
  platform: process.platform,

  // Bộ thẻ
  openDecks: filePath => ipcRenderer.invoke('deck:open', filePath),
  newDeck: () => ipcRenderer.invoke('deck:new'),
  duplicateDeck: oldDeckKey => ipcRenderer.invoke('deck:duplicate', oldDeckKey),
  importDeck: kind => ipcRenderer.invoke('deck:import', kind),
  saveDeck: (deckKey, deckText, opts) => ipcRenderer.invoke('deck:save', { deckKey, deckText, ...opts }),
  closeDeck: deckKey => ipcRenderer.invoke('deck:close', deckKey),
  showInFolder: filePath => ipcRenderer.invoke('deck:showInFolder', filePath),
  exportCopy: filePath => ipcRenderer.invoke('deck:exportCopy', filePath),

  // Quản lý ảnh trong gói
  addImages: deckKey => ipcRenderer.invoke('asset:add', deckKey),
  addImageBytes: (deckKey, name, bytes) => ipcRenderer.invoke('asset:addBytes', deckKey, name, bytes),
  listAssets: deckKey => ipcRenderer.invoke('asset:list', deckKey),
  removeAsset: (deckKey, assetPath) => ipcRenderer.invoke('asset:remove', deckKey, assetPath),

  // Tiến độ & Cài đặt
  loadProgress: () => ipcRenderer.invoke('progress:load'),
  saveProgress: d => ipcRenderer.invoke('progress:save', d),
  loadSettings: () => ipcRenderer.invoke('settings:load'),
  saveSettings: d => ipcRenderer.invoke('settings:save', d),

  // Nhập hàng loạt (CSV/TSV/Markdown)
  pickImportFile: () => ipcRenderer.invoke('import:pickFile'),
  previewImport: args => ipcRenderer.invoke('import:preview', args),
  commitImport: args => ipcRenderer.invoke('import:commit', args),

  // Thư viện & Quét thư mục
  getLibraryDir: () => ipcRenderer.invoke('library:getDir'),
  pickLibraryDir: () => ipcRenderer.invoke('library:pickDir'),
  setLibraryDir: dir => ipcRenderer.invoke('library:setDir', dir),
  scanLibrary: () => ipcRenderer.invoke('library:scan'),

  // Bản nháp Editor (Auto-save)
  saveDraft: (metaId, deckKey, deckText) => ipcRenderer.invoke('draft:save', { metaId, deckKey, deckText }),
  deleteDraft: metaId => ipcRenderer.invoke('draft:delete', metaId),
  listDrafts: () => ipcRenderer.invoke('draft:list'),
  loadDraft: draftId => ipcRenderer.invoke('draft:load', draftId),

  // Sao lưu & Import / Export tiến độ
  exportProgress: () => ipcRenderer.invoke('progress:export'),
  pickImportProgress: () => ipcRenderer.invoke('progress:pickImport'),
  applyImportProgress: opts => ipcRenderer.invoke('progress:applyImport', opts),
  listBackups: () => ipcRenderer.invoke('backup:list'),
  createBackup: () => ipcRenderer.invoke('backup:create'),
  restoreBackup: name => ipcRenderer.invoke('backup:restore', name),
  openBackupsFolder: () => ipcRenderer.invoke('backup:openFolder'),

  // Đăng ký sự kiện từ main (trả về hàm huỷ đăng ký)
  onDeckChanged: cb => {
    const handler = (_event, data) => cb(data);
    ipcRenderer.on('deck:changed', handler);
    return () => ipcRenderer.removeListener('deck:changed', handler);
  },
  onWatchError: cb => {
    const handler = (_event, data) => cb(data);
    ipcRenderer.on('deck:watchError', handler);
    return () => ipcRenderer.removeListener('deck:watchError', handler);
  },
  onFileAdded: cb => {
    const handler = (_event, data) => cb(data);
    ipcRenderer.on('deck:fileAdded', handler);
    return () => ipcRenderer.removeListener('deck:fileAdded', handler);
  },
  onFileRemoved: cb => {
    const handler = (_event, data) => cb(data);
    ipcRenderer.on('deck:fileRemoved', handler);
    return () => ipcRenderer.removeListener('deck:fileRemoved', handler);
  },
  onOpenExternal: cb => {
    const handler = (_event, data) => cb(data);
    ipcRenderer.on('deck:openExternal', handler);
    return () => ipcRenderer.removeListener('deck:openExternal', handler);
  },
  notifyReady: () => ipcRenderer.send('app:ready'),
});
