// src/main/app/window.ts — Quản lý cửa sổ chính của ứng dụng
import fs from 'node:fs';
import path from 'node:path';
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
  const iconCandidate = path.resolve(import.meta.dirname, '../../../build/icon.png');
  const icon = fs.existsSync(iconCandidate) ? iconCandidate : undefined;

  mainWindow = new BrowserWindow({
    width: 1100,
    height: 760,
    title: 'Turtle Deck',
    icon,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('will-navigate', (event: any) => event.preventDefault());
  mainWindow.webContents.on('console-message', (_event: any, ...args: any[]) => {
    let message = '';
    let line = 0;
    let sourceId = '';
    if (typeof args[0] === 'object' && args[0] !== null && 'message' in args[0]) {
      // Modern Electron signature (event, { message, level, line, sourceId })
      message = args[0].message;
      line = args[0].line;
      sourceId = args[0].sourceId;
    } else {
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
