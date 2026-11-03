// src/main/services/import-service.ts — Thu thập assets và xử lý nhập dữ liệu hàng loạt (không import 'electron')
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import * as sdeck from '../../core/sdeck.js';
import * as parser from '../../core/parser.js';
import * as deckmodel from '../../core/deckmodel.js';
export async function collectImportAssets(sourceDir, items) {
    const assets = new Map();
    const issues = [];
    if (!sourceDir || !items)
        return { assets, issues };
    let rootPrefix = sourceDir;
    try {
        const realRoot = await fs.realpath(sourceDir);
        rootPrefix = realRoot.endsWith(path.sep) ? realRoot : realRoot + path.sep;
    }
    catch { }
    for (const item of items) {
        const refs = deckmodel.imageRefs(item);
        for (const ref of refs) {
            if (/^[a-z][a-z0-9+.-]*:/i.test(ref) || ref.startsWith('//')) {
                issues.push({ level: 'warn', msg: `Bỏ qua ảnh ngoài gói: ${ref}` });
                continue;
            }
            if (!/\.(png|jpe?g|gif|webp|svg)$/i.test(ref)) {
                issues.push({ level: 'warn', msg: `Bỏ qua ảnh không hợp lệ: ${ref}` });
                continue;
            }
            try {
                const fullPath = path.resolve(sourceDir, ...ref.split('/'));
                const real = await fs.realpath(fullPath);
                if (!real.startsWith(rootPrefix)) {
                    issues.push({ level: 'warn', msg: `Bỏ qua ảnh nằm ngoài thư mục nguồn: ${ref}` });
                    continue;
                }
                const st = await fs.stat(real);
                if (!st.isFile() || st.size > sdeck.LIMITS.image) {
                    issues.push({ level: 'warn', msg: `Bỏ qua ${ref}: tập tin không hợp lệ hoặc lớn hơn 5 MB.` });
                    continue;
                }
                const buf = await fs.readFile(real);
                if (!sdeck.detectImageType(buf)) {
                    issues.push({ level: 'warn', msg: `Bỏ qua ${ref}: nội dung không phải ảnh thật.` });
                    continue;
                }
                const normRef = ref.startsWith('img/') ? ref : `img/${ref}`;
                assets.set(normRef, new Uint8Array(buf));
            }
            catch {
                issues.push({ level: 'warn', msg: `Không tìm thấy ảnh: ${ref}` });
            }
        }
    }
    return { assets, issues };
}
export async function previewImport(packageStore, args) {
    const { token, text: rawText, format, options = {} } = args || {};
    let content = rawText;
    let hasSourceDir = false;
    let sourceDir = null;
    let filePath;
    if (token && typeof token === 'string') {
        filePath = packageStore.getTempImport(token);
        if (!filePath) {
            return { ok: false, error: 'Token tệp nhập không hợp lệ hoặc đã hết hạn.' };
        }
    }
    else if (args?.path || args?.filePath) {
        return { ok: false, error: 'Đường dẫn chưa được cấp phép. Vui lòng chọn file qua hộp thoại.' };
    }
    if (typeof filePath === 'string' && filePath.trim()) {
        try {
            content = await fs.readFile(filePath, 'utf8');
            sourceDir = path.dirname(path.resolve(filePath));
            hasSourceDir = true;
        }
        catch (e) {
            return { ok: false, error: 'Không đọc được file: ' + ((e && e.message) || String(e)) };
        }
    }
    if (typeof content !== 'string') {
        return { ok: false, error: 'Chưa có nội dung văn bản để nhập.' };
    }
    const parsed = parser.parseImport(content, { ...options, format, hasSourceDir });
    let tempAssets = new Map();
    let assetIssues = [];
    if (hasSourceDir && sourceDir) {
        const collected = await collectImportAssets(sourceDir, parsed.items);
        tempAssets = collected.assets;
        assetIssues = collected.issues;
    }
    const importId = crypto.randomUUID();
    packageStore.tempImportsMap = packageStore.tempImportsMap || new Map();
    packageStore.tempImportsMap.set(importId, { assets: tempAssets, sourceDir, items: parsed.items, createdAt: Date.now() });
    return {
        ok: true,
        format: parsed.format,
        items: parsed.items,
        issues: [...assetIssues, ...parsed.issues],
        importId,
        assetCount: tempAssets.size,
    };
}
export function commitImport(packageStore, args) {
    const { deckKey, importId, selectedIds } = args || {};
    const map = packageStore.tempImportsMap;
    if (!importId || !map || !map.has(importId))
        return { ok: true, assetCount: 0 };
    const temp = map.get(importId);
    map.delete(importId);
    const pkg = deckKey ? packageStore.get(deckKey) : null;
    if (!pkg)
        return { ok: true, assetCount: 0 };
    if (temp?.assets && temp.assets.size > 0) {
        let allowedRefs = null;
        if (Array.isArray(selectedIds) && temp.items) {
            allowedRefs = new Set();
            const selSet = new Set(selectedIds);
            for (const item of temp.items) {
                if (selSet.has(item.id)) {
                    for (const ref of deckmodel.imageRefs(item)) {
                        const normRef = ref.startsWith('img/') ? ref : `img/${ref}`;
                        allowedRefs.add(normRef);
                        allowedRefs.add(ref);
                    }
                }
            }
        }
        for (const [k, v] of temp.assets) {
            if (!allowedRefs || allowedRefs.has(k) || allowedRefs.has(k.replace(/^img\//, ''))) {
                pkg.assets.set(k, v);
            }
        }
    }
    return { ok: true, assetCount: pkg.assets.size };
}
//# sourceMappingURL=import-service.js.map