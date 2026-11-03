// src/main/ipc/deck.ipc.ts — Handlers IPC cho mở, lưu, nhập, đóng, nhân đôi bộ thẻ
import path from 'node:path';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import electron from 'electron';
const { dialog, shell } = electron || {};
import * as sdeck from '../../core/sdeck.js';
import * as parser from '../../core/parser.js';
import * as deckkinds from '../../core/deckkinds.js';
import * as fsutil from '../../core/fsutil.js';
import { registerTypedHandler } from './register.js';
import * as deckService from '../services/deck-service.js';
import * as importService from '../services/import-service.js';
import { getActiveLibraryDir } from '../services/library-service.js';
const SDECK_FILTER = [{ name: 'Bộ thẻ (.sdeck)', extensions: ['sdeck'] }];
export function registerDeckIpc(dispatcher, ctx) {
    const getDeps = () => ({
        packageStore: ctx.packageStore,
        draftsDir: () => ctx.paths.draftsDir(),
        getActiveLibraryDir: () => getActiveLibraryDir(ctx.paths.settingsFile(), ctx.paths.defaultLibraryDir()),
        dbManager: ctx.dbManager,
        watchPath: ctx.watchPath,
        knownSaves: ctx.knownSaves,
    });
    registerTypedHandler(dispatcher, 'deck:open', async (event, filePath) => {
        let paths = typeof filePath === 'string'
            ? [filePath]
            : Array.isArray(filePath)
                ? filePath.filter(p => typeof p === 'string')
                : (typeof filePath === 'object' && filePath !== null && 'filePath' in filePath && typeof filePath.filePath === 'string')
                    ? [filePath.filePath]
                    : null;
        if (!paths || paths.length === 0) {
            const win = ctx.winOf ? ctx.winOf(event) : undefined;
            const r = await dialog.showOpenDialog(win, {
                title: 'Mở bộ thẻ',
                properties: ['openFile', 'multiSelections'],
                filters: SDECK_FILTER,
            });
            if (r.canceled)
                return [];
            paths = r.filePaths;
        }
        if (!paths)
            return [];
        const out = [];
        for (const p of paths) {
            out.push(await deckService.openOne(p, getDeps()));
        }
        return out;
    });
    registerTypedHandler(dispatcher, 'deck:save', async (event, args) => {
        const pkg = ctx.packageStore.get(args?.deckKey);
        if (!pkg)
            return { ok: false, error: 'Bộ thẻ không còn mở.' };
        let file = args?.saveAs ? null : pkg.file;
        if (!file) {
            const libDir = await getActiveLibraryDir(ctx.paths.settingsFile(), ctx.paths.defaultLibraryDir());
            const baseDir = pkg.file ? path.dirname(pkg.file) : (pkg.sourceDir ? path.dirname(pkg.sourceDir) : libDir);
            const parsed = parser.parseDeck(args?.deckText || '');
            const title = parsed.ok ? parsed.deck.meta.title : 'bo-the';
            const win = ctx.winOf ? ctx.winOf(event) : undefined;
            const r = await dialog.showSaveDialog(win, {
                title: 'Lưu thành .sdeck',
                defaultPath: path.join(baseDir, deckService.slugify(title) + '.sdeck'),
                filters: SDECK_FILTER,
            });
            if (r.canceled || !r.filePath)
                return { ok: false, canceled: true };
            file = r.filePath.toLowerCase().endsWith('.sdeck') ? r.filePath : r.filePath + '.sdeck';
        }
        return await deckService.saveDeck(args, getDeps(), file ?? undefined);
    });
    registerTypedHandler(dispatcher, 'deck:close', async (_event, req) => {
        const deckKey = typeof req === 'object' && req !== null ? req.deckKey : req;
        return ctx.packageStore.delete(deckKey);
    });
    registerTypedHandler(dispatcher, 'deck:new', async () => {
        const deckKey = ctx.packageStore.newKey();
        ctx.packageStore.set(deckKey, { file: null, assets: new Map() });
        return { ok: true, deckKey };
    });
    registerTypedHandler(dispatcher, 'deck:duplicate', async (_event, req) => {
        const oldDeckKey = typeof req === 'object' && req !== null ? req.oldDeckKey : req;
        const oldPkg = ctx.packageStore.get(oldDeckKey);
        const deckKey = ctx.packageStore.newKey();
        const newAssets = new Map();
        if (oldPkg?.assets) {
            for (const [k, v] of oldPkg.assets) {
                newAssets.set(k, new Uint8Array(v));
            }
        }
        ctx.packageStore.set(deckKey, { file: null, assets: newAssets });
        return { ok: true, deckKey, assetCount: newAssets.size };
    });
    registerTypedHandler(dispatcher, 'deck:exportCopy', async (event, req) => {
        const filePath = typeof req === 'object' && req !== null ? req.filePath : req;
        const valid = await deckService.validateSdeckPath(filePath);
        if (!valid)
            return { ok: false, error: 'Bộ thẻ chưa có file trên đĩa hoặc đường dẫn không hợp lệ.' };
        const defaultName = path.basename(valid);
        const win = ctx.winOf ? ctx.winOf(event) : undefined;
        const r = await dialog.showSaveDialog(win, {
            title: 'Xuất bản sao bộ thẻ (giữ nguyên mã bộ thẻ)',
            defaultPath: defaultName,
            filters: SDECK_FILTER,
        });
        if (r.canceled || !r.filePath)
            return { ok: false, canceled: true };
        const dest = r.filePath.toLowerCase().endsWith('.sdeck') ? r.filePath : r.filePath + '.sdeck';
        try {
            await fsutil.atomicWrite(dest, await fs.readFile(valid));
            return { ok: true, path: dest };
        }
        catch (e) {
            return { ok: false, error: 'Không thể xuất bản sao: ' + ((e && e.message) || String(e)) };
        }
    });
    registerTypedHandler(dispatcher, 'deck:showInFolder', async (_event, req) => {
        const filePath = typeof req === 'object' && req !== null ? req.filePath : req;
        const valid = await deckService.validateSdeckPath(filePath);
        if (!valid)
            return false;
        shell.showItemInFolder(valid);
        return true;
    });
    registerTypedHandler(dispatcher, 'deck:import', async (event, req) => {
        const kind = typeof req === 'object' && req !== null ? req.kind : req;
        const isDirPick = kind === 'dir';
        const isTextPick = kind === 'text';
        let dialogOptions;
        if (isDirPick) {
            dialogOptions = { title: 'Chọn thư mục chứa deck.json (và img/)', properties: ['openDirectory'] };
        }
        else if (isTextPick) {
            dialogOptions = {
                title: 'Chọn file dữ liệu (.csv, .tsv, .txt, .md)',
                properties: ['openFile'],
                filters: [
                    { name: 'File dữ liệu (.csv, .tsv, .txt, .md)', extensions: ['csv', 'tsv', 'txt', 'md'] },
                    { name: 'Tất cả tập tin', extensions: ['*'] },
                ],
            };
        }
        else {
            dialogOptions = {
                title: 'Chọn file nguồn bộ thẻ',
                properties: ['openFile'],
                filters: [
                    { name: 'Nguồn bộ thẻ (.json, .csv, .tsv, .txt, .md)', extensions: ['json', 'csv', 'tsv', 'txt', 'md'] },
                ],
            };
        }
        const win = ctx.winOf ? ctx.winOf(event) : undefined;
        const r = await dialog.showOpenDialog(win, dialogOptions);
        if (r.canceled || !r.filePaths.length)
            return null;
        const src = r.filePaths[0];
        const fail = (error) => ({ ok: false, source: src, error, issues: [{ level: 'error', msg: error }] });
        let isDir, targetFile;
        try {
            isDir = (await fs.stat(src)).isDirectory();
            targetFile = isDir ? path.join(src, 'deck.json') : src;
            const st = await fs.stat(targetFile);
            if (st.size > sdeck.LIMITS.deckJson)
                return fail('Tập tin quá lớn (hơn 20 MB).');
        }
        catch (e) {
            if (e.code === 'ENOENT')
                return fail(isDir ? 'Thư mục này không có deck.json.' : 'Không tìm thấy file.');
            return fail('Không đọc được nguồn: ' + ((e && e.message) || String(e)));
        }
        const dir = isDir ? src : path.dirname(src);
        const ext = path.extname(targetFile).toLowerCase();
        if (!isDir && ['.csv', '.tsv', '.txt', '.md'].includes(ext)) {
            try {
                const content = await fs.readFile(targetFile, 'utf8');
                const parsed = parser.parseImport(content, { format: 'auto', hasSourceDir: true });
                if (!parsed.ok || !parsed.items?.length) {
                    return fail('Không tìm thấy mục hợp lệ nào trong file để nhập.');
                }
                const inferredKind = deckkinds.inferKind(parsed.items);
                const title = path.basename(targetFile, ext);
                const deckId = `deck-${crypto.randomBytes(4).toString('hex')}`;
                const deck = {
                    meta: { id: deckId, title, kind: inferredKind, created: Date.now() },
                    items: parsed.items,
                };
                const { assets: tempAssets, issues: assetIssues } = await importService.collectImportAssets(dir, parsed.items);
                const deckKey = ctx.packageStore.newKey();
                const deckText = JSON.stringify(deck, null, 2);
                ctx.packageStore.set(deckKey, { file: null, assets: tempAssets, sourceDir: dir });
                return {
                    ok: true,
                    source: src,
                    deckKey,
                    deckText,
                    deck,
                    issues: [...(assetIssues || []).map((m) => (typeof m === 'string' ? { level: 'warn', msg: m } : m)), ...parsed.issues],
                    total: parsed.items.length,
                    skipped: 0,
                    assetCount: tempAssets.size,
                };
            }
            catch (e) {
                return fail('Lỗi khi đọc file: ' + ((e && e.message) || String(e)));
            }
        }
        try {
            const deckText = await fs.readFile(targetFile, 'utf8');
            const { assets, issues: assetIssues } = await sdeck.collectAssetsFromDir(dir, deckText);
            const parsed = parser.parseDeck(deckText, { assets });
            if (!parsed.ok) {
                return {
                    ...fail(parsed.error),
                    issues: [...(assetIssues || []).map((m) => (typeof m === 'string' ? { level: 'warn', msg: m } : m)), ...parsed.issues],
                };
            }
            const deckKey = ctx.packageStore.newKey();
            ctx.packageStore.set(deckKey, { file: null, assets, sourceDir: dir });
            return {
                ok: true,
                source: src,
                deckKey,
                deckText,
                deck: parsed.deck,
                issues: [...(assetIssues || []).map((m) => (typeof m === 'string' ? { level: 'warn', msg: m } : m)), ...parsed.issues],
                total: parsed.total,
                skipped: parsed.skipped,
                assetCount: assets.size,
            };
        }
        catch (e) {
            return fail('Không đọc được nguồn: ' + ((e && e.message) || String(e)));
        }
    });
}
//# sourceMappingURL=deck.ipc.js.map