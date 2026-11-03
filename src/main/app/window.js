// src/main/app/window.ts — Quản lý cửa sổ chính của ứng dụng
import electron from 'electron';
const { BrowserWindow } = electron || {};
let mainWindow = null;
export function getMainWindow() {
    return mainWindow;
}
export function winOf(event) {
    return (event && BrowserWindow ? BrowserWindow.fromWebContents(event.sender) : mainWindow) || undefined;
}
export function createWindow(preloadPath, htmlPath) {
    mainWindow = new BrowserWindow({
        width: 1100,
        height: 760,
        webPreferences: {
            preload: preloadPath,
            contextIsolation: true,
            nodeIntegration: false,
        },
    });
    mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    mainWindow.webContents.on('will-navigate', (event) => event.preventDefault());
    mainWindow.webContents.on('console-message', (_event, _level, message, line, sourceId) => {
        console.log(`[Renderer] ${message} (${sourceId}:${line})`);
    });
    mainWindow.loadFile(htmlPath);
    mainWindow.on('closed', () => {
        mainWindow = null;
    });
    return mainWindow;
}
//# sourceMappingURL=window.js.map