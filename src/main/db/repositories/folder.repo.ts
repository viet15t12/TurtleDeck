// src/main/db/repositories/folder.repo.ts — Quản lý cấu trúc cây thư mục trong SQLite
import crypto from 'node:crypto';
import type Database from 'better-sqlite3';
import { Folder } from '../../../core/types/folder.types.js';

export interface FolderRow {
  id: string;
  name: string;
  parent_id: string | null;
  path: string;
  depth: number;
  created_at: number;
  updated_at: number;
}

function mapRow(row: FolderRow): Folder {
  return {
    id: row.id,
    name: row.name,
    parentId: row.parent_id,
    path: row.path,
    depth: row.depth,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class FolderRepository {
  private stmtInsert: Database.Statement;
  private stmtGetById: Database.Statement;
  private stmtGetByPath: Database.Statement;
  private stmtGetChildren: Database.Statement;
  private stmtGetRootChildren: Database.Statement;
  private stmtGetAll: Database.Statement;
  private stmtUpdateNamePath: Database.Statement;
  private stmtUpdateMove: Database.Statement;
  private stmtDelete: Database.Statement;
  private stmtDeleteLocationsForFolder: Database.Statement;

  constructor(private db: Database.Database) {
    this.stmtInsert = db.prepare(`
      INSERT INTO folders (id, name, parent_id, path, depth, created_at, updated_at)
      VALUES (@id, @name, @parentId, @path, @depth, @createdAt, @updatedAt)
    `);

    this.stmtGetById = db.prepare(`SELECT * FROM folders WHERE id = ?`);
    this.stmtGetByPath = db.prepare(`SELECT * FROM folders WHERE path = ?`);
    this.stmtGetChildren = db.prepare(`SELECT * FROM folders WHERE parent_id = ? ORDER BY name COLLATE NOCASE ASC`);
    this.stmtGetRootChildren = db.prepare(`SELECT * FROM folders WHERE parent_id IS NULL ORDER BY name COLLATE NOCASE ASC`);
    this.stmtGetAll = db.prepare(`SELECT * FROM folders ORDER BY depth ASC, name COLLATE NOCASE ASC`);
    this.stmtUpdateNamePath = db.prepare(`
      UPDATE folders SET name = @name, path = @path, updated_at = @updatedAt WHERE id = @id
    `);
    this.stmtUpdateMove = db.prepare(`
      UPDATE folders SET parent_id = @parentId, depth = @depth, path = @path, updated_at = @updatedAt WHERE id = @id
    `);
    this.stmtDelete = db.prepare(`DELETE FROM folders WHERE id = ?`);
    this.stmtDeleteLocationsForFolder = db.prepare(`DELETE FROM deck_locations WHERE folder_id = ?`);
  }

  getFolderById(id: string): Folder | null {
    const row = this.stmtGetById.get(id) as FolderRow | undefined;
    return row ? mapRow(row) : null;
  }

  getFolderByPath(path: string): Folder | null {
    const row = this.stmtGetByPath.get(path) as FolderRow | undefined;
    return row ? mapRow(row) : null;
  }

  getChildren(parentId: string | null): Folder[] {
    const rows = (parentId === null
      ? this.stmtGetRootChildren.all()
      : this.stmtGetChildren.all(parentId)) as FolderRow[];
    return rows.map(mapRow);
  }

  validateDepth(parentId: string | null): boolean {
    if (parentId === null) return true;
    const parent = this.getFolderById(parentId);
    if (!parent) return false;
    // Tối đa 10 cấp (depth từ 0 đến 9), thư mục con sẽ có depth = parent.depth + 1 <= 9
    return parent.depth < 9;
  }

  createFolder(name: string, parentId: string | null): Folder {
    const cleanName = name.trim();
    if (!cleanName) {
      throw new Error('Tên thư mục không được để trống.');
    }

    let depth = 0;
    let folderPath = cleanName;

    if (parentId !== null) {
      const parent = this.getFolderById(parentId);
      if (!parent) {
        throw new Error(`Thư mục cha có id "${parentId}" không tồn tại.`);
      }
      if (parent.depth >= 9) {
        throw new Error('Đã đạt giới hạn tối đa 10 cấp thư mục.');
      }
      depth = parent.depth + 1;
      folderPath = `${parent.path}/${cleanName}`;
    }

    const existing = this.getFolderByPath(folderPath);
    if (existing) {
      throw new Error(`Thư mục với đường dẫn "${folderPath}" đã tồn tại.`);
    }

    const now = Date.now();
    const id = crypto.randomUUID();

    this.stmtInsert.run({
      id,
      name: cleanName,
      parentId,
      path: folderPath,
      depth,
      createdAt: now,
      updatedAt: now,
    });

    return {
      id,
      name: cleanName,
      parentId,
      path: folderPath,
      depth,
      createdAt: now,
      updatedAt: now,
    };
  }

  renameFolder(id: string, newName: string): void {
    const cleanName = newName.trim();
    if (!cleanName) {
      throw new Error('Tên thư mục không được để trống.');
    }

    const folder = this.getFolderById(id);
    if (!folder) {
      throw new Error(`Thư mục có id "${id}" không tồn tại.`);
    }

    if (folder.name === cleanName) return;

    let newPath = cleanName;
    if (folder.parentId) {
      const parent = this.getFolderById(folder.parentId);
      if (parent) {
        newPath = `${parent.path}/${cleanName}`;
      }
    }

    const checkExisting = this.getFolderByPath(newPath);
    if (checkExisting && checkExisting.id !== id) {
      throw new Error(`Thư mục với đường dẫn "${newPath}" đã tồn tại.`);
    }

    const oldPath = folder.path;
    const now = Date.now();

    const tx = this.db.transaction(() => {
      // 1. Cập nhật thư mục chính
      this.stmtUpdateNamePath.run({
        id,
        name: cleanName,
        path: newPath,
        updatedAt: now,
      });

      // 2. Cập nhật đường dẫn cho tất cả các thư mục con cháu
      const oldPrefix = `${oldPath}/`;
      const newPrefix = `${newPath}/`;
      const descendants = this.db.prepare(
        `SELECT id, path FROM folders WHERE path LIKE ?`
      ).all(`${oldPrefix}%`) as Array<{ id: string; path: string }>;

      const updateDescendant = this.db.prepare(
        `UPDATE folders SET path = ?, updated_at = ? WHERE id = ?`
      );

      for (const d of descendants) {
        const updatedDescPath = newPrefix + d.path.slice(oldPrefix.length);
        updateDescendant.run(updatedDescPath, now, d.id);
      }
    });

    tx();
  }

  moveFolder(id: string, newParentId: string | null): void {
    const folder = this.getFolderById(id);
    if (!folder) {
      throw new Error(`Thư mục có id "${id}" không tồn tại.`);
    }

    if (folder.parentId === newParentId) return;

    // Không được di chuyển vào chính nó
    if (newParentId === id) {
      throw new Error('Không thể di chuyển thư mục vào chính nó.');
    }

    let newParent: Folder | null = null;
    let newDepth = 0;
    let newPath = folder.name;

    if (newParentId !== null) {
      newParent = this.getFolderById(newParentId);
      if (!newParent) {
        throw new Error(`Thư mục cha đích có id "${newParentId}" không tồn tại.`);
      }

      // Kiểm tra vòng lặp: newParentId không được là con cháu của folder
      const oldPrefix = `${folder.path}/`;
      if (newParent.path === folder.path || newParent.path.startsWith(oldPrefix)) {
        throw new Error('Không thể di chuyển thư mục vào bên trong thư mục con cháu của nó.');
      }

      newDepth = newParent.depth + 1;
      newPath = `${newParent.path}/${folder.name}`;
    }

    // Kiểm tra độ sâu tối đa (≤ 9) cho cả cây con cháu
    const oldPrefix = `${folder.path}/`;
    const descendants = this.db.prepare(
      `SELECT id, path, depth FROM folders WHERE path LIKE ?`
    ).all(`${oldPrefix}%`) as Array<{ id: string; path: string; depth: number }>;

    let maxSubtreeDepth = folder.depth;
    for (const d of descendants) {
      if (d.depth > maxSubtreeDepth) maxSubtreeDepth = d.depth;
    }

    const subtreeHeight = maxSubtreeDepth - folder.depth;
    if (newDepth + subtreeHeight > 9) {
      throw new Error('Không thể di chuyển vì sẽ vượt quá giới hạn tối đa 10 cấp thư mục.');
    }

    const checkExisting = this.getFolderByPath(newPath);
    if (checkExisting && checkExisting.id !== id) {
      throw new Error(`Thư mục với đường dẫn "${newPath}" đã tồn tại ở vị trí đích.`);
    }

    const depthDiff = newDepth - folder.depth;
    const oldPath = folder.path;
    const now = Date.now();

    const tx = this.db.transaction(() => {
      // 1. Cập nhật thư mục chuyển
      this.stmtUpdateMove.run({
        id,
        parentId: newParentId,
        depth: newDepth,
        path: newPath,
        updatedAt: now,
      });

      // 2. Cập nhật đường dẫn và depth cho toàn bộ thư mục con cháu
      const updateDescendant = this.db.prepare(
        `UPDATE folders SET path = ?, depth = depth + ?, updated_at = ? WHERE id = ?`
      );

      const newPrefix = `${newPath}/`;
      for (const d of descendants) {
        const updatedDescPath = newPrefix + d.path.slice(oldPrefix.length);
        updateDescendant.run(updatedDescPath, depthDiff, now, d.id);
      }
    });

    tx();
  }

  deleteFolder(id: string): void {
    const folder = this.getFolderById(id);
    if (!folder) return;

    const oldPrefix = `${folder.path}/`;
    const descendants = this.db.prepare(
      `SELECT id FROM folders WHERE path LIKE ?`
    ).all(`${oldPrefix}%`) as Array<{ id: string }>;

    const folderIdsToDelete = [id, ...descendants.map(d => d.id)];

    const tx = this.db.transaction(() => {
      // CASCADE xóa deck_locations cho thư mục và các thư mục con
      for (const fId of folderIdsToDelete) {
        this.stmtDeleteLocationsForFolder.run(fId);
      }
      // Xóa folder (FK ON DELETE CASCADE tự động dọn child folders)
      this.stmtDelete.run(id);
    });

    tx();
  }

  getFolderTree(): Folder[] {
    const all = (this.stmtGetAll.all() as FolderRow[]).map(mapRow);
    const map = new Map<string, Folder>();
    const roots: Folder[] = [];

    for (const f of all) {
      f.children = [];
      map.set(f.id, f);
    }

    for (const f of all) {
      if (f.parentId && map.has(f.parentId)) {
        map.get(f.parentId)!.children!.push(f);
      } else {
        roots.push(f);
      }
    }

    return roots;
  }

  getAllFolders(): Folder[] {
    const rows = this.stmtGetAll.all() as FolderRow[];
    return rows.map(mapRow);
  }
}

