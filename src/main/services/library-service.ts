// src/main/services/library-service.ts — Quét và quản lý thư viện bộ thẻ (không import 'electron')
import fs from 'node:fs/promises';
import path from 'node:path';
import * as sdeck from '../../core/sdeck.js';
import * as parser from '../../core/parser.js';
import * as fsutil from '../../core/fsutil.js';
import * as library from '../../core/library.js';

export function isPathInsideRoot(targetPath: string, rootDir: string): boolean {
  const normRoot = path.resolve(rootDir);
  const rootPrefix = normRoot.endsWith(path.sep) ? normRoot : normRoot + path.sep;
  const normTarget = path.resolve(targetPath);
  return normTarget.startsWith(rootPrefix) || normTarget === normRoot;
}

export async function getActiveLibraryDir(settingsFile: string, defaultDir: string): Promise<string> {
  try {
    const s = await fsutil.loadSettingsFile(settingsFile);
    if (s?.libraryDir && typeof s.libraryDir === 'string') {
      return path.resolve(s.libraryDir);
    }
  } catch {}
  return defaultDir;
}

export interface ScannedFile {
  fullPath: string;
  relPath: string;
  name: string;
  isLink?: boolean;
  linkTarget?: string | null;
}

export async function scanLibraryRecursively(
  dir: string,
  rootDir: string,
  depth = 0,
  results: Array<ScannedFile> = [],
  maxFiles = 2000
): Promise<Array<ScannedFile>> {
  if (depth > 9 || results.length >= maxFiles) return results;
  let dirents: any[];
  try {
    dirents = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return results;
  }

  let realRoot = rootDir;
  try {
    realRoot = await fs.realpath(rootDir);
  } catch {}
  const rootPrefix = realRoot.endsWith(path.sep) ? realRoot : realRoot + path.sep;

  for (const ent of dirents) {
    if (results.length >= maxFiles) break;
    const name = ent.name;
    if (name.startsWith('.')) continue;

    const fullPath = path.join(dir, name);
    let isLink = false;
    let linkTarget: string | null = null;

    try {
      const lst = await fs.lstat(fullPath);
      if (lst.isSymbolicLink()) {
        isLink = true;
        linkTarget = await fs.realpath(fullPath);
      }
    } catch {}

    try {
      const real = await fs.realpath(fullPath);
      if (!isLink && !real.startsWith(rootPrefix)) continue;
    } catch {
      continue;
    }

    if (ent.isDirectory()) {
      await scanLibraryRecursively(fullPath, rootDir, depth + 1, results, maxFiles);
    } else if ((ent.isFile() || ent.isSymbolicLink()) && name.toLowerCase().endsWith('.sdeck')) {
      if (name.endsWith('.bak') || name.endsWith('.tmp')) continue;
      const relPath = path.relative(rootDir, fullPath);
      results.push({ fullPath, relPath, name, isLink, linkTarget });
    }
  }
  return results;
}

export interface LibraryCacheEntry {
  mtime: number;
  size: number;
  deck: any;
  total: number;
}

export const libraryCache = new Map<string, LibraryCacheEntry>();

export async function scanLibrary(libDir: string): Promise<any[]> {
  await fs.mkdir(libDir, { recursive: true }).catch(() => {});
  const scannedFiles = await scanLibraryRecursively(libDir, libDir);
  const decks: any[] = [];

  for (const item of scannedFiles) {
    const group = (library as any).inferGroup(item.relPath);
    try {
      const st = await fs.stat(item.fullPath);
      if (st.size > (sdeck as any).LIMITS.total) continue;

      const cached = libraryCache.get(item.fullPath);
      if (cached && cached.mtime === st.mtimeMs && cached.size === st.size) {
        decks.push({
          path: item.fullPath,
          relPath: item.relPath,
          group,
          ok: true,
          deck: cached.deck,
          total: cached.total,
          isLink: item.isLink || false,
          linkTarget: item.linkTarget || null,
        });
        continue;
      }

      const bytes = await fs.readFile(item.fullPath);
      const metaRes = (sdeck as any).readPackageMeta(bytes);
      if (!metaRes.ok) {
        decks.push({
          path: item.fullPath,
          relPath: item.relPath,
          group,
          ok: false,
          error: metaRes.error,
          isLink: item.isLink || false,
          linkTarget: item.linkTarget || null,
        });
        continue;
      }
      const parsed = (parser as any).parseDeck(metaRes.deckText);
      if (!parsed.ok) {
        decks.push({
          path: item.fullPath,
          relPath: item.relPath,
          group,
          ok: false,
          error: parsed.error,
          isLink: item.isLink || false,
          linkTarget: item.linkTarget || null,
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
        isLink: item.isLink || false,
        linkTarget: item.linkTarget || null,
      });
    } catch (e: any) {
      decks.push({
        path: item.fullPath,
        relPath: item.relPath,
        group,
        ok: false,
        error: (e && e.message) || String(e),
        isLink: item.isLink || false,
        linkTarget: item.linkTarget || null,
      });
    }
  }
  return decks;
}

export interface ScanResult {
  decks: any[];
  total: number;
}

export class LibraryService {
  constructor(private deps: { libraryDir?: () => string } = {}) {}

  async scanLibraryRecursive(rootPath: string): Promise<ScanResult> {
    const decks = await scanLibrary(rootPath);
    return {
      decks,
      total: decks.length,
    };
  }
}
