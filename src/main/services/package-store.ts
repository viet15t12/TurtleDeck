// src/main/services/package-store.ts — Quản lý bộ nhớ các gói thẻ đang mở và import tạm thời
import crypto from 'node:crypto';

export interface OpenPackage {
  file: string | null;
  assets: Map<string, Uint8Array>;
  sourceDir?: string;
}

export interface TempImport {
  path: string;
  createdAt: number;
}

export class PackageStore {
  private readonly packages = new Map<string, OpenPackage>();
  private readonly tempImports = new Map<string, TempImport>();

  newKey(): string {
    return crypto.randomBytes(6).toString('hex');
  }

  get(deckKey: string): OpenPackage | undefined {
    return this.packages.get(deckKey);
  }

  set(deckKey: string, pkg: OpenPackage): void {
    this.packages.set(deckKey, pkg);
  }

  delete(deckKey: string): boolean {
    return this.packages.delete(deckKey);
  }

  has(deckKey: string): boolean {
    return this.packages.has(deckKey);
  }

  keys(): IterableIterator<string> {
    return this.packages.keys();
  }

  setTempImport(token: string, filePath: string): void {
    this.tempImports.set(token, { path: filePath, createdAt: Date.now() });
  }

  getTempImport(token: string): string | undefined {
    const entry = this.tempImports.get(token);
    return entry ? entry.path : undefined;
  }

  deleteTempImport(token: string): boolean {
    return this.tempImports.delete(token);
  }

  pruneTempImports(maxAgeMs = 30 * 60 * 1000, now = Date.now()): void {
    for (const [token, entry] of this.tempImports.entries()) {
      if (now - entry.createdAt > maxAgeMs) {
        this.tempImports.delete(token);
      }
    }
  }

  clear(): void {
    this.packages.clear();
    this.tempImports.clear();
  }
}

export const defaultPackageStore = new PackageStore();
