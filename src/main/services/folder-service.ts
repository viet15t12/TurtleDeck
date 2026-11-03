// src/main/services/folder-service.ts — Business logic quản lý thư mục phân cấp (không import 'electron')
import path from 'node:path';
import fs from 'node:fs/promises';
import { Folder } from '../../core/types/folder.types.js';
import { FolderRepository } from '../db/repositories/folder.repo.js';

export interface FolderServiceDeps {
  fs?: typeof fs;
  notify?: (channel: string, payload: any) => void;
  libraryDir?: () => string;
}

export class FolderService {
  private fsLib: typeof fs;

  constructor(
    private folderRepo: FolderRepository,
    private deps: FolderServiceDeps = {}
  ) {
    this.fsLib = deps.fs || fs;
  }

  private validateFolderName(name: string): boolean {
    if (!name || typeof name !== 'string') return false;
    const trimmed = name.trim();
    if (!trimmed) return false;
    // Ký tự không hợp lệ cho tên thư mục trên các OS (Windows/Linux/macOS)
    if (/[/\\:*?"<>|]/.test(trimmed)) return false;
    if (trimmed === '.' || trimmed === '..') return false;
    if (trimmed.length > 255) return false;
    return true;
  }

  private calculateDepth(parentId: string | null): number {
    if (parentId === null) return 0;
    const parent = this.folderRepo.getFolderById(parentId);
    if (!parent) return 0;
    return parent.depth + 1;
  }

  async createFolder(
    name: string,
    parentId: string | null
  ): Promise<{ ok: boolean; folder?: Folder; error?: string }> {
    try {
      if (!this.validateFolderName(name)) {
        return {
          ok: false,
          error: 'Tên thư mục không hợp lệ hoặc chứa ký tự đặc biệt (/ \\ : * ? " < > |).',
        };
      }

      const depth = this.calculateDepth(parentId);
      if (depth > 9) {
        return {
          ok: false,
          error: 'Không thể tạo thư mục vượt quá giới hạn 10 cấp (cấp 0 đến 9).',
        };
      }

      const folder = this.folderRepo.createFolder(name, parentId);

      // Nếu có libraryDir, tạo thư mục vật lý tương ứng trên ổ đĩa
      if (this.deps.libraryDir) {
        try {
          const rootDir = this.deps.libraryDir();
          if (rootDir) {
            const diskPath = path.join(rootDir, folder.path);
            await this.fsLib.mkdir(diskPath, { recursive: true });
          }
        } catch (e: any) {
          console.warn('[FolderService] Không thể tạo thư mục vật lý:', e?.message || e);
        }
      }

      this.deps.notify?.('folder:changed', { action: 'create', folder });
      return { ok: true, folder };
    } catch (err: any) {
      return { ok: false, error: err?.message || String(err) };
    }
  }

  async renameFolder(
    id: string,
    newName: string
  ): Promise<{ ok: boolean; error?: string }> {
    try {
      if (!this.validateFolderName(newName)) {
        return {
          ok: false,
          error: 'Tên thư mục mới không hợp lệ hoặc chứa ký tự đặc biệt.',
        };
      }

      const oldFolder = this.folderRepo.getFolderById(id);
      if (!oldFolder) {
        return { ok: false, error: 'Thư mục không tồn tại.' };
      }

      const oldPath = oldFolder.path;
      this.folderRepo.renameFolder(id, newName);
      const updatedFolder = this.folderRepo.getFolderById(id);

      // Đổi tên thư mục vật lý trên đĩa nếu có
      if (this.deps.libraryDir && updatedFolder) {
        try {
          const rootDir = this.deps.libraryDir();
          if (rootDir) {
            const oldDiskPath = path.join(rootDir, oldPath);
            const newDiskPath = path.join(rootDir, updatedFolder.path);
            await this.fsLib.rename(oldDiskPath, newDiskPath);
          }
        } catch (e: any) {
          console.warn('[FolderService] Không thể đổi tên thư mục vật lý:', e?.message || e);
        }
      }

      this.deps.notify?.('folder:changed', { action: 'rename', id, newName });
      return { ok: true };
    } catch (err: any) {
      return { ok: false, error: err?.message || String(err) };
    }
  }

  async moveFolder(
    id: string,
    newParentId: string | null
  ): Promise<{ ok: boolean; error?: string }> {
    try {
      const folder = this.folderRepo.getFolderById(id);
      if (!folder) {
        return { ok: false, error: 'Thư mục không tồn tại.' };
      }

      const oldPath = folder.path;
      this.folderRepo.moveFolder(id, newParentId);
      const updatedFolder = this.folderRepo.getFolderById(id);

      // Di chuyển thư mục vật lý trên đĩa nếu có
      if (this.deps.libraryDir && updatedFolder) {
        try {
          const rootDir = this.deps.libraryDir();
          if (rootDir) {
            const oldDiskPath = path.join(rootDir, oldPath);
            const newDiskPath = path.join(rootDir, updatedFolder.path);
            await this.fsLib.mkdir(path.dirname(newDiskPath), { recursive: true });
            await this.fsLib.rename(oldDiskPath, newDiskPath);
          }
        } catch (e: any) {
          console.warn('[FolderService] Không thể di chuyển thư mục vật lý:', e?.message || e);
        }
      }

      this.deps.notify?.('folder:changed', { action: 'move', id, newParentId });
      return { ok: true };
    } catch (err: any) {
      return { ok: false, error: err?.message || String(err) };
    }
  }

  async deleteFolder(id: string): Promise<{ ok: boolean; error?: string }> {
    try {
      const folder = this.folderRepo.getFolderById(id);
      if (!folder) {
        return { ok: false, error: 'Thư mục không tồn tại.' };
      }

      const oldPath = folder.path;
      this.folderRepo.deleteFolder(id);

      // Xoá thư mục vật lý trên đĩa nếu có
      if (this.deps.libraryDir) {
        try {
          const rootDir = this.deps.libraryDir();
          if (rootDir) {
            const diskPath = path.join(rootDir, oldPath);
            await this.fsLib.rm(diskPath, { recursive: true, force: true });
          }
        } catch (e: any) {
          console.warn('[FolderService] Không thể xoá thư mục vật lý:', e?.message || e);
        }
      }

      this.deps.notify?.('folder:changed', { action: 'delete', id });
      return { ok: true };
    } catch (err: any) {
      return { ok: false, error: err?.message || String(err) };
    }
  }

  getFolderTree(): Folder[] {
    return this.folderRepo.getFolderTree();
  }
}

