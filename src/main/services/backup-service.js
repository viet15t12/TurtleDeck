// src/main/services/backup-service.ts — Quản lý sao lưu, khôi phục và dọn dẹp bản sao lưu cũ (không import 'electron')
import fs from 'node:fs/promises';
import path from 'node:path';
import * as fsutil from '../../core/fsutil.js';
import * as progressio from '../../core/progressio.js';
const errMsg = (e) => (e && e.message) || String(e);
export async function pruneTemporaryDbBackups(dir, maxKeep = 5) {
    try {
        const files = await fs.readdir(dir);
        const preImport = files.filter(f => f.startsWith('pre-import-') && f.endsWith('.db')).sort();
        const preRestore = files.filter(f => f.startsWith('pre-restore-') && f.endsWith('.db')).sort();
        if (preImport.length > maxKeep) {
            const toDelete = preImport.slice(0, preImport.length - maxKeep);
            for (const f of toDelete) {
                await fs.rm(path.join(dir, f), { force: true }).catch(() => { });
            }
        }
        if (preRestore.length > maxKeep) {
            const toDelete = preRestore.slice(0, preRestore.length - maxKeep);
            for (const f of toDelete) {
                await fs.rm(path.join(dir, f), { force: true }).catch(() => { });
            }
        }
    }
    catch { }
}
export async function ensureDailyBackup(deps) {
    const tz = deps.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone;
    const now = deps.now ? deps.now() : Date.now();
    const fileName = progressio.backupFileName(now, tz);
    const dir = deps.backupsDir;
    await fs.mkdir(dir, { recursive: true }).catch(() => { });
    const dest = path.join(dir, fileName);
    try {
        await fs.stat(dest);
    }
    catch (e) {
        if (e.code === 'ENOENT') {
            try {
                if (deps.dbManager) {
                    const dbBackupName = fileName.replace(/\.json$/, '.db');
                    await deps.dbManager.backup(path.join(dir, dbBackupName));
                    const progressData = deps.dbManager.srs.exportProgressData();
                    await fsutil.atomicWrite(dest, JSON.stringify(progressData, null, 2));
                }
                else {
                    const pStat = await fs.stat(deps.progressFile);
                    if (pStat.isFile()) {
                        const content = await fs.readFile(deps.progressFile);
                        await fsutil.atomicWrite(dest, content);
                    }
                }
            }
            catch (err) {
                console.warn('[Backup] Lỗi sao lưu hàng ngày:', err);
            }
        }
    }
    // Dọn dẹp bản sao lưu cũ, chỉ giữ 7 ngày mới nhất
    try {
        const files = await fs.readdir(dir);
        const toDel = progressio.pickBackupsToDelete(files, 7);
        for (const name of toDel) {
            await fs.rm(path.join(dir, name), { force: true }).catch(() => { });
            const dbSibling = name.replace(/\.json$/, '.db');
            await fs.rm(path.join(dir, dbSibling), { force: true }).catch(() => { });
        }
    }
    catch { }
    // Dọn dẹp các bản sao lưu db tạm thời
    await pruneTemporaryDbBackups(dir, 5);
}
export async function createBackup(deps) {
    const dir = deps.backupsDir;
    await fs.mkdir(dir, { recursive: true }).catch(() => { });
    const tz = deps.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone;
    const now = deps.now ? deps.now() : Date.now();
    const name = `progress-${progressio.dayKey(now, tz)}-manual-${now}.json`;
    const dest = path.join(dir, name);
    try {
        if (deps.dbManager) {
            const dbBackupName = name.replace(/\.json$/, '.db');
            await deps.dbManager.backup(path.join(dir, dbBackupName));
            const progressData = deps.dbManager.srs.exportProgressData();
            await fsutil.atomicWrite(dest, JSON.stringify(progressData, null, 2));
            return { ok: true, name };
        }
        const content = await fs.readFile(deps.progressFile);
        await fsutil.atomicWrite(dest, content);
        return { ok: true, name };
    }
    catch (e) {
        return { ok: false, error: errMsg(e) };
    }
}
export async function listBackups(backupsDir) {
    await fs.mkdir(backupsDir, { recursive: true }).catch(() => { });
    let files;
    try {
        files = await fs.readdir(backupsDir);
    }
    catch {
        return [];
    }
    const result = [];
    for (const f of files) {
        if (!f.endsWith('.json'))
            continue;
        try {
            const st = await fs.stat(path.join(backupsDir, f));
            result.push({ name: f, size: st.size, mtime: st.mtimeMs });
        }
        catch { }
    }
    result.sort((a, b) => b.mtime - a.mtime);
    return result;
}
export async function restoreBackup(deps, name) {
    if (typeof name !== 'string' || !/^progress-[\w-]+\.json$/.test(name)) {
        return { ok: false, error: 'Tên file sao lưu không hợp lệ.' };
    }
    const src = path.join(deps.backupsDir, name);
    try {
        const content = await fs.readFile(src, 'utf8');
        const validated = progressio.validateProgress(JSON.parse(content));
        if (!validated.ok)
            return { ok: false, error: validated.error };
        if (deps.dbManager) {
            const preRestoreName = `pre-restore-${Date.now()}.db`;
            await deps.dbManager.backup(path.join(deps.backupsDir, preRestoreName)).catch(() => { });
            deps.dbManager.srs.importProgressData(validated.progress, 'replace');
            return { ok: true, progress: validated.progress };
        }
        await fsutil.backupFile(deps.progressFile).catch(() => { });
        await fsutil.saveProgressFile(deps.progressFile, validated.progress, { replace: true });
        return { ok: true, progress: validated.progress };
    }
    catch (e) {
        return { ok: false, error: 'Không khôi phục được bản sao lưu: ' + errMsg(e) };
    }
}
//# sourceMappingURL=backup-service.js.map