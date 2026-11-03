// src/main/db/repositories/deck-location.repo.ts — Quản lý vị trí lưu trữ và liên kết (symlink) của bộ thẻ
import crypto from 'node:crypto';
import type Database from 'better-sqlite3';
import { DeckLocation } from '../../../core/types/folder.types.js';

export interface DeckLocationRow {
  id: string;
  deck_id: string;
  folder_id: string | null;
  file_path: string;
  is_link: number;
  link_target: string | null;
  created_at: number;
}

function mapRow(row: DeckLocationRow): DeckLocation {
  return {
    id: row.id,
    deckId: row.deck_id,
    folderId: row.folder_id,
    filePath: row.file_path,
    isLink: Boolean(row.is_link),
    linkTarget: row.link_target,
    createdAt: row.created_at,
  };
}

export class DeckLocationRepository {
  private stmtInsert: Database.Statement;
  private stmtGetById: Database.Statement;
  private stmtGetByPath: Database.Statement;
  private stmtGetByDeck: Database.Statement;
  private stmtGetByFolder: Database.Statement;
  private stmtGetRootLocations: Database.Statement;
  private stmtUpdateFolderAndPath: Database.Statement;
  private stmtDeleteById: Database.Statement;
  private stmtDeleteByDeck: Database.Statement;
  private stmtDeleteByFolder: Database.Statement;

  constructor(private db: Database.Database) {
    this.stmtInsert = db.prepare(`
      INSERT INTO deck_locations (id, deck_id, folder_id, file_path, is_link, link_target, created_at)
      VALUES (@id, @deckId, @folderId, @filePath, @isLink, @linkTarget, @createdAt)
      ON CONFLICT(deck_id, folder_id) DO UPDATE SET
        file_path = excluded.file_path,
        is_link = excluded.is_link,
        link_target = excluded.link_target
    `);

    this.stmtGetById = db.prepare(`SELECT * FROM deck_locations WHERE id = ?`);
    this.stmtGetByPath = db.prepare(`SELECT * FROM deck_locations WHERE file_path = ?`);
    this.stmtGetByDeck = db.prepare(`SELECT * FROM deck_locations WHERE deck_id = ? ORDER BY created_at ASC`);
    this.stmtGetByFolder = db.prepare(`SELECT * FROM deck_locations WHERE folder_id = ? ORDER BY created_at ASC`);
    this.stmtGetRootLocations = db.prepare(`SELECT * FROM deck_locations WHERE folder_id IS NULL ORDER BY created_at ASC`);
    this.stmtUpdateFolderAndPath = db.prepare(`
      UPDATE deck_locations SET folder_id = @folderId, file_path = @filePath WHERE id = @id
    `);
    this.stmtDeleteById = db.prepare(`DELETE FROM deck_locations WHERE id = ?`);
    this.stmtDeleteByDeck = db.prepare(`DELETE FROM deck_locations WHERE deck_id = ?`);
    this.stmtDeleteByFolder = db.prepare(`DELETE FROM deck_locations WHERE folder_id = ?`);
  }

  getLocationById(id: string): DeckLocation | null {
    const row = this.stmtGetById.get(id) as DeckLocationRow | undefined;
    return row ? mapRow(row) : null;
  }

  getLocationByPath(filePath: string): DeckLocation | null {
    const row = this.stmtGetByPath.get(filePath) as DeckLocationRow | undefined;
    return row ? mapRow(row) : null;
  }

  getLocationsByDeck(deckId: string): DeckLocation[] {
    const rows = this.stmtGetByDeck.all(deckId) as DeckLocationRow[];
    return rows.map(mapRow);
  }

  getLocationsByFolder(folderId: string | null): DeckLocation[] {
    const rows = (folderId === null
      ? this.stmtGetRootLocations.all()
      : this.stmtGetByFolder.all(folderId)) as DeckLocationRow[];
    return rows.map(mapRow);
  }

  addLocation(
    deckId: string,
    folderId: string | null,
    filePath: string,
    isLink: boolean,
    linkTarget?: string | null
  ): DeckLocation {
    const now = Date.now();
    const id = crypto.randomUUID();

    // Đối với trường hợp folderId === null, do SQLite UNIQUE(deck_id, folder_id) coi các NULL là distinct,
    // ta kiểm tra và cập nhật nếu đã có bản ghi root của deckId này.
    if (folderId === null) {
      const existing = (this.db.prepare(
        `SELECT id FROM deck_locations WHERE deck_id = ? AND folder_id IS NULL LIMIT 1`
      ).get(deckId) as { id: string } | undefined);

      if (existing) {
        this.db.prepare(`
          UPDATE deck_locations
          SET file_path = ?, is_link = ?, link_target = ?
          WHERE id = ?
        `).run(filePath, isLink ? 1 : 0, linkTarget || null, existing.id);

        return {
          id: existing.id,
          deckId,
          folderId: null,
          filePath,
          isLink,
          linkTarget: linkTarget || null,
          createdAt: now,
        };
      }
    }

    this.stmtInsert.run({
      id,
      deckId,
      folderId,
      filePath,
      isLink: isLink ? 1 : 0,
      linkTarget: linkTarget || null,
      createdAt: now,
    });

    return {
      id,
      deckId,
      folderId,
      filePath,
      isLink,
      linkTarget: linkTarget || null,
      createdAt: now,
    };
  }

  moveLocation(locationId: string, newFolderId: string | null, newFilePath?: string): void {
    const loc = this.getLocationById(locationId);
    if (!loc) {
      throw new Error(`Location có id "${locationId}" không tồn tại.`);
    }

    const filePath = newFilePath || loc.filePath;
    this.stmtUpdateFolderAndPath.run({
      id: locationId,
      folderId: newFolderId,
      filePath,
    });
  }

  removeLocation(locationId: string): void {
    this.stmtDeleteById.run(locationId);
  }

  deleteLocationsByDeck(deckId: string): void {
    this.stmtDeleteByDeck.run(deckId);
  }

  deleteLocationsByFolder(folderId: string): void {
    this.stmtDeleteByFolder.run(folderId);
  }
}

