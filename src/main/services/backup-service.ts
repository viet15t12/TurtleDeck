// src/main/services/backup-service.ts — Quản lý sao lưu, khôi phục và dọn dẹp bản sao lưu cũ (không import 'electron')
import fs from 'node:fs/promises';
import path from 'node:path';
import { zipSync, unzipSync, strToU8, strFromU8 } from 'fflate';
import * as fsutil from '../../core/fsutil.js';
import * as progressio from '../../core/progressio.js';
import { DatabaseManager } from '../db/index.js';

export interface BackupDeps {
  backupsDir: string;
  progressFile: string;
  dbManager?: DatabaseManager;
  now?: () => number;
  timeZone?: string;
}

export interface FullBackupDeps extends BackupDeps {
  libraryDir: string;
  settingsFile?: string;
  destPath?: string;
}

export interface FullBackupResult {
  ok: boolean;
  filePath?: string;
  name?: string;
  decksCount?: number;
  foldersCount?: number;
  error?: string;
  canceled?: boolean;
}

export interface FullRestoreResult {
  ok: boolean;
  decksCount?: number;
  foldersCount?: number;
  error?: string;
  canceled?: boolean;
}

const errMsg = (e: any) => (e && e.message) || String(e);

export async function pruneTemporaryDbBackups(dir: string, maxKeep = 5): Promise<void> {
  try {
    const files = await fs.readdir(dir);
    const preImport = files.filter(f => f.startsWith('pre-import-') && f.endsWith('.db')).sort();
    const preRestore = files.filter(f => f.startsWith('pre-restore-') && f.endsWith('.db')).sort();

    if (preImport.length > maxKeep) {
      const toDelete = preImport.slice(0, preImport.length - maxKeep);
      for (const f of toDelete) {
        await fs.rm(path.join(dir, f), { force: true }).catch(() => {});
      }
    }

    if (preRestore.length > maxKeep) {
      const toDelete = preRestore.slice(0, preRestore.length - maxKeep);
      for (const f of toDelete) {
        await fs.rm(path.join(dir, f), { force: true }).catch(() => {});
      }
    }
  } catch {}
}

export async function ensureDailyBackup(deps: BackupDeps): Promise<void> {
  const tz = deps.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone;
  const now = deps.now ? deps.now() : Date.now();
  const fileName = (progressio as any).backupFileName(now, tz);
  const dir = deps.backupsDir;
  await fs.mkdir(dir, { recursive: true }).catch(() => {});
  const dest = path.join(dir, fileName);

  try {
    await fs.stat(dest);
  } catch (e: any) {
    if (e.code === 'ENOENT') {
      try {
        if (deps.dbManager) {
          const dbBackupName = fileName.replace(/\.json$/, '.db');
          await deps.dbManager.backup(path.join(dir, dbBackupName));
          const progressData = deps.dbManager.srs.exportProgressData();
          await fsutil.atomicWrite(dest, JSON.stringify(progressData, null, 2));
        } else {
          const pStat = await fs.stat(deps.progressFile);
          if (pStat.isFile()) {
            const content = await fs.readFile(deps.progressFile);
            await fsutil.atomicWrite(dest, content);
          }
        }
      } catch (err) {
        console.warn('[Backup] Lỗi sao lưu hàng ngày:', err);
      }
    }
  }

  // Dọn dẹp bản sao lưu cũ, chỉ giữ 7 ngày mới nhất
  try {
    const files = await fs.readdir(dir);
    const toDel = (progressio as any).pickBackupsToDelete(files, 7);
    for (const name of toDel) {
      await fs.rm(path.join(dir, name), { force: true }).catch(() => {});
      const dbSibling = name.replace(/\.json$/, '.db');
      await fs.rm(path.join(dir, dbSibling), { force: true }).catch(() => {});
    }
  } catch {}

  // Dọn dẹp các bản sao lưu db tạm thời
  await pruneTemporaryDbBackups(dir, 5);
}

export async function createBackup(deps: BackupDeps): Promise<{ ok: boolean; name?: string; error?: string }> {
  const dir = deps.backupsDir;
  await fs.mkdir(dir, { recursive: true }).catch(() => {});
  const tz = deps.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone;
  const now = deps.now ? deps.now() : Date.now();
  const name = `progress-${(progressio as any).dayKey(now, tz)}-manual-${now}.json`;
  const dest = path.join(dir, name);
  try {
    if (deps.dbManager) {
      const dbBackupName = name.replace(/\.json$/, '.db');
      await deps.dbManager.backup(path.join(dir, dbBackupName));
      const progressData = deps.dbManager.srs.exportProgressData();
      await fsutil.atomicWrite(dest, JSON.stringify(progressData, null, 2));
      return { ok: true, name };
    }
    const content = await fs.readFile(deps.progressFile);
    await fsutil.atomicWrite(dest, content);
    return { ok: true, name };
  } catch (e: any) {
    return { ok: false, error: errMsg(e) };
  }
}

