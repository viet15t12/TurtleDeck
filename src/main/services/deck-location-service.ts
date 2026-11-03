// src/main/services/deck-location-service.ts — Business logic quản lý vị trí bộ thẻ và liên kết (không import 'electron')
import path from 'node:path';
import fs from 'node:fs/promises';
import { Result, DeckLocation } from '../../core/types/folder.types.js';
import { DeckLocationRepository } from '../db/repositories/deck-location.repo.js';
import { FolderRepository } from '../db/repositories/folder.repo.js';
import { DeckRepository } from '../db/repositories/deck.repo.js';
import * as sdeck from '../../core/sdeck.js';

export interface DeckLocationServiceDeps {
  fs?: typeof fs;
  notify?: (channel: string, payload: any) => void;
  folderRepo?: FolderRepository;
  deckRepo?: DeckRepository;
  libraryDir?: () => string;
}

export class DeckLocationService {
  private fsLib: typeof fs;

  constructor(
    private locationRepo: DeckLocationRepository,
    private deckService: any,
    private deps: DeckLocationServiceDeps = {}
  ) {
    this.fsLib = deps.fs || fs;
  }

  private validatePath(p: string): boolean {
    if (!p || typeof p !== 'string') return false;
    return p.trim().toLowerCase().endsWith('.sdeck');
  }

  private async createSymlink(source: string, target: string): Promise<Result<void>> {
    try {
      const targetDir = path.dirname(target);
      await this.fsLib.mkdir(targetDir, { recursive: true });

      try {
        await this.fsLib.unlink(target);
      } catch {}

      await this.fsLib.symlink(path.resolve(source), target, 'file');
      return { ok: true, data: undefined };
    } catch (err: any) {
      return { ok: false, error: `Không thể tạo liên kết: ${err?.message || err}` };
    }
  }

  async moveDeck(
    deckId: string,
    newFolderId: string | null
  ): Promise<Result<void>> {
    try {
      const locations = this.locationRepo.getLocationsByDeck(deckId);
      let loc = locations.find(l => !l.isLink) || locations[0];

      // Nếu chưa có trong deck_locations, thử tra cứu qua deckRepo
      if (!loc && this.deps.deckRepo) {
        const deckRecord = this.deps.deckRepo.getDeck(deckId);
        if (deckRecord?.filePath) {
          loc = this.locationRepo.addLocation(deckId, null, deckRecord.filePath, false);
        }
      }

      if (!loc) {
        return { ok: false, error: 'Không tìm thấy vị trí của bộ thẻ trong hệ thống.' };
      }

      if (loc.folderId === newFolderId) {
        return { ok: true, data: undefined };
      }

      // Xác định thư mục đích
      const rootDir = this.deps.libraryDir ? this.deps.libraryDir() : path.dirname(loc.filePath);
      let targetDir = rootDir;

      if (newFolderId !== null) {
        if (!this.deps.folderRepo) {
          return { ok: false, error: 'Folder repository chưa được khởi tạo.' };
        }
        const targetFolder = this.deps.folderRepo.getFolderById(newFolderId);
        if (!targetFolder) {
          return { ok: false, error: 'Thư mục đích không tồn tại.' };
        }
        targetDir = path.join(rootDir, targetFolder.path);
      }

      const fileName = path.basename(loc.filePath);
      const targetFilePath = path.join(targetDir, fileName);

      // Kiểm tra file nguồn hiện tại
      let sourcePath = loc.filePath;
      let sourceExists = false;
      try {
        await this.fsLib.access(sourcePath);
        sourceExists = true;
      } catch {}

      if (!sourceExists && this.deps.deckRepo) {
        const deckRecord = this.deps.deckRepo.getDeck(deckId);
        if (deckRecord?.filePath && deckRecord.filePath !== sourcePath) {
          try {
            await this.fsLib.access(deckRecord.filePath);
            sourcePath = deckRecord.filePath;
            sourceExists = true;
          } catch {}
        }
      }

      if (path.resolve(sourcePath) !== path.resolve(targetFilePath)) {
        await this.fsLib.mkdir(targetDir, { recursive: true });
        if (sourceExists) {
          try {
            await this.fsLib.rename(sourcePath, targetFilePath);
          } catch {
            // Nếu đổi tên khác partition/device, copy rồi xóa
            await this.fsLib.copyFile(sourcePath, targetFilePath);
            await this.fsLib.unlink(sourcePath);
          }
        }
      }

      this.locationRepo.moveLocation(loc.id, newFolderId, targetFilePath);

      // Cập nhật đường dẫn file_path trong bảng decks
      if (this.deps.deckRepo) {
        try {
          this.deps.deckRepo.updateFilePath(deckId, targetFilePath);
        } catch {}
      }

      this.deps.notify?.('deck:moved', { deckId, newFolderId, filePath: targetFilePath });
      return { ok: true, data: undefined };
    } catch (err: any) {
      return { ok: false, error: err?.message || String(err) };
    }
  }

