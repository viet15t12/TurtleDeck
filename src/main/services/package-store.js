// src/main/services/package-store.ts — Quản lý bộ nhớ các gói thẻ đang mở và import tạm thời
import crypto from 'node:crypto';
export class PackageStore {
    packages = new Map();
    tempImports = new Map();
    newKey() {
        return crypto.randomBytes(6).toString('hex');
    }
    get(deckKey) {
        return this.packages.get(deckKey);
    }
    set(deckKey, pkg) {
        this.packages.set(deckKey, pkg);
    }
    delete(deckKey) {
        return this.packages.delete(deckKey);
    }
    has(deckKey) {
        return this.packages.has(deckKey);
    }
    keys() {
        return this.packages.keys();
    }
    setTempImport(token, filePath) {
        this.tempImports.set(token, { path: filePath, createdAt: Date.now() });
    }
    getTempImport(token) {
        const entry = this.tempImports.get(token);
        return entry ? entry.path : undefined;
    }
    deleteTempImport(token) {
        return this.tempImports.delete(token);
    }
    pruneTempImports(maxAgeMs = 30 * 60 * 1000, now = Date.now()) {
        for (const [token, entry] of this.tempImports.entries()) {
            if (now - entry.createdAt > maxAgeMs) {
                this.tempImports.delete(token);
            }
        }
    }
    clear() {
        this.packages.clear();
        this.tempImports.clear();
    }
}
export const defaultPackageStore = new PackageStore();
//# sourceMappingURL=package-store.js.map