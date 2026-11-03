// src/main/services/deck-service.ts — Quản lý mở, đọc, lưu và nén các file .sdeck (không import 'electron')
import fs from 'node:fs/promises';
import path from 'node:path';
import * as sdeck from '../../core/sdeck.js';
import * as parser from '../../core/parser.js';
import * as fsutil from '../../core/fsutil.js';
import * as library from '../../core/library.js';
export function slugify(s) {
    return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/gi, 'd')
        .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'bo-the-moi';
}
export async function validateSdeckPath(p) {
    if (typeof p !== 'string' || !p.trim())
        return null;
    const resolved = path.resolve(p);
    if (!resolved.toLowerCase().endsWith('.sdeck'))
        return null;
    try {
        const real = await fs.realpath(resolved);
        const st = await fs.stat(real);
        if (st.isFile())
            return real;
    }
    catch { }
    return null;
}
const errMsg = (e) => (e && e.message) || String(e);
const pkgIssues = (list) => (list || []).map(msg => (typeof msg === 'string' ? { level: 'warn', msg } : msg));
export async function openOne(p, deps) {
    if (typeof p !== 'string' || !p.trim())
        return { path: String(p), ok: false, error: 'Đường dẫn không hợp lệ.' };
    const file = path.resolve(p);
    const fail = (error, extra = {}) => ({
        path: file,
        ok: false,
        error,
        issues: [{ level: 'error', msg: error }],
        ...extra,
    });
    if (path.extname(file).toLowerCase() !== '.sdeck')
        return fail('Chỉ mở được file bộ thẻ có đuôi .sdeck.');
    let bytes;
    try {
        const st = await fs.stat(file);
        if (!st.isFile())
            return fail('Đường dẫn không phải là file.');
        if (st.size > sdeck.LIMITS.total)
            return fail('File quá lớn (hơn 500 MB).');
        bytes = await fs.readFile(file);
    }
    catch (e) {
        if (e.code === 'ENOENT')
            return fail('File không còn tồn tại (đã bị xoá hoặc di chuyển).', { missing: true });
        if (e.code === 'EACCES' || e.code === 'EPERM')
            return fail('Không có quyền đọc file.');
        return fail('Không đọc được file: ' + errMsg(e));
    }
    const pkg = sdeck.readPackage(bytes);
    if (!pkg.ok)
        return fail(pkg.error);
    const parsed = parser.parseDeck(pkg.deckText, { assets: pkg.assets });
    if (!parsed.ok)
        return fail(parsed.error, { issues: [...pkgIssues(pkg.issues), ...parsed.issues] });
    const deckKey = deps.packageStore.newKey();
    deps.packageStore.set(deckKey, { file, assets: pkg.assets });
    if (deps.dbManager && parsed.deck) {
        try {
            deps.dbManager.deck.syncDeck(parsed.deck, file);
        }
        catch (err) {
            console.warn('[SQLite] Không thể đồng bộ cache deck:', err);
        }
    }
    if (deps.watchPath) {
        deps.watchPath(path.dirname(file));
    }
    return {
        path: file,
        ok: true,
        deckKey,
        deckText: pkg.deckText,
        deck: parsed.deck,
        issues: [...pkgIssues(pkg.issues), ...parsed.issues],
        total: parsed.total,
        skipped: parsed.skipped,
        assetCount: pkg.assets.size,
    };
}
export async function saveDeck(args, deps, targetFile) {
    const { deckKey, deckText, saveAs = false, pruneUnused = true } = args || {};
    const pkg = deps.packageStore.get(deckKey);
    if (!pkg)
        return { ok: false, error: 'Bộ thẻ không còn mở.' };
    if (typeof deckText !== 'string')
        return { ok: false, error: 'Nội dung bộ thẻ không hợp lệ.' };
    const parsed = parser.parseDeck(deckText);
    if (!parsed.ok)
        return { ok: false, error: parsed.error };
    const file = targetFile || (saveAs ? null : pkg.file);
    if (!file)
        return { ok: false, error: 'Chưa có đường dẫn đích để lưu.' };
    const built = sdeck.writePackage(deckText, pkg.assets, { prune: pruneUnused });
    if (!built.ok)
        return { ok: false, error: built.error };
    const check = sdeck.readPackage(built.bytes);
    if (!check.ok || !parser.parseDeck(check.deckText).ok) {
        return { ok: false, error: 'Gói vừa nén không đọc lại được, chưa ghi file.' };
    }
    try {
        await fsutil.backupFile(file);
        await fsutil.atomicWrite(file, built.bytes);
        if (deps.knownSaves) {
            deps.knownSaves.set(file, Date.now());
        }
    }
    catch (e) {
        return { ok: false, error: 'Không ghi được file: ' + errMsg(e) };
    }
    pkg.file = file;
    pkg.assets = built.keptAssets;
    if (deps.watchPath) {
        deps.watchPath(path.dirname(file));
    }
    if (deps.dbManager && parsed.deck) {
        try {
            deps.dbManager.deck.syncDeck(parsed.deck, file);
        }
        catch (err) {
            console.warn('[SQLite] Không thể đồng bộ cache deck:', err);
        }
    }
    if (parsed.deck?.meta?.id) {
        const draftId = library.sanitizeDraftId(parsed.deck.meta.id);
        const dDir = deps.draftsDir();
        await fs.rm(path.join(dDir, `${draftId}.sdeck`), { force: true }).catch(() => { });
        await fs.rm(path.join(dDir, `${draftId}.json`), { force: true }).catch(() => { });
    }
    const reparsed = parser.parseDeck(check.deckText);
    return {
        ok: true,
        path: file,
        deckText: check.deckText,
        deck: reparsed.deck,
        issues: [...pkgIssues(check.issues), ...reparsed.issues],
        total: reparsed.total,
        skipped: reparsed.skipped,
        assetCount: built.keptAssets.size,
    };
}
//# sourceMappingURL=deck-service.js.map