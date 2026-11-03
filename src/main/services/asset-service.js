// src/main/services/asset-service.ts — Quản lý hình ảnh và tập tin đính kèm trong gói thẻ
import fs from 'node:fs/promises';
import path from 'node:path';
import * as sdeck from '../../core/sdeck.js';
export async function addAssetFiles(packageStore, deckKey, filePaths) {
    const pkg = packageStore.get(deckKey);
    if (!pkg)
        return [];
    const added = [];
    for (const p of filePaths) {
        try {
            const st = await fs.stat(p);
            if (st.size > sdeck.LIMITS.image)
                continue;
            const buf = await fs.readFile(p);
            if (!sdeck.detectImageType(buf))
                continue;
            const base = path.basename(p);
            const key = `img/${base}`;
            pkg.assets.set(key, new Uint8Array(buf));
            added.push({ path: key, name: base });
        }
        catch {
            // Bỏ qua file lỗi
        }
    }
    return added;
}
export function addAssetBytes(packageStore, deckKey, name, bytes) {
    const pkg = packageStore.get(deckKey);
    if (!pkg)
        return { ok: false, error: 'Bộ thẻ không còn mở.' };
    if (!name || !bytes)
        return { ok: false, error: 'Thiếu tên hoặc dữ liệu ảnh.' };
    const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    if (u8.length > sdeck.LIMITS.image)
        return { ok: false, error: 'Ảnh quá lớn (hơn 5 MB).' };
    if (!sdeck.detectImageType(u8))
        return { ok: false, error: 'Nội dung không phải là ảnh hợp lệ.' };
    const base = path.basename(name);
    const key = `img/${base}`;
    pkg.assets.set(key, u8);
    return { ok: true, path: key };
}
export function listAssets(packageStore, deckKey) {
    const pkg = packageStore.get(deckKey);
    return pkg ? Array.from(pkg.assets.keys()) : [];
}
export function removeAsset(packageStore, deckKey, assetPath) {
    const pkg = packageStore.get(deckKey);
    if (!pkg)
        return { ok: false, error: 'Bộ thẻ không còn mở.' };
    if (!assetPath)
        return { ok: false, error: 'Thiếu đường dẫn ảnh cần xoá.' };
    const norm = assetPath.startsWith('img/') ? assetPath : `img/${assetPath}`;
    if (pkg.assets.delete(norm)) {
        return { ok: true };
    }
    return { ok: false, error: 'Không tìm thấy ảnh trong gói.' };
}
//# sourceMappingURL=asset-service.js.map