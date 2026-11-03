// src/main/services/progress-service.ts — Logic xuất/nhập và lưu tiến độ học tập (không import 'electron')
import fs from 'node:fs/promises';
import path from 'node:path';
import * as fsutil from '../../core/fsutil.js';
import * as progressio from '../../core/progressio.js';
export async function loadProgress(deps) {
    if (deps.dbManager) {
        return deps.dbManager.srs.exportProgressData();
    }
    return await fsutil.loadProgressFile(deps.progressFile);
}
export async function saveProgress(deps, data) {
    if (deps.dbManager) {
        deps.dbManager.srs.importProgressData(data);
        return { ok: true };
    }
    return await fsutil.saveProgressFile(deps.progressFile, data);
}
export async function exportProgressToFile(deps, destPath) {
    let progressData;
    if (deps.dbManager) {
        progressData = deps.dbManager.srs.exportProgressData();
    }
    else {
        progressData = await fsutil.loadProgressFile(deps.progressFile);
    }
    const writeRes = await fsutil.atomicWrite(destPath, JSON.stringify(progressData, null, 2));
    if (!writeRes.ok)
        return { ok: false, error: writeRes.error };
    return { ok: true, path: destPath };
}
export async function readAndValidateImportFile(filePath) {
    try {
        const content = await fs.readFile(filePath, 'utf8');
        const data = JSON.parse(content);
        const val = progressio.validateProgressData
            ? progressio.validateProgressData(data)
            : progressio.validateProgress(data);
        if (!val.ok)
            return { ok: false, error: 'File không đúng định dạng sao lưu tiến độ: ' + val.error };
        return { ok: true, file: filePath, data, stats: val.stats };
    }
    catch (e) {
        return { ok: false, error: 'Không đọc được file: ' + ((e && e.message) || String(e)) };
    }
}
export async function applyImport(deps, importedProgress, mode = 'merge') {
    const valid = progressio.validateProgress(importedProgress);
    if (!valid.ok)
        return { ok: false, error: valid.error };
    try {
        if (deps.dbManager) {
            const preImportName = `pre-import-${Date.now()}.db`;
            await deps.dbManager.backup(path.join(deps.backupsDir, preImportName)).catch(() => { });
            const counts = deps.dbManager.srs.importProgressData(valid.progress, mode);
            return { ok: true, stats: { addedCards: counts.cardsCount, addedLogs: counts.logsCount } };
        }
        await fsutil.backupFile(deps.progressFile).catch(() => { });
        const current = await fsutil.loadProgressFile(deps.progressFile);
        const finalProg = mode === 'replace'
            ? valid.progress
            : progressio.mergeProgress(current, valid.progress);
        const res = await fsutil.saveProgressFile(deps.progressFile, finalProg, { replace: true });
        return res;
    }
    catch (e) {
        return { ok: false, error: (e && e.message) || String(e) };
    }
}
//# sourceMappingURL=progress-service.js.map