export async function listBackups(backupsDir: string): Promise<Array<{ name: string; size: number; mtime: number }>> {
  await fs.mkdir(backupsDir, { recursive: true }).catch(() => {});
  let files: string[];
  try {
    files = await fs.readdir(backupsDir);
  } catch {
    return [];
  }
  const result: Array<{ name: string; size: number; mtime: number }> = [];
  for (const f of files) {
    if (!f.endsWith('.json')) continue;
    try {
      const st = await fs.stat(path.join(backupsDir, f));
      result.push({ name: f, size: st.size, mtime: st.mtimeMs });
    } catch {}
  }
  result.sort((a, b) => b.mtime - a.mtime);
  return result;
}

export async function restoreBackup(
  deps: BackupDeps,
  name: string
): Promise<{ ok: boolean; progress?: any; error?: string }> {
  if (typeof name !== 'string' || !/^progress-[\w-]+\.json$/.test(name)) {
    return { ok: false, error: 'Tên file sao lưu không hợp lệ.' };
  }
  const src = path.join(deps.backupsDir, name);
  try {
    const content = await fs.readFile(src, 'utf8');
    const validated = (progressio as any).validateProgress(JSON.parse(content));
    if (!validated.ok) return { ok: false, error: validated.error };

    if (deps.dbManager) {
      const preRestoreName = `pre-restore-${Date.now()}.db`;
      await deps.dbManager.backup(path.join(deps.backupsDir, preRestoreName)).catch(() => {});
      deps.dbManager.srs.importProgressData(validated.progress, 'replace');
      return { ok: true, progress: validated.progress };
    }

    await fsutil.backupFile(deps.progressFile).catch(() => {});
    await fsutil.saveProgressFile(deps.progressFile, validated.progress, { replace: true });
    return { ok: true, progress: validated.progress };
  } catch (e: any) {
    return { ok: false, error: 'Không khôi phục được bản sao lưu: ' + errMsg(e) };
  }
}

