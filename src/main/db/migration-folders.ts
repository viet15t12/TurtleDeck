// src/main/db/migration-folders.ts — Di chuyển cấu trúc từ dạng phẳng (flat) sang dạng cây phân cấp (tree)
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import type Database from 'better-sqlite3';
import * as sdeck from '../../core/sdeck.js';

export interface MigrationFolderResult {
  ok: boolean;
  foldersCreated: number;
  locationsCreated: number;
  error?: string;
}

export function migrateToFolders(db: Database.Database, libraryDir: string): MigrationFolderResult {
  if (!libraryDir || !fs.existsSync(libraryDir)) {
    return { ok: true, foldersCreated: 0, locationsCreated: 0 };
  }

  let foldersCreated = 0;
  let locationsCreated = 0;

  try {
    const tx = db.transaction(() => {
      const now = Date.now();
      const folderMap = new Map<string, string>(); // relPath -> folderId

      // 1. Quét đệ quy các thư mục trong libraryDir (tối đa 10 cấp, depth 0..9)
      const scanDirsRecursively = (currentDir: string, parentId: string | null, depth: number) => {
        if (depth > 9) return;
        let entries: fs.Dirent[];
        try {
          entries = fs.readdirSync(currentDir, { withFileTypes: true });
        } catch {
          return;
        }

        for (const ent of entries) {
          if (ent.name.startsWith('.')) continue;
          const fullPath = path.join(currentDir, ent.name);

          if (ent.isDirectory()) {
            const relPath = path.relative(libraryDir, fullPath).split(path.sep).join('/');

            // Kiểm tra xem folder đã có trong DB chưa
            let existing = db.prepare('SELECT id FROM folders WHERE path = ?').get(relPath) as { id: string } | undefined;
            let folderId: string;

            if (existing) {
              folderId = existing.id;
            } else {
              folderId = crypto.randomUUID();
              db.prepare(`
                INSERT INTO folders (id, name, parent_id, path, depth, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
              `).run(folderId, ent.name, parentId, relPath, depth, now, now);
              foldersCreated++;
            }

            folderMap.set(relPath, folderId);
            scanDirsRecursively(fullPath, folderId, depth + 1);
          }
        }
      };

      scanDirsRecursively(libraryDir, null, 0);

      // 2. Quét các file .sdeck và gắn vị trí deck_locations
      const scanFilesRecursively = (currentDir: string, folderId: string | null, depth: number) => {
        if (depth > 9) return;
        let entries: fs.Dirent[];
        try {
          entries = fs.readdirSync(currentDir, { withFileTypes: true });
        } catch {
          return;
        }

        for (const ent of entries) {
          if (ent.name.startsWith('.')) continue;
          const fullPath = path.join(currentDir, ent.name);

          if (ent.isDirectory()) {
            const relPath = path.relative(libraryDir, fullPath).split(path.sep).join('/');
            const subFolderId = folderMap.get(relPath) || null;
            scanFilesRecursively(fullPath, subFolderId, depth + 1);
          } else if (ent.isFile() || ent.isSymbolicLink()) {
            if (!ent.name.toLowerCase().endsWith('.sdeck')) continue;
            if (ent.name.endsWith('.bak') || ent.name.endsWith('.tmp')) continue;

            let isLink = 0;
            let linkTarget: string | null = null;
            try {
              const lst = fs.lstatSync(fullPath);
              if (lst.isSymbolicLink()) {
                isLink = 1;
                linkTarget = fs.realpathSync(fullPath);
              }
            } catch {}

            let deckId: string | null = null;
            try {
              const bytes = fs.readFileSync(fullPath);
              const metaRes = (sdeck as any).readPackageMeta(bytes);
              if (metaRes?.ok && metaRes.deckText) {
                const parsed = JSON.parse(metaRes.deckText);
                deckId = parsed?.meta?.id || parsed?.id || null;
              }
            } catch {}

            // Nếu không đọc được meta, tra trong bảng decks theo file_path
            if (!deckId) {
              const row = db.prepare('SELECT id FROM decks WHERE file_path = ?').get(fullPath) as { id: string } | undefined;
              if (row) deckId = row.id;
            }

            if (deckId) {
              // Kiểm tra xem vị trí này đã tồn tại chưa
              const locExists = db.prepare(`
                SELECT id FROM deck_locations
                WHERE deck_id = ? AND (folder_id = ? OR (folder_id IS NULL AND ? IS NULL))
              `).get(deckId, folderId, folderId);

              if (!locExists) {
                const locId = crypto.randomUUID();
                db.prepare(`
                  INSERT INTO deck_locations (id, deck_id, folder_id, file_path, is_link, link_target, created_at)
                  VALUES (?, ?, ?, ?, ?, ?, ?)
                `).run(locId, deckId, folderId, fullPath, isLink, linkTarget, now);
                locationsCreated++;
              }
            }
          }
        }
      };

      scanFilesRecursively(libraryDir, null, 0);

      // 3. Đồng bộ bổ sung các deck trong bảng decks mà chưa có trong deck_locations
      const allDecks = db.prepare('SELECT id, file_path FROM decks WHERE file_path IS NOT NULL').all() as Array<{ id: string; file_path: string }>;
      for (const d of allDecks) {
        const hasLoc = db.prepare('SELECT id FROM deck_locations WHERE deck_id = ?').get(d.id);
        if (!hasLoc && d.file_path && fs.existsSync(d.file_path)) {
          const rel = path.relative(libraryDir, path.dirname(d.file_path)).split(path.sep).join('/');
          const fId = (rel && rel !== '.') ? folderMap.get(rel) || null : null;
          const locId = crypto.randomUUID();
          db.prepare(`
            INSERT INTO deck_locations (id, deck_id, folder_id, file_path, is_link, link_target, created_at)
            VALUES (?, ?, ?, ?, 0, NULL, ?)
          `).run(locId, d.id, fId, d.file_path, now);
          locationsCreated++;
        }
      }
    });

    tx();
    return { ok: true, foldersCreated, locationsCreated };
  } catch (err: any) {
    return { ok: false, foldersCreated, locationsCreated, error: err?.message || String(err) };
  }
}
