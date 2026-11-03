// src/main/app/window.ts — Quản lý cửa sổ chính của ứng dụng
import electron from 'electron';

const { BrowserWindow } = (electron as any) || {};

let mainWindow: any = null;

export function getMainWindow(): any {
  return mainWindow;
}

export function winOf(event?: any): any {
  return (event && BrowserWindow ? BrowserWindow.fromWebContents(event.sender) : mainWindow) || undefined;
}

export function createWindow(preloadPath: string, htmlPath: string): any {
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
  mainWindow.webContents.on('will-navigate', (event: any) => event.preventDefault());
  mainWindow.webContents.on('console-message', (_event: any, _level: any, message: any, line: any, sourceId: any) => {
    console.log(`[Renderer] ${message} (${sourceId}:${line})`);
  });
  mainWindow.loadFile(htmlPath);

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  return mainWindow;
}