async function collectAllSdeckFiles(dir: string, rootDir: string): Promise<Array<{ fullPath: string; relPath: string }>> {
  const result: Array<{ fullPath: string; relPath: string }> = [];
  async function walk(current: string) {
    let entries: any[];
    try {
      entries = await fs.readdir(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const ent of entries) {
      if (ent.name.startsWith('.')) continue;
      const full = path.join(current, ent.name);
      if (ent.isDirectory()) {
        await walk(full);
      } else if (ent.isFile() && ent.name.toLowerCase().endsWith('.sdeck')) {
        if (!ent.name.endsWith('.bak') && !ent.name.endsWith('.tmp')) {
          const rel = path.relative(rootDir, full).split(path.sep).join('/');
          result.push({ fullPath: full, relPath: rel });
        }
      }
    }
  }
  await walk(dir);
  return result;
}

export async function createFullBackup(deps: FullBackupDeps): Promise<FullBackupResult> {
  try {
    const now = deps.now ? deps.now() : Date.now();
    const dateKey = new Date(now).toISOString().slice(0, 10);
    const defaultName = `turtledeck-full-backup-${dateKey}-${now}.turtlebackup`;
    const dest = deps.destPath || path.join(deps.backupsDir, defaultName);

    await fs.mkdir(path.dirname(dest), { recursive: true }).catch(() => {});
    await fs.mkdir(deps.libraryDir, { recursive: true }).catch(() => {});

    const sdeckFiles = await collectAllSdeckFiles(deps.libraryDir, deps.libraryDir);
    const filesToZip: Record<string, Uint8Array> = {};

    // 1. Lưu các file bộ thẻ (.sdeck)
    for (const f of sdeckFiles) {
      try {
        const bytes = await fs.readFile(f.fullPath);
        filesToZip[`decks/${f.relPath}`] = new Uint8Array(bytes);
      } catch (err) {
        console.warn(`[FullBackup] Không đọc được file ${f.fullPath}:`, err);
      }
    }

    // 2. Dump toàn bộ cơ sở dữ liệu SQLite
    let dbDump: any = null;
    let foldersCount = 0;
    if (deps.dbManager) {
      const db = deps.dbManager.db;
      try {
        const folders = db.prepare('SELECT * FROM folders ORDER BY depth ASC, name COLLATE NOCASE ASC').all();
        const deck_locations = db.prepare('SELECT * FROM deck_locations').all();
        const decks = db.prepare('SELECT * FROM decks').all();
        const items = db.prepare('SELECT * FROM items').all();
        const srs_cards = db.prepare('SELECT * FROM srs_cards').all();
        const review_logs = db.prepare('SELECT * FROM review_logs').all();
        const item_meta = db.prepare('SELECT * FROM item_meta').all();
        const match_records = db.prepare('SELECT * FROM match_records').all();

        dbDump = {
          folders,
          deck_locations,
          decks,
          items,
          srs_cards,
          review_logs,
          item_meta,
          match_records,
        };
        foldersCount = folders.length;
        filesToZip['database_dump.json'] = strToU8(JSON.stringify(dbDump, null, 2));
      } catch (err) {
        console.warn('[FullBackup] Lỗi trích xuất database:', err);
      }
    }

    // 3. Tiến độ SRS & Cài đặt
    if (deps.progressFile) {
      try {
        const prog = await fs.readFile(deps.progressFile);
        filesToZip['progress.json'] = new Uint8Array(prog);
      } catch {}
    }
    if (deps.settingsFile) {
      try {
        const sett = await fs.readFile(deps.settingsFile);
        filesToZip['settings.json'] = new Uint8Array(sett);
      } catch {}
    }

    // 4. Manifest
    const manifest = {
      format: 'turtledeck-full-backup',
      version: 1,
      appVersion: '0.1.3',
      createdAt: now,
      decksCount: sdeckFiles.length,
      foldersCount,
    };
    filesToZip['manifest.json'] = strToU8(JSON.stringify(manifest, null, 2));

    const zipBuffer = zipSync(filesToZip);
    await fsutil.atomicWrite(dest, Buffer.from(zipBuffer));

    return {
      ok: true,
      filePath: dest,
      name: path.basename(dest),
      decksCount: sdeckFiles.length,
      foldersCount,
    };
  } catch (e: any) {
    return { ok: false, error: errMsg(e) };
  }
}

export async function restoreFullBackup(
  deps: BackupDeps & { libraryDir: string; srcPath: string; settingsFile?: string }
): Promise<FullRestoreResult> {
  try {
    const fileBytes = await fs.readFile(deps.srcPath);
    let files: Record<string, Uint8Array>;
    try {
      files = unzipSync(new Uint8Array(fileBytes));
    } catch (e: any) {
      return { ok: false, error: 'Tệp sao lưu không hợp lệ hoặc bị hỏng: ' + errMsg(e) };
    }

    // 1. Phục hồi các file bộ thẻ (.sdeck)
    await fs.mkdir(deps.libraryDir, { recursive: true }).catch(() => {});
    let restoredDecks = 0;
    for (const [entryName, bytes] of Object.entries(files)) {
      if (entryName.startsWith('decks/') && entryName.endsWith('.sdeck')) {
        const relPath = entryName.slice('decks/'.length);
        const targetPath = path.join(deps.libraryDir, ...relPath.split('/'));
        await fs.mkdir(path.dirname(targetPath), { recursive: true }).catch(() => {});
        await fs.writeFile(targetPath, Buffer.from(bytes));
        restoredDecks++;
      }
    }

    // 2. Phục hồi Database SQLite
    let foldersCount = 0;
    if (files['database_dump.json'] && deps.dbManager) {
      try {
        const dumpStr = strFromU8(files['database_dump.json']);
        const dbDump = JSON.parse(dumpStr);
        const db = deps.dbManager.db;

        const tx = db.transaction(() => {
          db.exec('DELETE FROM deck_locations');
          db.exec('DELETE FROM folders');
          db.exec('DELETE FROM items');
          db.exec('DELETE FROM decks');
          db.exec('DELETE FROM srs_cards');
          db.exec('DELETE FROM review_logs');
          db.exec('DELETE FROM item_meta');
          db.exec('DELETE FROM match_records');

          // Phục hồi Thư mục (sắp xếp theo độ sâu depth để chèn cha trước con)
          if (Array.isArray(dbDump.folders)) {
            const insFolder = db.prepare(`
              INSERT INTO folders (id, name, parent_id, path, depth, created_at, updated_at)
              VALUES (@id, @name, @parent_id, @path, @depth, @created_at, @updated_at)
            `);
            const sortedFolders = [...dbDump.folders].sort((a, b) => a.depth - b.depth);
            for (const f of sortedFolders) {
              insFolder.run(f);
            }
            foldersCount = sortedFolders.length;
          }

          // Phục hồi Bảng bộ thẻ decks
          if (Array.isArray(dbDump.decks)) {
            const insDeck = db.prepare(`
              INSERT OR REPLACE INTO decks (id, file_path, title, kind, lang, description, version, deck_hash, created_at, updated_at)
              VALUES (@id, @file_path, @title, @kind, @lang, @description, @version, @deck_hash, @created_at, @updated_at)
            `);
            for (const d of dbDump.decks) {
              let adjustedPath = d.file_path;
              if (d.file_path) {
                adjustedPath = path.join(deps.libraryDir, path.basename(d.file_path));
              }
              insDeck.run({ ...d, file_path: adjustedPath });
            }
          }

          // Phục hồi Vị trí deck_locations (cập nhật file_path tương thích với libraryDir hiện tại)
          if (Array.isArray(dbDump.deck_locations)) {
            const insLoc = db.prepare(`
              INSERT OR REPLACE INTO deck_locations (id, deck_id, folder_id, file_path, is_link, link_target, created_at)
              VALUES (@id, @deck_id, @folder_id, @file_path, @is_link, @link_target, @created_at)
            `);
            for (const l of dbDump.deck_locations) {
              const folder = dbDump.folders?.find((f: any) => f.id === l.folder_id);
              const fileName = path.basename(l.file_path);
              const targetDir = folder ? path.join(deps.libraryDir, ...folder.path.split('/')) : deps.libraryDir;
              const newFilePath = path.join(targetDir, fileName);
              insLoc.run({ ...l, file_path: newFilePath });
            }
          }

          // Phục hồi câu hỏi items
          if (Array.isArray(dbDump.items)) {
            const insItem = db.prepare(`
              INSERT OR REPLACE INTO items (id, deck_id, type, topic, tags_json, content_json, search_text, starred, created_at)
              VALUES (@id, @deck_id, @type, @topic, @tags_json, @content_json, @search_text, @starred, @created_at)
            `);
            for (const it of dbDump.items) insItem.run(it);
          }

          // Phục hồi thẻ srs_cards
          if (Array.isArray(dbDump.srs_cards)) {
            const insSrs = db.prepare(`
              INSERT OR REPLACE INTO srs_cards (deck_id, item_id, direction, state, step, ease, interval, due, reps, lapses, updated_at)
              VALUES (@deck_id, @item_id, @direction, @state, @step, @ease, @interval, @due, @reps, @lapses, @updated_at)
            `);
            for (const c of dbDump.srs_cards) insSrs.run(c);
          }

          // Phục hồi nhật ký review_logs
          if (Array.isArray(dbDump.review_logs)) {
            const insLog = db.prepare(`
              INSERT INTO review_logs (id, deck_id, item_id, direction, rating, review_time, elapsed_ms, is_new)
              VALUES (@id, @deck_id, @item_id, @direction, @rating, @review_time, @elapsed_ms, @is_new)
            `);
            for (const lg of dbDump.review_logs) insLog.run(lg);
          }

          // Phục hồi ghi chú & sao item_meta
          if (Array.isArray(dbDump.item_meta)) {
            const insMeta = db.prepare(`
              INSERT OR REPLACE INTO item_meta (deck_id, item_id, starred, note, updated_at)
              VALUES (@deck_id, @item_id, @starred, @note, @updated_at)
            `);
            for (const m of dbDump.item_meta) insMeta.run(m);
          }

          // Phục hồi match_records
          if (Array.isArray(dbDump.match_records)) {
            const insMatch = db.prepare(`
              INSERT OR REPLACE INTO match_records (deck_id, best_time_ms, achieved_at, pairs_count)
              VALUES (@deck_id, @best_time_ms, @achieved_at, @pairs_count)
            `);
            for (const mr of dbDump.match_records) insMatch.run(mr);
          }
        });

        tx();
      } catch (err) {
        console.warn('[FullRestore] Lỗi phục hồi database SQLite:', err);
      }
    }

    // 3. Phục hồi settings và progress file nếu có
    if (files['settings.json'] && deps.settingsFile) {
      try {
        await fs.writeFile(deps.settingsFile, Buffer.from(files['settings.json']));
      } catch {}
    }
    if (files['progress.json'] && deps.progressFile) {
      try {
        await fs.writeFile(deps.progressFile, Buffer.from(files['progress.json']));
      } catch {}
    }

    return {
      ok: true,
      decksCount: restoredDecks,
      foldersCount,
    };
  } catch (e: any) {
    return { ok: false, error: errMsg(e) };
  }
}
