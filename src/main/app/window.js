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
    mainWindow.webContents.on('console-message', (_event, ...args) => {
        let message = '';
        let line = 0;
        let sourceId = '';
        if (typeof args[0] === 'object' && args[0] !== null && 'message' in args[0]) {
            // Modern Electron signature (event, { message, level, line, sourceId })
            message = args[0].message;
            line = args[0].line;
            sourceId = args[0].sourceId;
        }
        else {
            // Legacy Electron signature (event, level, message, line, sourceId)
            message = args[1];
            line = args[2];
            sourceId = args[3];
        }
        console.log(`[Renderer] ${message} (${sourceId}:${line})`);
    });
    mainWindow.loadFile(htmlPath);
    mainWindow.on('closed', () => {
        mainWindow = null;
    });
    return mainWindow;
}
//# sourceMappingURL=window.js.map