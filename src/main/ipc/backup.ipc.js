// src/main/ipc/backup.ipc.ts — Handlers IPC cho sao lưu và khôi phục tiến độ
import electron from 'electron';
const { shell } = electron || {};
import { registerTypedHandler } from './register.js';
import * as backupService from '../services/backup-service.js';
export function registerBackupIpc(dispatcher, ctx) {
    const getDeps = () => ({
        backupsDir: ctx.paths.backupsDir(),
        progressFile: ctx.paths.progressFile(),
        dbManager: ctx.dbManager,
    });
    registerTypedHandler(dispatcher, 'backup:create', async () => {
        return await backupService.createBackup(getDeps());
    });
    registerTypedHandler(dispatcher, 'backup:list', async () => {
        return await backupService.listBackups(ctx.paths.backupsDir());
    });
    registerTypedHandler(dispatcher, 'backup:restore', async (_event, req) => {
        const name = typeof req === 'object' && req !== null ? req.name : req;
        return await backupService.restoreBackup(getDeps(), name);
    });
    registerTypedHandler(dispatcher, 'backup:openFolder', async () => {
        shell.openPath(ctx.paths.backupsDir());
        return { ok: true };
    });
}
//# sourceMappingURL=backup.ipc.js.map