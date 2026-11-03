// src/main/services/library-service.ts — Quét và quản lý thư viện bộ thẻ (không import 'electron')
import fs from 'node:fs/promises';
import path from 'node:path';
import * as sdeck from '../../core/sdeck.js';
import * as parser from '../../core/parser.js';
import * as fsutil from '../../core/fsutil.js';
import * as library from '../../core/library.js';
export function isPathInsideRoot(targetPath, rootDir) {
    const normRoot = path.resolve(rootDir);
    const rootPrefix = normRoot.endsWith(path.sep) ? normRoot : normRoot + path.sep;
    const normTarget = path.resolve(targetPath);
    return normTarget.startsWith(rootPrefix) || normTarget === normRoot;
}
export async function getActiveLibraryDir(settingsFile, defaultDir) {
    try {
        const s = await fsutil.loadSettingsFile(settingsFile);
        if (s?.libraryDir && typeof s.libraryDir === 'string') {
            return path.resolve(s.libraryDir);
        }
    }
    catch { }
    return defaultDir;
}
export async function scanLibraryRecursively(dir, rootDir, depth = 0, results = [], maxFiles = 2000) {
    if (depth > 4 || results.length >= maxFiles)
        return results;
    let dirents;
    try {
        dirents = await fs.readdir(dir, { withFileTypes: true });
    }
    catch {
        return results;
    }
    let realRoot = rootDir;
    try {
        realRoot = await fs.realpath(rootDir);
    }
    catch { }
    const rootPrefix = realRoot.endsWith(path.sep) ? realRoot : realRoot + path.sep;
    for (const ent of dirents) {
        if (results.length >= maxFiles)
            break;
        const name = ent.name;
        if (name.startsWith('.'))
            continue;
        const fullPath = path.join(dir, name);
        try {
            const real = await fs.realpath(fullPath);
            if (!real.startsWith(rootPrefix))
                continue;
        }
        catch {
            continue;
        }
        if (ent.isDirectory()) {
            await scanLibraryRecursively(fullPath, rootDir, depth + 1, results, maxFiles);
        }
        else if (ent.isFile() && name.toLowerCase().endsWith('.sdeck')) {
            if (name.endsWith('.bak') || name.endsWith('.tmp'))
                continue;
            const relPath = path.relative(rootDir, fullPath);
            results.push({ fullPath, relPath, name });
        }
    }
    return results;
}
export const libraryCache = new Map();
export async function scanLibrary(libDir) {
    await fs.mkdir(libDir, { recursive: true }).catch(() => { });
    const scannedFiles = await scanLibraryRecursively(libDir, libDir);
    const decks = [];
    for (const item of scannedFiles) {
        const group = library.inferGroup(item.relPath);
        try {
            const st = await fs.stat(item.fullPath);
            if (st.size > sdeck.LIMITS.total)
                continue;
            const cached = libraryCache.get(item.fullPath);
            if (cached && cached.mtime === st.mtimeMs && cached.size === st.size) {
                decks.push({
                    path: item.fullPath,
                    relPath: item.relPath,
                    group,
                    ok: true,
                    deck: cached.deck,
                    total: cached.total,
                });
                continue;
            }
            const bytes = await fs.readFile(item.fullPath);
            const metaRes = sdeck.readPackageMeta(bytes);
            if (!metaRes.ok) {
                decks.push({
                    path: item.fullPath,
                    relPath: item.relPath,
                    group,
                    ok: false,
                    error: metaRes.error,
                });
                continue;
            }
            const parsed = parser.parseDeck(metaRes.deckText);
            if (!parsed.ok) {
                decks.push({
                    path: item.fullPath,
                    relPath: item.relPath,
                    group,
                    ok: false,
                    error: parsed.error,
                });
                continue;
            }
            libraryCache.set(item.fullPath, {
                mtime: st.mtimeMs,
                size: st.size,
                deck: parsed.deck,
                total: parsed.total,
            });
            decks.push({
                path: item.fullPath,
                relPath: item.relPath,
                group,
                ok: true,
                deck: parsed.deck,
                total: parsed.total,
            });
        }
        catch (e) {
            decks.push({
                path: item.fullPath,
                relPath: item.relPath,
                group,
                ok: false,
                error: (e && e.message) || String(e),
            });
        }
    }
    return decks;
}
//# sourceMappingURL=library-service.js.map