  async linkDeck(
    deckId: string,
    targetFolderId: string | null
  ): Promise<Result<void>> {
    try {
      const locations = this.locationRepo.getLocationsByDeck(deckId);
      let sourceLoc = locations.find(l => !l.isLink) || locations[0];

      if (!sourceLoc && this.deps.deckRepo) {
        const deckRecord = this.deps.deckRepo.getDeck(deckId);
        if (deckRecord?.filePath) {
          sourceLoc = this.locationRepo.addLocation(deckId, null, deckRecord.filePath, false);
        }
      }

      if (!sourceLoc) {
        return { ok: false, error: 'Không tìm thấy file gốc của bộ thẻ để tạo liên kết.' };
      }

      if (sourceLoc.folderId === targetFolderId) {
        return { ok: false, error: 'Bộ thẻ đã tồn tại trong thư mục này.' };
      }

      const rootDir = this.deps.libraryDir ? this.deps.libraryDir() : path.dirname(sourceLoc.filePath);
      let targetDir = rootDir;

      if (targetFolderId !== null) {
        if (!this.deps.folderRepo) {
          return { ok: false, error: 'Folder repository chưa được khởi tạo.' };
        }
        const targetFolder = this.deps.folderRepo.getFolderById(targetFolderId);
        if (!targetFolder) {
          return { ok: false, error: 'Thư mục đích không tồn tại.' };
        }
        targetDir = path.join(rootDir, targetFolder.path);
      }

      const fileName = path.basename(sourceLoc.filePath);
      const targetFilePath = path.join(targetDir, fileName);

      const symlinkRes = await this.createSymlink(sourceLoc.filePath, targetFilePath);
      if (!symlinkRes.ok) {
        return symlinkRes;
      }

      this.locationRepo.addLocation(
        deckId,
        targetFolderId,
        targetFilePath,
        true,
        sourceLoc.filePath
      );

      this.deps.notify?.('deck:linked', { deckId, targetFolderId, filePath: targetFilePath });
      return { ok: true, data: undefined };
    } catch (err: any) {
      return { ok: false, error: err?.message || String(err) };
    }
  }

  async removeLocation(
    locationId: string,
    deleteFile: boolean
  ): Promise<Result<void>> {
    try {
      const loc = this.locationRepo.getLocationById(locationId);
      if (!loc) {
        return { ok: false, error: 'Vị trí không tồn tại.' };
      }

      if (deleteFile || loc.isLink) {
        try {
          await this.fsLib.unlink(loc.filePath);
        } catch (e: any) {
          console.warn('[DeckLocationService] Không thể xoá file/link:', e?.message || e);
        }
      }

      this.locationRepo.removeLocation(locationId);
      this.deps.notify?.('deck:unlinked', { locationId, deckId: loc.deckId });
      return { ok: true, data: undefined };
    } catch (err: any) {
      return { ok: false, error: err?.message || String(err) };
    }
  }

  async syncFromFileSystem(rootPath: string): Promise<Result<void>> {
    try {
      if (!this.deps.folderRepo) {
        return { ok: false, error: 'Folder repository chưa được khởi tạo.' };
      }

      const scanDir = async (currentDir: string, parentFolderId: string | null, depth: number) => {
        if (depth > 9) return;
        let dirents: any[];
        try {
          dirents = await this.fsLib.readdir(currentDir, { withFileTypes: true });
        } catch {
          return;
        }

        for (const ent of dirents) {
          if (ent.name.startsWith('.')) continue;
          const fullPath = path.join(currentDir, ent.name);

          if (ent.isDirectory()) {
            let folder = this.deps.folderRepo!.getChildren(parentFolderId).find(f => f.name === ent.name);
            if (!folder) {
              const relPath = path.relative(rootPath, fullPath).split(path.sep).join('/');
              const existingByPath = this.deps.folderRepo!.getFolderByPath(relPath);
              if (existingByPath) {
                folder = existingByPath;
              } else {
                folder = this.deps.folderRepo!.createFolder(ent.name, parentFolderId);
              }
            }
            await scanDir(fullPath, folder.id, depth + 1);
          } else if (ent.isFile() || ent.isSymbolicLink()) {
            if (!ent.name.toLowerCase().endsWith('.sdeck')) continue;
            if (ent.name.endsWith('.bak') || ent.name.endsWith('.tmp')) continue;

            let isLink = false;
            let linkTarget: string | null = null;
            try {
              const lstat = await this.fsLib.lstat(fullPath);
              if (lstat.isSymbolicLink()) {
                isLink = true;
                linkTarget = await this.fsLib.realpath(fullPath);
              }
            } catch {}

            try {
              const bytes = await this.fsLib.readFile(fullPath);
              const metaRes = (sdeck as any).readPackageMeta(bytes);
              if (metaRes?.ok && metaRes.deckText) {
                const parsed = JSON.parse(metaRes.deckText);
                const deckId = parsed?.meta?.id || parsed?.id;
                if (deckId) {
                  this.locationRepo.addLocation(deckId, parentFolderId, fullPath, isLink, linkTarget);
                }
              }
            } catch {}
          }
        }
      };

      await scanDir(rootPath, null, 0);
      return { ok: true, data: undefined };
    } catch (err: any) {
      return { ok: false, error: err?.message || String(err) };
    }
  }

  getAllLocations(): DeckLocation[] {
    return this.locationRepo.getAllLocations();
  }

  getLocationsByDeck(deckId: string): DeckLocation[] {
    return this.locationRepo.getLocationsByDeck(deckId);
  }

  getLocationsByFolder(folderId: string | null): DeckLocation[] {
    return this.locationRepo.getLocationsByFolder(folderId);
  }
}
