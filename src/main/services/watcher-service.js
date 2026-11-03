// src/main/services/watcher-service.ts — Theo dõi thay đổi của các file .sdeck (không import 'electron')
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import * as sdeck from '../../core/sdeck.js';
import * as parser from '../../core/parser.js';
import * as library from '../../core/library.js';
export class WatcherService {
    deps;
    watchedDirs = new Set();
    watchers = new Map();
    watchDebouncers = new Map();
    constructor(deps) {
        this.deps = deps;
    }
    isWatching(dirPath) {
        return this.watchedDirs.has(path.resolve(dirPath));
    }
    async watchRecursively(dirPath, maxDepth = 4) {
        const queue = [{ dir: path.resolve(dirPath), depth: 0 }];
        while (queue.length > 0) {
            const current = queue.shift();
            this.watchPath(current.dir);
            if (current.depth >= maxDepth)
                continue;
            try {
                const entries = await fs.readdir(current.dir, { withFileTypes: true });
                for (const ent of entries) {
                    if (ent.isDirectory() && !ent.name.startsWith('.')) {
                        queue.push({ dir: path.join(current.dir, ent.name), depth: current.depth + 1 });
                    }
                }
            }
            catch { }
        }
    }
    watchPath(dirPath) {
        if (!dirPath || typeof dirPath !== 'string')
            return;
        const resolved = path.resolve(dirPath);
        if (this.watchedDirs.has(resolved))
            return;
        this.watchedDirs.add(resolved);
        try {
            const watcher = fsSync.watch(resolved, { recursive: false }, (eventType, filename) => {
                if (!filename || !filename.toLowerCase().endsWith('.sdeck'))
                    return;
                if (filename.endsWith('.tmp') || filename.endsWith('.bak'))
                    return;
                const fullFile = path.join(resolved, filename);
                const timerKey = fullFile;
                if (this.watchDebouncers.has(timerKey)) {
                    clearTimeout(this.watchDebouncers.get(timerKey));
                }
                this.watchDebouncers.set(timerKey, setTimeout(async () => {
                    this.watchDebouncers.delete(timerKey);
                    await this.onWatchedFileChanged(fullFile);
                }, 500));
            });
            watcher.on('error', () => {
                this.watchedDirs.delete(resolved);
                this.watchers.delete(resolved);
            });
            this.watchers.set(resolved, watcher);
        }
        catch { }
    }
    async onWatchedFileChanged(filePath) {
        let st;
        try {
            st = await fs.stat(filePath);
            if (!st.isFile())
                return;
        }
        catch (e) {
            if (e.code === 'ENOENT') {
                this.deps.notify('deck:fileRemoved', { path: filePath });
                return;
            }
            return;
        }
        if (library.isSelfSaveEvent(filePath, st.mtimeMs, this.deps.knownSaves)) {
            return;
        }
        await new Promise(r => setTimeout(r, 200));
        let bytes;
        try {
            bytes = await fs.readFile(filePath);
        }
        catch {
            return;
        }
        const pkg = sdeck.readPackage(bytes);
        if (!pkg.ok) {
            this.deps.notify('deck:watchError', { path: filePath, error: pkg.error });
            return;
        }
        const parsed = parser.parseDeck(pkg.deckText, { assets: pkg.assets });
        if (!parsed.ok) {
            this.deps.notify('deck:watchError', { path: filePath, error: parsed.error });
            return;
        }
        let openedKey;
        let openedPkg;
        for (const key of this.deps.packageStore.keys()) {
            const p = this.deps.packageStore.get(key);
            if (p?.file && path.resolve(p.file) === path.resolve(filePath)) {
                openedKey = key;
                openedPkg = p;
                break;
            }
        }
        if (openedKey && openedPkg) {
            openedPkg.assets = pkg.assets;
            this.deps.notify('deck:changed', {
                path: filePath,
                deckKey: openedKey,
                deckText: pkg.deckText,
                deck: parsed.deck,
                total: parsed.total,
                assetCount: pkg.assets.size,
            });
        }
        else {
            this.deps.notify('deck:fileAdded', {
                path: filePath,
                deck: parsed.deck,
                total: parsed.total,
            });
        }
    }
    closeAll() {
        for (const timer of this.watchDebouncers.values()) {
            clearTimeout(timer);
        }
        this.watchDebouncers.clear();
        for (const watcher of this.watchers.values()) {
            try {
                watcher.close();
            }
            catch { }
        }
        this.watchers.clear();
        this.watchedDirs.clear();
    }
}
//# sourceMappingURL=watcher-service.js.map