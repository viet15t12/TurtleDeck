// src/main/db/index.ts — DatabaseManager singleton & SQLite lifecycle management
import Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';
import { initSchema } from './schema.js';
import { migrateLegacyProgress, MigrationResult } from './migration.js';
import { SrsRepository } from './repositories/srs.repo.js';
import { DeckRepository } from './repositories/deck.repo.js';
import { StatsRepository } from './repositories/stats.repo.js';
import { MatchRepository } from './repositories/match.repo.js';
import { FolderRepository } from './repositories/folder.repo.js';
import { DeckLocationRepository } from './repositories/deck-location.repo.js';

export class DatabaseManager {
  private static instance: DatabaseManager | null = null;
  public db: Database.Database;
  public srs: SrsRepository;
  public deck: DeckRepository;
  public stats: StatsRepository;
  public match: MatchRepository;
  public folder: FolderRepository;
  public deckLocation: DeckLocationRepository;
  public lastMigrationResult: MigrationResult | null = null;

  public constructor(dbPathOrMemory = ':memory:', userDataPath?: string) {
    if (dbPathOrMemory !== ':memory:') {
      const dir = path.dirname(dbPathOrMemory);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    }

    this.db = new Database(dbPathOrMemory, { timeout: 5000 });

    if (dbPathOrMemory !== ':memory:') {
      this.db.pragma('journal_mode = WAL');
      this.db.pragma('synchronous = NORMAL');
    }
    this.db.pragma('foreign_keys = ON');
    this.db.pragma('temp_store = MEMORY');
    this.db.pragma('cache_size = -32000');

    initSchema(this.db);

    if (userDataPath) {
      this.lastMigrationResult = migrateLegacyProgress(this.db, userDataPath);
    }

    this.srs = new SrsRepository(this.db);
    this.deck = new DeckRepository(this.db);
    this.stats = new StatsRepository(this.db);
    this.match = new MatchRepository(this.db);
    this.folder = new FolderRepository(this.db);
    this.deckLocation = new DeckLocationRepository(this.db);
  }

  public static getInstance(userDataPath?: string): DatabaseManager {
    if (!DatabaseManager.instance) {
      if (!userDataPath) throw new Error('DatabaseManager requires userDataPath on initial call');
      const dbPath = path.join(userDataPath, 'studyapp.db');
      DatabaseManager.instance = new DatabaseManager(dbPath, userDataPath);
    }
    return DatabaseManager.instance;
  }

  /**
   * Tạo cơ sở dữ liệu in-memory cho Unit Tests
   */
  public static createInMemory(): DatabaseManager {
    return new DatabaseManager(':memory:');
  }

  /**
   * Sao lưu cơ sở dữ liệu an toàn khi đang ở WAL mode bằng db.backup() hoặc VACUUM INTO
   */
  public async backup(destFilePath: string): Promise<void> {
    const destDir = path.dirname(destFilePath);
    if (!fs.existsSync(destDir)) {
      fs.mkdirSync(destDir, { recursive: true });
    }
    await this.db.backup(destFilePath);
  }

  public close(): void {
    if (this.db && this.db.open) {
      try {
        this.db.pragma('wal_checkpoint(TRUNCATE)');
      } catch {}
      this.db.close();
    }
    if (DatabaseManager.instance === this) {
      DatabaseManager.instance = null;
    }
  }
}

