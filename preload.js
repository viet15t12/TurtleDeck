const { contextBridge, ipcRenderer } = require('electron');

// Renderer chỉ gọi main qua window.api (contextIsolation: true, nodeIntegration: false).
// GĐ1: mở / nhập / lưu / đóng bộ thẻ, tiến độ, cài đặt. Editor và ảnh (newDeck, asset:*) bổ sung ở GĐ2C.
contextBridge.exposeInMainWorld('api', {
  platform:     process.platform,
  openDecks:    filePath => ipcRenderer.invoke('deck:open', filePath),
  newDeck:      () => ipcRenderer.invoke('deck:new'),
  duplicateDeck:oldDeckKey => ipcRenderer.invoke('deck:duplicate', oldDeckKey),
  importDeck:   kind => ipcRenderer.invoke('deck:import', kind),          // kind: 'file' | 'dir'
  saveDeck:     (deckKey, deckText, opts) => ipcRenderer.invoke('deck:save', { deckKey, deckText, ...opts }),
  closeDeck:    deckKey => ipcRenderer.invoke('deck:close', deckKey),
  addImages:    deckKey => ipcRenderer.invoke('asset:add', deckKey),
  addImageBytes:(deckKey, name, bytes) => ipcRenderer.invoke('asset:addBytes', deckKey, name, bytes),
  listAssets:   deckKey => ipcRenderer.invoke('asset:list', deckKey),
  removeAsset:  (deckKey, assetPath) => ipcRenderer.invoke('asset:remove', deckKey, assetPath),
  loadProgress: () => ipcRenderer.invoke('progress:load'),
  saveProgress: d => ipcRenderer.invoke('progress:save', d),
  loadSettings: () => ipcRenderer.invoke('settings:load'),
  saveSettings: d => ipcRenderer.invoke('settings:save', d),
});
