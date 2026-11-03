// src/main/services/draft-service.ts — Quản lý bản nháp tự lưu của Editor (không import 'electron')
import fs from 'node:fs/promises';
import path from 'node:path';
import * as sdeck from '../../core/sdeck.js';
import * as parser from '../../core/parser.js';
import * as fsutil from '../../core/fsutil.js';
import * as library from '../../core/library.js';
import { openOne } from './deck-service.js';
export async function saveDraft(draftsDir, packageStore, req) {
    const { metaId, deckKey, deckText } = req || {};
    if (!metaId || typeof deckText !== 'string')
        return { ok: false };
    const pkg = packageStore.get(deckKey);
    const assets = pkg?.assets || new Map();
    const draftId = library.sanitizeDraftId(metaId);
    await fs.mkdir(draftsDir, { recursive: true }).catch(() => { });
    const built = sdeck.writePackage(deckText, assets, { prune: false });
    if (!built.ok)
        return { ok: false, error: built.error };
    const parsed = parser.parseDeck(deckText);
    const title = parsed?.deck?.meta?.title || 'Bộ thẻ chưa đặt tên';
    const sdeckPath = path.join(draftsDir, `${draftId}.sdeck`);
    const metaJsonPath = path.join(draftsDir, `${draftId}.json`);
    const metaData = {
        draftId,
        metaId,
        title,
        origFile: pkg?.file || null,
        draftedAt: Date.now(),
    };
    try {
        await fsutil.atomicWrite(sdeckPath, built.bytes);
        await fsutil.atomicWrite(metaJsonPath, JSON.stringify(metaData, null, 2));
        return { ok: true, draftId };
    }
    catch (e) {
        return { ok: false, error: (e && e.message) || String(e) };
    }
}
export async function deleteDraft(draftsDir, metaId) {
    if (!metaId)
        return { ok: true };
    const draftId = library.sanitizeDraftId(metaId);
    await fs.rm(path.join(draftsDir, `${draftId}.sdeck`), { force: true }).catch(() => { });
    await fs.rm(path.join(draftsDir, `${draftId}.json`), { force: true }).catch(() => { });
    return { ok: true };
}
export async function listDrafts(draftsDir) {
    await fs.mkdir(draftsDir, { recursive: true }).catch(() => { });
    let files;
    try {
        files = await fs.readdir(draftsDir);
    }
    catch {
        return [];
    }
    const list = [];
    for (const f of files) {
        if (!f.endsWith('.json'))
            continue;
        const jsonPath = path.join(draftsDir, f);
        const sdeckPath = path.join(draftsDir, f.replace(/\.json$/, '.sdeck'));
        try {
            const data = JSON.parse(await fs.readFile(jsonPath, 'utf8'));
            const st = await fs.stat(sdeckPath);
            if (st.isFile()) {
                let origChanged = false;
                if (data.origFile) {
                    try {
                        const origSt = await fs.stat(data.origFile);
                        if (origSt.mtimeMs > data.draftedAt)
                            origChanged = true;
                    }
                    catch { }
                }
                list.push({ ...data, sdeckPath, origChanged });
            }
        }
        catch { }
    }
    return list;
}
export async function loadDraft(draftsDir, draftId, deps) {
    const cleanId = library.sanitizeDraftId(draftId);
    const sdeckPath = path.join(draftsDir, `${cleanId}.sdeck`);
    const jsonPath = path.join(draftsDir, `${cleanId}.json`);
    let origFile = null;
    try {
        const meta = JSON.parse(await fs.readFile(jsonPath, 'utf8'));
        origFile = meta.origFile;
    }
    catch { }
    const res = await openOne(sdeckPath, deps);
    if (res.ok && origFile) {
        const pkg = deps.packageStore.get(res.deckKey);
        if (pkg)
            pkg.file = origFile;
        res.origFile = origFile;
    }
    return res;
}
//# sourceMappingURL=draft-service.js.map