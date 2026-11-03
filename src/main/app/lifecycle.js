// src/main/app/lifecycle.ts — Vòng đời ứng dụng (whenReady, before-quit, activate, window-all-closed)
import fs from 'node:fs/promises';
import electron from 'electron';
import * as assetprotocol from '../../core/assetprotocol.js';
import { DatabaseManager } from '../db/index.js';
import { WatcherService } from '../services/watcher-service.js';
import { ensureDailyBackup } from '../services/backup-service.js';
import { getActiveLibraryDir } from '../services/library-service.js';
import { createWindow, getMainWindow, winOf } from './window.js';
import { ExternalFilesManager } from './external-files.js';
import { registerAll } from '../ipc/register.js';
const { app, protocol, BrowserWindow, ipcMain } = electron || {};
export function initAppLifecycle(paths, packageStore, preloadPath, htmlPath) {
    const knownSaves = new Map();
    let dbManager;
    let watcherService;
    const sendToRenderer = (channel, payload) => {
        const win = getMainWindow();
        if (win && !win.isDestroyed()) {
            win.webContents.send(channel, payload);
        }
    };
    const extFiles = new ExternalFilesManager(sendToRenderer);
    if (ipcMain) {
        ipcMain.on('app:ready', () => {
            extFiles.onRendererReady();
        });
    }
    if (app) {
        app.on('second-instance', async (_event, commandLine) => {
            const win = getMainWindow();
            if (win) {
                if (win.isMinimized())
                    win.restore();
                win.focus();
                const files = extFiles.extractSdeckFilesFromArgv(commandLine);
                await extFiles.handleExternalFiles(files);
            }
        });
        app.on('open-file', async (event, filePath) => {
            event.preventDefault();
            await extFiles.handleExternalFiles([filePath]);
        });
    }
    app.whenReady().then(async () => {
        // 1. Database SQLite
        try {
            dbManager = DatabaseManager.getInstance(paths.userDataDir());
        }
        catch (e) {
            console.error('[Database Init Error]', e);
        }
        // 2. Watcher Service
        watcherService = new WatcherService({
            packageStore,
            knownSaves,
            notify: sendToRenderer,
        });
        // 3. Custom scheme asset://
        if (protocol) {
            protocol.handle('asset', (req) => {
                try {
                    const res = assetprotocol.handleAssetUrl(req.url, {
                        resolveDeckKey: (k) => packageStore.get(k),
                    });
                    if (res.status === 200) {
                        return new Response(res.data, { headers: res.headers });
                    }
                    return new Response('Not found', { status: 404 });
                }
                catch {
                    return new Response('Not found', { status: 404 });
                }
            });
        }
        // 4. Register IPC Handlers
        registerAll(ipcMain, {
            dbManager,
            packageStore,
            paths,
            winOf,
            notify: sendToRenderer,
            watchPath: (dir) => watcherService?.watchPath(dir),
            knownSaves,
        });
        // 5. Thư mục lưu trữ
        await fs.mkdir(paths.backupsDir(), { recursive: true }).catch(() => { });
        await fs.mkdir(paths.draftsDir(), { recursive: true }).catch(() => { });
        const libDir = await getActiveLibraryDir(paths.settingsFile(), paths.defaultLibraryDir());
        await fs.mkdir(libDir, { recursive: true }).catch(() => { });
        watcherService.watchPath(libDir);
        // 6. Sao lưu tự động
        const backupDeps = {
            backupsDir: paths.backupsDir(),
            progressFile: paths.progressFile(),
            dbManager,
        };
        await ensureDailyBackup(backupDeps).catch(e => console.error('[Backup Error]', e));
        setInterval(() => {
            ensureDailyBackup(backupDeps).catch(e => console.error('[Backup Error]', e));
        }, 3600000);
        // 7. Tạo cửa sổ chính
        createWindow(preloadPath, htmlPath);
        // 8. Argv mở file ban đầu
        const argvFiles = extFiles.extractSdeckFilesFromArgv(process.argv);
        if (argvFiles.length > 0) {
            extFiles.handleExternalFiles(argvFiles);
        }
        app.on('activate', () => {
            if (BrowserWindow && BrowserWindow.getAllWindows().length === 0) {
                createWindow(preloadPath, htmlPath);
            }
        });
    });
    app.on('before-quit', () => {
        if (watcherService) {
            watcherService.closeAll();
        }
        if (dbManager) {
            try {
                dbManager.close();
            }
            catch { }
        }
    });
    app.on('window-all-closed', () => {
        if (process.platform !== 'darwin') {
            app.quit();
        }
    });
}
//# sourceMappingURL=lifecycle.js.map